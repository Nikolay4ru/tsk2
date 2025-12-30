require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const taskController = require('./controllers/task.controller');
const authMiddleware = require('../../shared/middleware/auth.middleware');
const logger = require('../../shared/utils/logger');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'task-service' });
});

// All routes require authentication
app.use(authMiddleware);

// Task routes
app.get('/tasks', taskController.getTasks);
app.get('/tasks/:taskId', taskController.getTask);
app.get('/boards/:boardId', taskController.getBoard);
app.post('/tasks', taskController.createTask);
app.put('/tasks/:taskId', taskController.updateTask);
app.patch('/tasks/:taskId/position', taskController.updatePosition);
app.delete('/tasks/:taskId', taskController.deleteTask);

// Watcher routes
app.post('/tasks/:taskId/watchers', taskController.addWatcher);
app.delete('/tasks/:taskId/watchers/:userId', taskController.removeWatcher);
app.get('/tasks/:taskId/watchers', taskController.getWatchers);

const PORT = 3003 || 3003;
app.listen(PORT, () => {
  logger.info(`Task service running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
