const jwt = require('jsonwebtoken');
const logger = require('../../shared/utils/logger');
console.log( 'Initializing Gateway auth middleware...' );
console.log( 'JWT_SECRET from env:', process.env.JWT_SECRET);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// LOG JWT_SECRET AT STARTUP
logger.info({
  jwtSecretSet: !!JWT_SECRET,
  jwtSecretLength: JWT_SECRET ? JWT_SECRET.length : 0,
  jwtSecretPreview: JWT_SECRET ? JWT_SECRET.substring(0, 10) + '...' : 'NOT SET'
}, 'Gateway auth middleware initialized with JWT_SECRET');

module.exports = async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const userIdHeader = req.headers['x-user-id'];
    
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (userIdHeader) {
      token = userIdHeader;
    }
    
    if (!token) {
      logger.warn({ path: req.path }, 'No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    logger.info({ 
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...',
      jwtSecretLength: JWT_SECRET.length
    }, 'Verifying token...');
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    logger.info({ 
      userId: decoded.userId, 
      email: decoded.email,
      path: req.path 
    }, 'Token verified successfully');
    
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    
    req.headers['x-user-id'] = decoded.userId;
    req.headers['x-user-email'] = decoded.email;
    
    next();
    
  } catch (error) {
    logger.error({ 
      errorName: error.name,
      errorMessage: error.message,
      path: req.path,
      jwtSecretLength: JWT_SECRET.length
    }, 'Auth middleware error');
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(500).json({ error: 'Internal server error' });
  }
};
