// backend/gateway/websocket-handler.js
// ============================================

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const redis = require('../shared/database/redis');
const eventEmitter = require('../shared/events/event-emitter');
const logger = require('../shared/utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      clientTracking: true,
    });
    
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.subscriptions = new Map(); // connectionId -> Set of channels
    
    this.init();
  }

  init() {
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    
    // Heartbeat to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          this.handleDisconnect(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds

    // Listen to Redis events and broadcast to relevant clients
    this.setupEventBroadcasting();

    logger.info('WebSocket server initialized');
  }

  async handleConnection(ws, req) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      ws.userId = decoded.userId;
      ws.userEmail = decoded.email;
      ws.connectionId = uuidv4();
      ws.isAlive = true;
      ws.subscriptions = new Set();

      // Store connection
      if (!this.clients.has(ws.userId)) {
        this.clients.set(ws.userId, new Set());
      }
      this.clients.get(ws.userId).add(ws);
      this.subscriptions.set(ws.connectionId, new Set());

      // Mark user as online
      await redis.sadd('online_users', ws.userId);
      await this.publishUserStatus(ws.userId, 'online');

      // Setup message handlers
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('error', (error) => {
        logger.error({ userId: ws.userId, error: error.message }, 'WebSocket error');
      });

      // Send connection confirmation
      this.send(ws, {
        type: 'connected',
        data: {
          connectionId: ws.connectionId,
          userId: ws.userId,
        },
      });

      logger.info({ userId: ws.userId, connectionId: ws.connectionId }, 'WebSocket connected');

    } catch (error) {
      logger.error({ error: error.message }, 'WebSocket authentication failed');
      ws.close(1008, 'Authentication failed');
    }
  }

  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      const { type, payload } = message;

      logger.debug({ userId: ws.userId, type, payload }, 'WebSocket message received');

      switch (type) {
        case 'subscribe':
          await this.handleSubscribe(ws, payload);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(ws, payload);
          break;

        case 'typing':
          await this.handleTyping(ws, payload);
          break;

        case 'ping':
          this.send(ws, { type: 'pong', data: { timestamp: Date.now() } });
          break;

        default:
          this.send(ws, { type: 'error', data: { message: 'Unknown message type' } });
      }

    } catch (error) {
      logger.error({ userId: ws.userId, error: error.message }, 'Failed to handle message');
      this.send(ws, { type: 'error', data: { message: 'Invalid message format' } });
    }
  }

  async handleSubscribe(ws, payload) {
    const { channel } = payload;

    if (!channel) {
      this.send(ws, { type: 'error', data: { message: 'Channel is required' } });
      return;
    }

    // Verify user has access to this channel
    const hasAccess = await this.verifyChannelAccess(ws.userId, channel);
    if (!hasAccess) {
      this.send(ws, { type: 'error', data: { message: 'Access denied' } });
      return;
    }

    // Add to subscriptions
    ws.subscriptions.add(channel);
    this.subscriptions.get(ws.connectionId).add(channel);

    await redis.sadd(`subscription:${ws.userId}`, channel);

    this.send(ws, { 
      type: 'subscribed', 
      data: { channel } 
    });

    logger.debug({ userId: ws.userId, channel }, 'Subscribed to channel');
  }

  async handleUnsubscribe(ws, payload) {
    const { channel } = payload;

    if (!channel) {
      this.send(ws, { type: 'error', data: { message: 'Channel is required' } });
      return;
    }

    ws.subscriptions.delete(channel);
    this.subscriptions.get(ws.connectionId).delete(channel);

    await redis.srem(`subscription:${ws.userId}`, channel);

    this.send(ws, { 
      type: 'unsubscribed', 
      data: { channel } 
    });

    logger.debug({ userId: ws.userId, channel }, 'Unsubscribed from channel');
  }

  async handleTyping(ws, payload) {
    const { roomId, isTyping } = payload;

    if (!roomId) return;

    // Broadcast typing indicator to room
    await eventEmitter.publish(`room:${roomId}:typing`, {
      userId: ws.userId,
      username: ws.userEmail.split('@')[0], // temporary, should get from DB
      isTyping,
      timestamp: Date.now(),
    });
  }

  async handleDisconnect(ws) {
    if (!ws.userId) return;

    // Remove from clients map
    if (this.clients.has(ws.userId)) {
      this.clients.get(ws.userId).delete(ws);
      if (this.clients.get(ws.userId).size === 0) {
        this.clients.delete(ws.userId);
        
        // User has no more connections - mark as offline
        await redis.srem('online_users', ws.userId);
        await this.publishUserStatus(ws.userId, 'offline');
      }
    }

    // Clean up subscriptions
    if (this.subscriptions.has(ws.connectionId)) {
      this.subscriptions.delete(ws.connectionId);
    }

    logger.info({ userId: ws.userId, connectionId: ws.connectionId }, 'WebSocket disconnected');
  }

  async verifyChannelAccess(userId, channel) {
    // Parse channel type and ID
    const [type, id] = channel.split(':');

    try {
      switch (type) {
        case 'room':
          // Check if user is member of the room
          const postgres = require('../shared/database/postgres');
          const { rows } = await postgres.query(
            'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
            [id, userId]
          );
          return rows.length > 0;

        case 'user':
          // User can only subscribe to their own channel
          return id === userId;

        case 'task':
          // Check if user is creator, assignee, or watcher
          const { rows: taskRows } = await postgres.query(
            `SELECT 1 FROM tasks 
             WHERE id = $1 AND (creator_id = $2 OR assignee_id = $2)
             UNION
             SELECT 1 FROM task_watchers WHERE task_id = $1 AND user_id = $2`,
            [id, userId]
          );
          return taskRows.length > 0;

        case 'doc':
          // Check if user is owner or collaborator
          const { rows: docRows } = await postgres.query(
            `SELECT 1 FROM documents WHERE id = $1 AND owner_id = $2
             UNION
             SELECT 1 FROM document_collaborators WHERE document_id = $1 AND user_id = $2`,
            [id, userId]
          );
          return docRows.length > 0;

        default:
          return false;
      }
    } catch (error) {
      logger.error({ userId, channel, error: error.message }, 'Failed to verify channel access');
      return false;
    }
  }

  setupEventBroadcasting() {
    // Listen to all events and broadcast to subscribed clients
    eventEmitter.on('room:*', (data) => this.broadcastToChannel('room', data));
    eventEmitter.on('user:*', (data) => this.broadcastToChannel('user', data));
    eventEmitter.on('task:*', (data) => this.broadcastToChannel('task', data));
    eventEmitter.on('doc:*', (data) => this.broadcastToChannel('doc', data));
  }

  async broadcastToChannel(type, data) {
    // Broadcast to all clients subscribed to this channel
    for (const [connectionId, channels] of this.subscriptions.entries()) {
      // Find matching channel
      const matchingChannel = Array.from(channels).find(ch => {
        const [chType, chId] = ch.split(':');
        return chType === type;
      });

      if (matchingChannel) {
        // Find the WebSocket for this connection
        for (const userClients of this.clients.values()) {
          for (const ws of userClients) {
            if (ws.connectionId === connectionId && ws.readyState === WebSocket.OPEN) {
              this.send(ws, {
                type: 'event',
                channel: matchingChannel,
                data,
              });
            }
          }
        }
      }
    }
  }

  async publishUserStatus(userId, status) {
    await eventEmitter.publish('user:status', {
      userId,
      status,
      timestamp: Date.now(),
    });
  }

  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcastToUser(userId, message) {
    if (this.clients.has(userId)) {
      this.clients.get(userId).forEach(ws => {
        this.send(ws, message);
      });
    }
  }

  getOnlineUsers() {
    return Array.from(this.clients.keys());
  }

  close() {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
    logger.info('WebSocket server closed');
  }
}

module.exports = WebSocketHandler;