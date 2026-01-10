require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('../shared/utils/logger');
const authMiddleware = require('../shared/middleware/auth.middleware');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gateway' });
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP',
});

app.use('/auth/login', limiter);
app.use('/auth/register', limiter);
app.use('/api/auth/login', limiter);
app.use('/api/auth/register', limiter);

console.log('=================================');
console.log('🚀 Setting up Gateway routes...');
console.log('=================================');

// ============================================
// FILE UPLOAD ROUTES - С /api ПРЕФИКСОМ
// ============================================

const avatarProxyConfig = {
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: {
    '^/api/auth': '',
    '^/auth': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    if (req.userId) {
      proxyReq.setHeader('X-User-Id', req.userId);
    }
    console.log('📤 PROXYING Avatar TO:', 'http://localhost:3001' + proxyReq.path);
    logger.info({ userId: req.userId }, 'Proxying avatar upload');
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('📥 Avatar proxy response:', proxyRes.statusCode);
  },
  onError: (err, req, res) => {
    console.error('❌ Avatar PROXY ERROR:', err.message);
    logger.error({ error: err.message }, 'Avatar upload proxy error');
  },
};

// Avatar upload - С /api префиксом
app.post('/api/auth/upload-avatar', 
  (req, res, next) => {
    console.log('🔵 [/api/auth/upload-avatar] Route HIT!');
    next();
  },
  authMiddleware,
  (req, res, next) => {
    console.log('✅ Auth passed, user:', req.userId);
    next();
  },
  createProxyMiddleware(avatarProxyConfig)
);

console.log('✅ POST /api/auth/upload-avatar configured');

// Avatar upload - БЕЗ /api префикса (на всякий случай)
app.post('/auth/upload-avatar', 
  authMiddleware,
  createProxyMiddleware(avatarProxyConfig)
);

console.log('✅ POST /auth/upload-avatar configured');

// File upload для чатов
const fileProxyConfig = {
  target: 'http://localhost:3002',
  changeOrigin: true,
  pathRewrite: {
    '^/api/chat': '',
    '^/chat': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    if (req.userId) {
      proxyReq.setHeader('X-User-Id', req.userId);
    }
    logger.info({ userId: req.userId }, 'Proxying file upload');
  },
};

app.post('/api/chat/files/upload', authMiddleware, createProxyMiddleware(fileProxyConfig));
app.post('/chat/files/upload', authMiddleware, createProxyMiddleware(fileProxyConfig));

console.log('✅ POST /api/chat/files/upload configured');
console.log('✅ POST /chat/files/upload configured');

// ============================================
// REGULAR ROUTES - JSON parsing
// ============================================

app.use(express.json({ limit: '10mb' }));


// ============================================
// MEDIA SERVICE PROXY - MediaSoup SFU
// ============================================

const mediaProxyConfig = {
  target: 'http://localhost:3004',
  changeOrigin: true,
  pathRewrite: {
    '^/api/media': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    if (req.userId) {
      proxyReq.setHeader('X-User-Id', req.userId);
    }
    console.log('📤 PROXYING Media TO:', 'http://localhost:3004' + proxyReq.path);
    logger.info({ userId: req.userId, path: proxyReq.path }, 'Proxying to media-service');
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('📥 Media proxy response:', proxyRes.statusCode);
  },
  onError: (err, req, res) => {
    console.error('❌ Media PROXY ERROR:', err.message);
    logger.error({ error: err.message }, 'Media service proxy error');
    res.status(500).json({ error: 'Media service unavailable' });
  },
};

app.use('/api/media', authMiddleware, createProxyMiddleware(mediaProxyConfig));

console.log('✅ /api/media/* → Media Service (port 3004)');

const routes = require('./routes');
app.use('/', routes);

// 404 handler
app.use((req, res, next) => {
  console.log('❌ 404 NOT FOUND:', req.method, req.path);
  logger.warn({ path: req.path, method: req.method }, 'Route not found');
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ UNHANDLED ERROR:', err);
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.GATEWAY_PORT || 3000;

const server = app.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 Gateway running on port', PORT);
  console.log('=================================');
  console.log('File upload routes:');
  console.log('  POST /api/auth/upload-avatar → Auth Service');
  console.log('  POST /auth/upload-avatar → Auth Service');
  console.log('  POST /api/chat/files/upload → Chat Service');
  console.log('  POST /chat/files/upload → Chat Service');
  console.log('=================================');
  logger.info(`Gateway running on port ${PORT}`);
});

// WebSocket
const WebSocketHandler = require('./websocket-handler');
new WebSocketHandler(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = server;
