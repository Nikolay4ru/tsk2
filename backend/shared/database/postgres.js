const { Pool } = require('pg');
const logger = require('../utils/logger');

class PostgresClient {
  constructor() {
    // Попробовать сначала отдельные параметры, потом connectionString
    let config;
    
    if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD) {
      // Используем отдельные параметры
      config = {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };
      console.log('PostgreSQL: Using separate parameters');
    } else if (process.env.DATABASE_URL) {
      // Используем connection string
      config = {
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };
      console.log('PostgreSQL: Using connection string');
    } else {
      throw new Error('No database configuration found');
    }

    this.pool = new Pool(config);

    this.pool.on('connect', () => {
      logger.info('PostgreSQL connected');
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL error:', err);
    });
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug({ query: text, duration, rows: result.rowCount }, 'Query executed');
      return result;
    } catch (error) {
      logger.error({ query: text, error: error.message }, 'Query failed');
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async transaction(callback) {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
    logger.info('PostgreSQL connection closed');
  }
}

module.exports = new PostgresClient();
