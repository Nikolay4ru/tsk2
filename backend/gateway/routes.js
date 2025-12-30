const express = require('express');
const authMiddleware = require('./middleware/auth.middleware');
const logger = require('../shared/utils/logger');

const router = express.Router();

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  chat: process.env.CHAT_SERVICE_URL || 'http://localhost:3002',
  task: process.env.TASK_SERVICE_URL || 'http://localhost:3003',
  task: process.env.TASK_SERVICE_URL || 'http://localhost:3003',
};

async function proxyRequest(req, res, serviceUrl, servicePrefix) {
  try {
    let path = req.path;
    
    // Убираем префикс
    if (servicePrefix && path.startsWith(servicePrefix)) {
      path = path.substring(servicePrefix.length);
    }
    
    const url = `${serviceUrl}${path}`;
    
    console.log('========================================');
    console.log('PROXY REQUEST DEBUG:');
    console.log('Original Path:', req.path);
    console.log('Service Prefix:', servicePrefix);
    console.log('Final Path:', path);
    console.log('Final URL:', url);
    console.log('Method:', req.method);
    console.log('Body:', req.body);
    console.log('========================================');
    
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
    
    console.log('Response Status:', response.status);
    console.log('Response Headers:', response.headers);
    
    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      console.log('Response Data:', data);
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      console.log('Response Text (first 200 chars):', text.substring(0, 200));
      res.status(502).json({ error: 'Invalid response from service', details: text.substring(0, 200) });
    }

  } catch (error) {
    console.error('PROXY ERROR:', error);
    logger.error({ service: serviceUrl, error: error.message, stack: error.stack }, 'Service proxy error');
    res.status(503).json({ error: 'Service unavailable', message: error.message });
  }
}

// Auth routes
router.post('/auth/register', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/auth/login', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/auth/refresh', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));

router.use(authMiddleware);

router.get('/auth/verify', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));
router.post('/auth/logout', (req, res) => proxyRequest(req, res, SERVICES.auth, '/auth'));

router.all('/chat/*', (req, res) => proxyRequest(req, res, SERVICES.chat, '/chat'));
router.all('/task/*', (req, res) => proxyRequest(req, res, SERVICES.task, '/task'));

// Task - убираем префикс /task
router.all('/task/*', (req, res) => proxyRequest(req, res, SERVICES.task, '/task'));

module.exports = router;
