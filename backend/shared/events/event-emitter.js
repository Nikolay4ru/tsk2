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
      this.subscriber = redis.duplicate();
      
      this.subscriber.on('message', (channel, message) => {
        try {
          const event = JSON.parse(message);
          console.log('📨 Redis message received:', { channel, type: event.type });
          
          this.listeners.forEach((callback, pattern) => {
            if (this.matchPattern(channel, pattern)) {
              console.log('✅ Triggering listener for pattern:', pattern);
              callback(event);
            }
          });
        } catch (error) {
          logger.error({ error: error.message }, 'Failed to process event');
        }
      });

      await this.subscriber.psubscribe('room:*');
      await this.subscriber.psubscribe('user:*');
      
      console.log('✅ EventEmitter initialized and subscribed to Redis patterns');
      logger.info('EventEmitter initialized');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize EventEmitter');
    }
  }

  matchPattern(channel, pattern) {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return regex.test(channel);
  }

  async publish(channel, data) {
    try {
      const message = JSON.stringify(data);
      await redis.publish(channel, message);
      
      console.log('📤 Event published to Redis:', { 
        channel, 
        type: data.type,
        hasChannel: !!data._channel 
      });
      
      logger.info({ event: channel, type: data.type }, 'Event published to Redis');
    } catch (error) {
      logger.error({ channel, error: error.message }, 'Failed to publish event');
    }
  }

  on(pattern, callback) {
    console.log('📝 Registering listener for pattern:', pattern);
    this.listeners.set(pattern, callback);
  }

  off(pattern) {
    this.listeners.delete(pattern);
  }
}

module.exports = new EventEmitter();
