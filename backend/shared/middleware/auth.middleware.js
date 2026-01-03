const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

module.exports = (req, res, next) => {
  try {
    // Проверить X-User-Id header (от gateway для file uploads)
    if (req.headers['x-user-id']) {
      req.userId = req.headers['x-user-id'];
      logger.debug({ userId: req.userId }, 'Auth via X-User-Id header');
      return next();
    }

    // Обычная JWT auth
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn({ path: req.path }, 'No authorization header');
      return res.status(401).json({ error: 'No authorization token' });
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      logger.warn({ path: req.path }, 'No token provided');
      return res.status(401).json({ error: 'No authorization token' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.username = decoded.username;

    logger.debug({ userId: req.userId, path: req.path }, 'Authenticated request');

    next();
  } catch (error) {
    logger.error({ error: error.message, path: req.path }, 'Authentication failed');
    return res.status(401).json({ error: 'Invalid token' });
  }
};
