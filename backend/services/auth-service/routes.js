const express = require('express');
const router = express.Router();
const authController = require('./controllers/auth.controller');
const authMiddleware = require('../../shared/middleware/auth.middleware');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);

// Protected routes
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.getMe);
router.put('/me', authMiddleware, authController.updateProfile);
router.get('/verify', authMiddleware, authController.getMe);

// Search users (protected)
router.get('/users/search', authMiddleware, authController.searchUsers);

module.exports = router;
