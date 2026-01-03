//chat-service/index.js
require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const roomController = require('./controllers/room.controller');
const messageController = require('./controllers/message.controller');
const fileController = require('./controllers/file.controller');
const callController = require('./controllers/call.controller');
const authMiddleware = require('../../shared/middleware/auth.middleware');
const { uploadFile } = require('../../shared/middleware/upload.middleware');
const logger = require('../../shared/utils/logger');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'chat-service' });
});

// All routes require authentication
app.use(authMiddleware);

// Room routes
app.get('/rooms', roomController.getRooms);
app.get('/rooms/:roomId', roomController.getRoom);
app.post('/rooms', roomController.createRoom);
app.post('/rooms/private', roomController.createPrivateRoom);
app.post('/rooms/:roomId/members', roomController.addMember);
app.delete('/rooms/:roomId/members/:userId', roomController.removeMember);
app.delete('/rooms/:roomId', roomController.deleteRoom);

// Message routes
app.get('/rooms/:roomId/messages', messageController.getMessages);
app.post('/messages', messageController.sendMessage);
app.post('/rooms/:roomId/messages/read', messageController.markAsRead);

app.delete('/messages/:messageId', messageController.deleteMessage);
app.put('/messages/:messageId', messageController.updateMessage);
app.get('/rooms/:roomId/messages/search', messageController.searchMessages);
app.get('/rooms/:roomId/unread', messageController.getUnreadCount);

// File routes
app.post('/files/upload', uploadFile, fileController.uploadFile);
app.get('/rooms/:roomId/files', fileController.getFiles);
app.delete('/files/:fileId', fileController.deleteFile);


// Call routes
app.post('/calls/start', callController.startCall);
app.post('/calls/:callId/answer', callController.answerCall);
app.post('/calls/:callId/reject', callController.rejectCall);
app.post('/calls/:callId/end', callController.endCall);
app.get('/rooms/:roomId/call', callController.getActiveCall);

// Task comment routes
app.get('/tasks/:taskId/comments', messageController.getTaskComments);
app.post('/tasks/:taskId/comments', messageController.addTaskComment);

const PORT = 3002 || 3002;
app.listen(PORT, () => {
  logger.info(`Chat service running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
