const Redis = require('ioredis');
const redis = require('../database/redis');
const logger = require('../utils/logger');

class EventEmitter {
  constructor() {
    this.subscriber = null;
    this.listeners = new Map();
    this.init();
  }

  async init() {
    try {
      // ✅ Создаем отдельный Redis клиент для подписки
      this.subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });
      
      this.subscriber.on('pmessage', (pattern, channel, message) => {
        try {
          const event = JSON.parse(message);
          console.log('📨 Redis pmessage:', { pattern, channel, type: event.type });
          
          this.listeners.forEach((callback, listenerPattern) => {
            if (this.matchPattern(channel, listenerPattern)) {
              console.log('✅ Triggering listener:', listenerPattern);
              callback(channel, event);
            }
          });
        } catch (error) {
          logger.error({ error: error.message }, 'Failed to process event');
        }
      });

      await this.subscriber.psubscribe('room:*', 'user:*');
      
      console.log('✅ EventEmitter initialized');
      logger.info('EventEmitter initialized');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize EventEmitter');
    }
  }

  matchPattern(channel, pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(channel);
  }

  async publish(channel, data) {
    try {
      const message = JSON.stringify(data);
      await redis.publish(channel, message);
      
      console.log('📤 Redis publish:', { channel, type: data.type });
      logger.info({ event: channel, type: data.type }, 'Event published');
    } catch (error) {
      logger.error({ channel, error: error.message }, 'Failed to publish event');
    }
  }

  on(pattern, callback) {
    console.log('📝 Listener registered:', pattern);
    this.listeners.set(pattern, callback);
  }

  off(pattern) {
    this.listeners.delete(pattern);
  }
}

module.exports = new EventEmitter();
