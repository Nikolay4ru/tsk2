// backend/shared/events/event-emitter.js
// ============================================

const redis = require('../database/redis');
const logger = require('../utils/logger');

class EventEmitter {
  constructor() {
    this.handlers = new Map();
    this.setupSubscriptions();
  }

  async setupSubscriptions() {
    // Subscribe to all channels with pattern matching
    await redis.psubscribe(['room:*', 'user:*', 'task:*', 'doc:*'], (pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        this.emit(channel, data);
      } catch (error) {
        logger.error({ channel, error: error.message }, 'Failed to parse event message');
      }
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  off(event, handler) {
    if (!this.handlers.has(event)) return;
    const handlers = this.handlers.get(event);
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.handlers.has(event)) return;
    const handlers = this.handlers.get(event);
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        logger.error({ event, error: error.message }, 'Event handler error');
      }
    });
  }

  async publish(channel, data) {
    try {
      await redis.publish(channel, JSON.stringify(data));
      logger.debug({ channel, data }, 'Event published');
    } catch (error) {
      logger.error({ channel, error: error.message }, 'Failed to publish event');
      throw error;
    }
  }
}

module.exports = new EventEmitter();