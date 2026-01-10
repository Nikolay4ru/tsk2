require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const jwt = require('jsonwebtoken');
const postgres = require('../../shared/database/postgres');
const redis = require('../../shared/database/redis');
const { hashPassword, comparePassword, generateToken } = require('../../shared/utils/crypto');
const { schemas, validate } = require('../../shared/validation/schemas');
const logger = require('../../shared/utils/logger');

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Register
app.post('/register', async (req, res) => {
  try {
    const data = validate(schemas.register, req.body);
    
    const { rows: existing } = await postgres.query(
      'SELECT id FROM users WHERE email = $1',
      [data.email]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    const passwordHash = await hashPassword(data.password);
    
    const { rows } = await postgres.query(
      `INSERT INTO users (email, username, password_hash, status, created_at)
       VALUES ($1, $2, $3, 'online', NOW())
       RETURNING id, email, username, avatar_url, status, created_at`,
      [data.email, data.username, passwordHash]
    );
    
    const user = rows[0];
    
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    const refreshToken = generateToken();
    const refreshExpires = new Date();
    refreshExpires.setDate(refreshExpires.getDate() + 7);
    
    await postgres.query(
      'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, refreshExpires]
    );
    
    logger.info({ userId: user.id, email: user.email }, 'User registered');
    
    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
    
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Register error');
    if (error.status) {
      return res.status(error.status).json(error);
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const data = validate(schemas.login, req.body);
    
    const { rows } = await postgres.query(
      'SELECT * FROM users WHERE email = $1',
      [data.email]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = rows[0];
    
    const isValid = await comparePassword(data.password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    await postgres.query(
      'UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2',
      ['online', user.id]
    );
    
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    const refreshToken = generateToken();
    const refreshExpires = new Date();
    refreshExpires.setDate(refreshExpires.getDate() + 7);
    
    await postgres.query(
      'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, refreshExpires]
    );
    
    await redis.sadd('online_users', user.id);
    
    logger.info({ userId: user.id, email: user.email }, 'User logged in');
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar_url: user.avatar_url,
        status: 'online',
      },
      accessToken,
      refreshToken,
    });
    
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Login error');
    if (error.status) {
      return res.status(error.status).json(error);
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Refresh token
app.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    const { rows } = await postgres.query(
      `SELECT s.*, u.email FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.refresh_token = $1 AND s.expires_at > NOW()`,
      [refreshToken]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    const session = rows[0];
    
    const accessToken = jwt.sign(
      { userId: session.user_id, email: session.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({ accessToken });
    
  } catch (error) {
    logger.error({ error: error.message }, 'Refresh token error');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Verify token
app.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-user-id'];
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const { rows } = await postgres.query(
      'SELECT id, email, username, avatar_url, status FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(rows[0]);
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    logger.error({ error: error.message }, 'Verify token error');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Logout
app.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-user-id'];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        await postgres.query(
          'UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2',
          ['offline', decoded.userId]
        );
        
        await redis.srem('online_users', decoded.userId);
        
        await postgres.query(
          'DELETE FROM sessions WHERE user_id = $1',
          [decoded.userId]
        );
        
        logger.info({ userId: decoded.userId }, 'User logged out');
      } catch (err) {
        // Token invalid, but still logout
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    logger.error({ error: error.message }, 'Logout error');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`Auth service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing connections...');
  await postgres.close();
  await redis.close();
  process.exit(0);
});