const express = require('express');
const authMiddleware = require('./middleware/auth.middleware');
const logger = require('../shared/utils/logger');

const router = express.Router();

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  chat: process.env.CHAT_SERVICE_URL || 'http://localhost:3002',
  task: process.env.TASK_SERVICE_URL || 'http://localhost:3003',
};

async function proxyRequest(req, res, serviceUrl, servicePrefix) {
  try {
    let path = req.path;
    
    // Убираем /api префикс если есть
    if (path.startsWith('/api/')) {
      path = path.substring(4); // убрать '/api'
    }
    
    // Убираем service prefix
    if (servicePrefix && path.startsWith(servicePrefix)) {
      path = path.substring(servicePrefix.length);
    }
    
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${serviceUrl}${path}${queryString ? '?' + queryString : ''}`;
    
    logger.debug({ 
      originalPath: req.path, 
      finalPath: path, 
      url 
    }, 'Proxying request');
    
    const headers = {
      'Content-Type': 'application/json',
      ...(req.userId && { 'X-User-Id': req.userId }),
      ...(req.userEmail && { 'X-User-Email': req.userEmail }),
    };

    const options = {
      method: req.method,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(502).json({ error: 'Invalid response from service', details: text.substring(0, 200) });
    }

  } catch (error) {
    logger.error({ service: serviceUrl, error: error.message }, 'Service proxy error');
    res.status(503).json({ error: 'Service unavailable', message: error.message });
  }
}

// ============================================
// PUBLIC AUTH ROUTES
// ============================================
router.post('/auth/register', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/auth/login', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/auth/refresh', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));

// С /api префиксом
router.post('/api/auth/register', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/api/auth/login', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/api/auth/refresh', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));

// ============================================
// PROTECTED ROUTES
// ============================================
router.use(authMiddleware);

// Auth protected - без /api
router.get('/auth/verify', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.get('/auth/me', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.put('/auth/me', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/auth/logout', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.get('/auth/users/search', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));

// Auth protected - с /api
router.get('/api/auth/verify', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.get('/api/auth/me', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.put('/api/auth/me', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/api/auth/logout', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.get('/api/auth/users/search', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));

// Chat routes
router.all('/chat/*', (req, res) => proxyRequest(req, res, SERVICES.chat, '/chat'));
router.all('/api/chat/*', (req, res) => proxyRequest(req, res, SERVICES.chat, '/chat'));

// Task routes
router.all('/task/*', (req, res) => proxyRequest(req, res, SERVICES.task, '/task'));
router.all('/api/task/*', (req, res) => proxyRequest(req, res, SERVICES.task, '/task'));

module.exports = router;
