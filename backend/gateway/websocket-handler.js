const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../shared/utils/logger');
const userModel = require('../services/auth-service/models/user.model');
const eventEmitter = require('../shared/events/event-emitter');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server, 
      path: '/ws',
      perMessageDeflate: false,
    });

    this.clients = new Map();

    this.setupWebSocketServer();
    this.subscribeToRedis();

    logger.info('WebSocket server initialized');
  }

  setupWebSocketServer() {
    this.wss.on('connection', async (ws, req) => {
      console.log('New WebSocket connection attempt');

      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(1008, 'No token provided');
        return;
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const username = decoded.username || decoded.email;

        const connectionId = uuidv4();

        const client = {
          ws,
          userId,
          username,
          connectionId,
          subscriptions: new Set(),
        };

        this.clients.set(connectionId, client);

        await userModel.setOnline(userId);

        await eventEmitter.publish('user:status', {
          userId,
          isOnline: true,
        });

        logger.info({ userId, username, connectionId }, 'WebSocket connected');

        ws.on('message', (data) => this.handleMessage(client, data));
        ws.on('close', () => this.handleDisconnect(client));
        ws.on('error', (error) => logger.error({ error: error.message }, 'WebSocket error'));

        ws.send(JSON.stringify({ 
          type: 'connected', 
          data: { connectionId, userId, username } 
        }));

      } catch (error) {
        logger.error({ error: error.message }, 'WebSocket authentication failed');
        ws.close(1008, 'Invalid token');
      }
    });
  }

  handleMessage(client, data) {
    try {
      const message = JSON.parse(data);

      console.log('📨 WS Message:', {
        type: message.type,
        from: client.userId,
      });

      if (!message.type) {
        console.error('❌ No message type');
        return;
      }

      switch (message.type) {
        case 'subscribe':
          if (message.payload?.channel) {
            this.handleSubscribe(client, message.payload.channel);
          }
          break;

        case 'unsubscribe':
          if (message.payload?.channel) {
            this.handleUnsubscribe(client, message.payload.channel);
          }
          break;

        case 'ping':
          client.ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'typing':
          this.handleTyping(client, message.payload);
          break;

        case 'webrtc-signal':
          this.handleWebRTCSignal(client, message);
          break;

        default:
          logger.warn({ type: message.type }, 'Unknown message type');
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Handle message error');
    }
  }

  handleSubscribe(client, channel) {
    client.subscriptions.add(channel);
    console.log(`✅ ${client.userId} subscribed to ${channel}`);
    client.ws.send(JSON.stringify({
      type: 'subscribed',
      data: { channel }
    }));
  }

  handleUnsubscribe(client, channel) {
    client.subscriptions.delete(channel);
    console.log(`✅ ${client.userId} unsubscribed from ${channel}`);
    client.ws.send(JSON.stringify({
      type: 'unsubscribed',
      data: { channel }
    }));
  }

  async handleTyping(client, payload) {
    const { roomId, isTyping } = payload;

    if (!roomId) return;

    await eventEmitter.publish(`room:${roomId}`, {
      type: 'typing',
      data: {
        userId: client.userId,
        username: client.username,
        isTyping,
      },
    });
  }

  handleWebRTCSignal(client, message) {
    const { callId, roomId, signal, targetUserId, signalType } = message;

    console.log('📞 WebRTC Signal:', { 
      signalType, 
      callId, 
      from: client.userId, 
      to: targetUserId,
      roomId,
    });

    if (!signal || !callId) {
      console.error('❌ Invalid WebRTC signal');
      return;
    }

    // 1-1 call
    if (targetUserId) {
      console.log('🔍 Looking for target user:', targetUserId);
      const onlineUsers = Array.from(this.clients.values()).map(c => c.userId);
      console.log('🔍 Online users:', onlineUsers);

      const targetClient = Array.from(this.clients.values())
        .find(c => c.userId === targetUserId);

      if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
        targetClient.ws.send(JSON.stringify({
          type: 'webrtc-signal',
          callId,
          fromUserId: client.userId,
          signalType,
          signal,
        }));
        console.log('✅ Signal sent to target user:', targetUserId);
      } else {
        console.warn('⚠️ Target user not connected:', targetUserId);
      }
    } 
    // Conference call
    else if (roomId) {
      let sent = 0;
      this.clients.forEach(c => {
        if (c.userId !== client.userId && 
            c.subscriptions.has(`room:${roomId}`) &&
            c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'webrtc-signal',
            callId,
            fromUserId: client.userId,
            signalType,
            signal,
          }));
          sent++;
        }
      });
      console.log(`✅ Signal broadcast to ${sent} users in room:${roomId}`);
    }
  }

  async handleDisconnect(client) {
    console.log('WebSocket disconnected:', client.userId);

    this.clients.delete(client.connectionId);

    try {
      await userModel.setOffline(client.userId);

      await eventEmitter.publish('user:status', {
        userId: client.userId,
        isOnline: false,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Handle disconnect error');
    }
  }

  subscribeToRedis() {
    // ✅ СЛУШАЕМ room:* события
    eventEmitter.on('room:*', (channel, event) => {
      console.log('📢 Room event:', { channel, type: event.type });
      this.broadcastToChannel(channel, event);
    });

    // ✅ СЛУШАЕМ user:* события
    eventEmitter.on('user:*', (channel, event) => {
      console.log('📢 User event:', { channel, userId: event.userId });
      this.broadcastUserEvent(event);
    });

    logger.info('Subscribed to Redis events');
  }

  broadcastToChannel(channel, event) {
    const { type, data } = event;
    
    let sent = 0;
    this.clients.forEach(client => {
      if (client.subscriptions.has(channel) && 
          client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'event',
          channel,
          data: { type, data }
        }));
        sent++;
      }
    });
    
    console.log(`✅ Broadcast to ${sent} clients on ${channel}`);
  }

  broadcastUserEvent(event) {
    // Broadcast user status to all connected clients
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'event',
          channel: 'global',
          data: { type: 'user_status', data: event }
        }));
      }
    });
  }
}

module.exports = WebSocketHandler;
