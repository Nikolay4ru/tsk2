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
    
    this.clients = new Map();
    this.subscriptions = new Map();
    
    this.init();
  }

  init() {
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.debug({ userId: ws.userId }, 'Terminating dead connection');
          this.handleDisconnect(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.setupEventBroadcasting();

    logger.info('WebSocket server initialized');
  }

  async handleConnection(ws, req) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    logger.info('New WebSocket connection attempt');

    if (!token) {
      logger.warn('WebSocket connection rejected: no token');
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      ws.userId = decoded.userId;
      ws.userEmail = decoded.email;
      ws.connectionId = uuidv4();
      ws.isAlive = true;
      ws.subscriptions = new Set();

      if (!this.clients.has(ws.userId)) {
        this.clients.set(ws.userId, new Set());
      }
      this.clients.get(ws.userId).add(ws);
      this.subscriptions.set(ws.connectionId, new Set());

      const postgres = require('../shared/database/postgres');
      try {
        const { rows } = await postgres.query(
          'SELECT username FROM users WHERE id = $1',
          [ws.userId]
        );
        ws.username = rows[0]?.username || ws.userEmail.split('@')[0];
      } catch (error) {
        ws.username = ws.userEmail.split('@')[0];
        logger.error({ error: error.message }, 'Failed to fetch username');
      }

      await redis.sadd('online_users', ws.userId);
      await this.publishUserStatus(ws.userId, 'online');

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnect(ws));
      ws.on('error', (error) => {
        logger.error({ userId: ws.userId, error: error.message }, 'WebSocket error');
      });

      this.send(ws, {
        type: 'connected',
        data: {
          connectionId: ws.connectionId,
          userId: ws.userId,
          username: ws.username,
        },
      });

      logger.info({ userId: ws.userId, username: ws.username, connectionId: ws.connectionId }, 'WebSocket connected');

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

    const hasAccess = await this.verifyChannelAccess(ws.userId, channel);
    if (!hasAccess) {
      logger.warn({ userId: ws.userId, channel }, 'Access denied to channel');
      this.send(ws, { type: 'error', data: { message: 'Access denied' } });
      return;
    }

    ws.subscriptions.add(channel);
    this.subscriptions.get(ws.connectionId).add(channel);

    await redis.sadd(`subscription:${ws.userId}`, channel);

    this.send(ws, { 
      type: 'subscribed', 
      data: { channel } 
    });

    logger.info({ userId: ws.userId, channel }, 'Subscribed to channel');
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

    logger.info({ userId: ws.userId, channel }, 'Unsubscribed from channel');
  }

  async handleTyping(ws, payload) {
    const { roomId, isTyping } = payload;

    if (!roomId) return;

    logger.debug({ userId: ws.userId, username: ws.username, roomId, isTyping }, 'Typing indicator');

    const channel = `room:${roomId}`;
    
    this.broadcastToChannel(
      channel,
      {
        type: 'typing',
        data: {
          userId: ws.userId,
          username: ws.username,
          isTyping,
          timestamp: Date.now(),
        },
      },
      ws.userId
    );
  }

  async handleDisconnect(ws) {
    if (!ws.userId) return;

    if (this.clients.has(ws.userId)) {
      this.clients.get(ws.userId).delete(ws);
      if (this.clients.get(ws.userId).size === 0) {
        this.clients.delete(ws.userId);
        
        await redis.srem('online_users', ws.userId);
        await this.publishUserStatus(ws.userId, 'offline');
      }
    }

    if (this.subscriptions.has(ws.connectionId)) {
      this.subscriptions.delete(ws.connectionId);
    }

    logger.info({ userId: ws.userId, connectionId: ws.connectionId }, 'WebSocket disconnected');
  }

  async verifyChannelAccess(userId, channel) {
    const [type, id] = channel.split(':');

    try {
      const postgres = require('../shared/database/postgres');
      
      switch (type) {
        case 'room':
          const { rows } = await postgres.query(
            'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
            [id, userId]
          );
          return rows.length > 0;

        case 'user':
          return id === userId;

        case 'task':
          const { rows: taskRows } = await postgres.query(
            `SELECT 1 FROM tasks 
             WHERE id = $1 AND (creator_id = $2 OR assignee_id = $2)
             UNION
             SELECT 1 FROM task_watchers WHERE task_id = $1 AND user_id = $2`,
            [id, userId]
          );
          return taskRows.length > 0;

        default:
          return false;
      }
    } catch (error) {
      logger.error({ userId, channel, error: error.message }, 'Failed to verify channel access');
      return false;
    }
  }

  setupEventBroadcasting() {
    eventEmitter.on('room:*', (data) => {
      const channel = data._channel || 'room:unknown';
      const excludeUserId = data._excludeUserId || null;
      
      logger.debug({ channel, type: data.type, excludeUserId }, 'Broadcasting room event');
      
      this.broadcastToChannel(channel, data, excludeUserId);
    });

    logger.info('Event broadcasting setup complete');
  }

  broadcastToChannel(channel, data, excludeUserId = null) {
    let sentCount = 0;
    
    for (const [connectionId, channels] of this.subscriptions.entries()) {
      if (channels.has(channel)) {
        for (const userClients of this.clients.values()) {
          for (const ws of userClients) {
            if (ws.connectionId === connectionId && ws.readyState === WebSocket.OPEN) {
              if (excludeUserId && ws.userId === excludeUserId) {
                continue;
              }
              
              this.send(ws, {
                type: 'event',
                channel,
                data,
              });
              sentCount++;
            }
          }
        }
      }
    }

    logger.debug({ channel, sentCount, excludeUserId }, 'Event broadcasted');
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
