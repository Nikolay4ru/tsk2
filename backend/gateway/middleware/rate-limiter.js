// backend/gateway/middleware/rate-limiter.js
// ============================================

const rateLimit = require('express-rate-limit');
const redis = require('../../shared/database/redis');
const logger = require('../../shared/utils/logger');

// In-memory fallback store
const MemoryStore = require('express-rate-limit').MemoryStore;

// Redis store для распределенного rate limiting
class RedisStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'rl:';
    this.client = redis.client;
  }

  async increment(key) {
    const fullKey = this.prefix + key;
    const current = await this.client.incr(fullKey);
    
    if (current === 1) {
      await this.client.expire(fullKey, 60); // 1 minute window
    }
    
    return {
      totalHits: current,
      resetTime: new Date(Date.now() + 60000),
    };
  }

  async decrement(key) {
    const fullKey = this.prefix + key;
    await this.client.decr(fullKey);
  }

  async resetKey(key) {
    const fullKey = this.prefix + key;
    await this.client.del(fullKey);
  }
}

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: process.env.NODE_ENV === 'production' ? new RedisStore() : new MemoryStore(),
  keyGenerator: (req) => {
    // Rate limit per user if authenticated, otherwise per IP
    return req.userId || req.ip;
  },
  handler: (req, res) => {
    logger.warn({ ip: req.ip, userId: req.userId }, 'Rate limit exceeded');
    res.status(429).json({
      error: 'Too many requests, please try again later',
    });
  },
});

module.exports = limiter;