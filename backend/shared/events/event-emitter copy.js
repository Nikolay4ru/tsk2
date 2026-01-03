const logger = require('../utils/logger');

class EventEmitter {
  constructor() {
    this.listeners = new Map();
    this.redisPublisher = null;
    this.redisSubscriber = null;
    this.setupRedis();
  }

  async setupRedis() {
    try {
      const Redis = require('ioredis');
      
      // Create separate Redis clients for pub/sub
      this.redisPublisher = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });
      
      this.redisSubscriber = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      // Handle subscriber messages
      this.redisSubscriber.on('message', (channel, message) => {
        try {
          const data = JSON.parse(message);
          this.emitLocal(channel, data);
        } catch (error) {
          logger.error({ error: error.message, channel }, 'Failed to parse Redis message');
        }
      });

      this.redisSubscriber.on('pmessage', (pattern, channel, message) => {
        try {
          const data = JSON.parse(message);
          this.emitLocal(channel, data);
        } catch (error) {
          logger.error({ error: error.message, channel }, 'Failed to parse Redis pattern message');
        }
      });

      this.redisPublisher.on('error', (err) => {
        logger.error({ error: err.message }, 'Redis publisher error');
      });

      this.redisSubscriber.on('error', (err) => {
        logger.error({ error: err.message }, 'Redis subscriber error');
      });

      logger.info('Event emitter Redis setup complete');
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Failed to setup Redis for events');
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
      
      // Subscribe to Redis channel
      if (this.redisSubscriber) {
        if (event.includes('*')) {
          this.redisSubscriber.psubscribe(event);
          logger.debug({ pattern: event }, 'Subscribed to Redis pattern');
        } else {
          this.redisSubscriber.subscribe(event);
          logger.debug({ channel: event }, 'Subscribed to Redis channel');
        }
      }
    }
    
    this.listeners.get(event).add(callback);
    
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
      
      if (this.listeners.get(event).size === 0) {
        this.listeners.delete(event);
        
        // Unsubscribe from Redis
        if (this.redisSubscriber) {
          if (event.includes('*')) {
            this.redisSubscriber.punsubscribe(event);
          } else {
            this.redisSubscriber.unsubscribe(event);
          }
        }
      }
    }
  }

  emitLocal(event, data) {
    logger.debug({ event, type: data.type }, 'Emitting local event');
    
    // Emit to local listeners
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error({ error: error.message, event }, 'Event listener error');
        }
      });
    }

    // Check for wildcard listeners
    this.listeners.forEach((callbacks, pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(event)) {
          callbacks.forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              logger.error({ error: error.message, event, pattern }, 'Wildcard listener error');
            }
          });
        }
      }
    });
  }

  async publish(event, data) {
    try {
      if (!this.redisPublisher) {
        logger.warn('Redis publisher not available');
        return;
      }

      // Publish to Redis
      await this.redisPublisher.publish(event, JSON.stringify(data));
      
      logger.info({ event, type: data.type }, 'Event published to Redis');
    } catch (error) {
      logger.error({ error: error.message, event }, 'Failed to publish event');
      throw error;
    }
  }

  async close() {
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
    }
    if (this.redisPublisher) {
      await this.redisPublisher.quit();
    }
  }
}

module.exports = new EventEmitter();
