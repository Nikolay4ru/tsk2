const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'cd159f17664be9ce64b167f29d067cfaf1d3d2c68871a657e2b6dd94fd243f3f';

module.exports = async function authMiddleware(req, res, next) {
  try {
    // В микросервисах токен уже проверен Gateway и передан в headers
    const userId = req.headers['x-user-id'];
    const userEmail = req.headers['x-user-email'];
    
    // Если есть заголовки от Gateway - использовать их (приоритет)
    if (userId && userEmail) {
      req.userId = userId;
      req.userEmail = userEmail;
      logger.debug({ userId, path: req.path }, 'User authenticated from gateway headers');
      return next();
    }
    
    // Иначе проверить токен напрямую (для прямого доступа к микросервису)
    const authHeader = req.headers.authorization;
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token) {
      logger.warn({ path: req.path }, 'No authentication provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    
    logger.debug({ userId: req.userId, path: req.path }, 'User authenticated directly');
    
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn({ error: error.message }, 'Invalid token');
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      logger.warn('Token expired');
      return res.status(401).json({ error: 'Token expired' });
    }
    
    logger.error({ error: error.message }, 'Auth middleware error');
    return res.status(500).json({ error: 'Internal server error' });
  }
};
