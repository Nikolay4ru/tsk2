// backend/shared/database/redis.js
// ============================================

const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisClient {
  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.subscriber = this.client.duplicate();

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('error', (err) => {
      logger.error('Redis error:', err);
    });
  }

  async get(key) {
    return await this.client.get(key);
  }

  async set(key, value, ttl = null) {
    if (ttl) {
      return await this.client.setex(key, ttl, value);
    }
    return await this.client.set(key, value);
  }

  async del(key) {
    return await this.client.del(key);
  }

  async exists(key) {
    return await this.client.exists(key);
  }

  async sadd(key, ...members) {
    return await this.client.sadd(key, ...members);
  }

  async srem(key, ...members) {
    return await this.client.srem(key, ...members);
  }

  async smembers(key) {
    return await this.client.smembers(key);
  }

  async sismember(key, member) {
    return await this.client.sismember(key, member);
  }

  async publish(channel, message) {
    return await this.client.publish(channel, message);
  }

  async subscribe(channels, callback) {
    if (!Array.isArray(channels)) {
      channels = [channels];
    }
    
    await this.subscriber.subscribe(...channels);
    
    this.subscriber.on('message', (channel, message) => {
      callback(channel, message);
    });
  }

  async psubscribe(patterns, callback) {
    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }
    
    await this.subscriber.psubscribe(...patterns);
    
    this.subscriber.on('pmessage', (pattern, channel, message) => {
      callback(pattern, channel, message);
    });
  }

  async close() {
    await this.client.quit();
    await this.subscriber.quit();
    logger.info('Redis connections closed');
  }
}

module.exports = new RedisClient();