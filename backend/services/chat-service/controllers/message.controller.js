const messageModel = require('../models/message.model');
const roomModel = require('../models/room.model');
const eventEmitter = require('../../../shared/events/event-emitter');
const logger = require('../../../shared/utils/logger');

exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { before, after, limit } = req.query;
    
    const isMember = await roomModel.isMember(roomId, req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    const messages = await messageModel.findByRoomId(roomId, {
      before,
      after,
      limit: parseInt(limit) || 50,
    });
    
    logger.info({ roomId, userId: req.userId, count: messages.length }, 'Messages retrieved');
    
    res.json(messages);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Get messages error');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { roomId, taskId, content, type, fileId, fileUrl, fileName, fileType, replyTo } = req.body;
    
    logger.info({ 
      roomId, 
      taskId, 
      userId: req.userId, 
      contentLength: content?.length 
    }, 'Sending message');
    
    if (!roomId && !taskId) {
      return res.status(400).json({ error: 'roomId or taskId required' });
    }
    
    if (!content && !fileUrl) {
      return res.status(400).json({ error: 'Content or file is required' });
    }
    
    if (roomId) {
      const isMember = await roomModel.isMember(roomId, req.userId);
      if (!isMember) {
        return res.status(403).json({ error: 'Not a member of this room' });
      }
    }
    
    const message = await messageModel.create({
      roomId,
      taskId,
      userId: req.userId,
      content: content.trim(),
      type: type || 'text',
      fileId: fileId || null,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      fileType: fileType || null,
      replyTo,
    });
    
    if (roomId) {
      await roomModel.updateLastActivity(roomId);
      
      logger.info({ roomId, messageId: message.id, senderId: req.userId }, 'Broadcasting new message');
      

      const postgres = require('../../../shared/database/postgres');
    const { rows } = await postgres.query(
      'SELECT username, avatar_url FROM users WHERE id = $1',
      [req.userId]
    );

    const fullMessage = {
      ...message,
      username: rows[0]?.username,
      avatar_url: rows[0]?.avatar_url,
    };

      // КРИТИЧНО: Добавить excludeUserId чтобы не отправлять отправителю
      await eventEmitter.publish(`room:${roomId}`, {
        type: 'new_message',
        data: fullMessage,
        _channel: `room:${roomId}`,
        _excludeUserId: req.userId, // НЕ отправлять отправителю
      });
    }
    
    logger.info({ messageId: message.id, roomId, userId: req.userId }, 'Message sent');
    
    res.status(201).json(message);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, body: req.body }, 'Send message error');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.updateMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content required' });
    }
    
    const message = await messageModel.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (message.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to edit this message' });
    }
    
    const updated = await messageModel.update(messageId, { content: content.trim() });
    
    logger.info({ messageId, userId: req.userId }, 'Message updated');
    
    if (message.room_id) {
      await eventEmitter.publish(`room:${message.room_id}`, {
        type: 'message_updated',
        data: updated,
        _channel: `room:${message.room_id}`,
      });
    }
    
    res.json(updated);
  } catch (error) {
    logger.error({ error: error.message }, 'Update message error');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await messageModel.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (message.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }
    
    await messageModel.delete(messageId);
    
    logger.info({ messageId, userId: req.userId }, 'Message deleted');
    
    if (message.room_id) {
      await eventEmitter.publish(`room:${message.room_id}`, {
        type: 'message_deleted',
        data: { messageId },
        _channel: `room:${message.room_id}`,
      });
    }
    
    res.json({ message: 'Message deleted' });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete message error');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { messageIds } = req.body;
    
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ error: 'messageIds array required' });
    }
    
    await messageModel.markAsRead(messageIds, req.userId);
    
    logger.info({ roomId, userId: req.userId, count: messageIds.length }, 'Messages marked as read');
    
    await eventEmitter.publish(`room:${roomId}`, {
      type: 'messages_read',
      data: { userId: req.userId, messageIds },
      _channel: `room:${roomId}`,
    });
    
    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    logger.error({ error: error.message }, 'Mark as read error');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.searchMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const isMember = await roomModel.isMember(roomId, req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    const messages = await messageModel.search(roomId, q);
    
    res.json(messages);
  } catch (error) {
    logger.error({ error: error.message }, 'Search messages error');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const count = await messageModel.getUnreadCount(roomId, req.userId);
    
    res.json({ count });
  } catch (error) {
    logger.error({ error: error.message }, 'Get unread count error');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getTaskComments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { limit } = req.query;
    
    const comments = await messageModel.findByTaskId(taskId, {
      limit: parseInt(limit) || 50,
    });
    
    res.json(comments);
  } catch (error) {
    logger.error({ error: error.message }, 'Get task comments error');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.addTaskComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content required' });
    }
    
    const comment = await messageModel.create({
      taskId,
      userId: req.userId,
      content: content.trim(),
      type: 'text',
    });
    
    logger.info({ taskId, userId: req.userId }, 'Task comment added');
    
    await eventEmitter.publish(`task:${taskId}`, {
      type: 'new_comment',
      data: comment,
      _channel: `task:${taskId}`,
    });
    
    res.status(201).json(comment);
  } catch (error) {
    logger.error({ error: error.message }, 'Add task comment error');
    res.status(500).json({ error: 'Internal server error' });
  }
};
