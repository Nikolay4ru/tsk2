const messageModel = require('../models/message.model');
const roomModel = require('../models/room.model');
const redis = require('../../../shared/database/redis');
const postgres = require('../../../shared/database/postgres');
const logger = require('../../../shared/utils/logger');

// Get messages
exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const before = req.query.before;
    const after = req.query.after;
    const limit = parseInt(req.query.limit) || 50;

    // Check if user is member
    const isMember = await roomModel.isMember(roomId, req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const messages = await messageModel.findByRoomId(roomId, { before, after, limit });

    res.json(messages);
  } catch (error) {
    logger.error({ error: error.message }, 'Get messages error');
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const { roomId, content, type, fileUrl, replyTo, taskId } = req.body;

    // Check if user is member (unless it's a task comment)
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
      content,
      type: type || 'text',
      fileUrl,
      replyTo,
    });

    // Publish event
    if (roomId) {
      await redis.publish(`room:${roomId}`, JSON.stringify({
        type: 'new_message',
        data: message,
      }));
    }

    if (taskId) {
      await redis.publish(`task:${taskId}`, JSON.stringify({
        type: 'comment_added',
        data: message,
      }));
    }

    logger.info({ messageId: message.id, roomId, taskId }, 'Message sent');

    res.status(201).json(message);
  } catch (error) {
    logger.error({ error: error.message }, 'Send message error');
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Mark as read
exports.markAsRead = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'messageIds array is required' });
    }

    await messageModel.markAsRead(messageIds, req.userId);

    // Publish event
    await redis.publish(`room:${roomId}`, JSON.stringify({
      type: 'messages_read',
      data: { userId: req.userId, messageIds },
    }));

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Mark as read error');
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await messageModel.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await messageModel.delete(messageId);

    // Publish event
    if (message.room_id) {
      await redis.publish(`room:${message.room_id}`, JSON.stringify({
        type: 'message_deleted',
        data: { messageId },
      }));
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete message error');
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// Update message
exports.updateMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await messageModel.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await messageModel.update(messageId, { content });

    // Publish event
    if (message.room_id) {
      await redis.publish(`room:${message.room_id}`, JSON.stringify({
        type: 'message_updated',
        data: updated,
      }));
    }

    res.json(updated);
  } catch (error) {
    logger.error({ error: error.message }, 'Update message error');
    res.status(500).json({ error: 'Failed to update message' });
  }
};

// Search messages
exports.searchMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const messages = await messageModel.search(roomId, query);

    res.json(messages);
  } catch (error) {
    logger.error({ error: error.message }, 'Search messages error');
    res.status(500).json({ error: 'Failed to search messages' });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const { roomId } = req.params;

    const count = await messageModel.getUnreadCount(roomId, req.userId);

    res.json({ count });
  } catch (error) {
    logger.error({ error: error.message }, 'Get unread count error');
    res.status(500).json({ error: 'Failed to get unread count' });
  }
};

// Get task comments
exports.getTaskComments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const before = req.query.before;
    const limit = parseInt(req.query.limit) || 50;

    let query = `
      SELECT m.*, u.username, u.avatar_url
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.task_id = $1
    `;
    
    const params = [taskId];

    if (before) {
      query += ` AND m.created_at < $2`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await postgres.query(query, params);

    res.json(rows.reverse());
  } catch (error) {
    logger.error({ error: error.message }, 'Get task comments error');
    res.status(500).json({ error: 'Failed to get comments' });
  }
};

// Add task comment
exports.addTaskComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const { rows } = await postgres.query(
      `INSERT INTO messages (task_id, user_id, content, type, created_at)
       VALUES ($1, $2, $3, 'text', NOW())
       RETURNING *`,
      [taskId, req.userId, content]
    );

    const comment = rows[0];

    // Get user info
    const { rows: userRows } = await postgres.query(
      'SELECT username, avatar_url FROM users WHERE id = $1',
      [req.userId]
    );

    comment.username = userRows[0].username;
    comment.avatar_url = userRows[0].avatar_url;

    // Publish event
    await redis.publish(`task:${taskId}`, JSON.stringify({
      type: 'comment_added',
      data: comment,
    }));

    logger.info({ taskId, commentId: comment.id }, 'Task comment added');

    res.status(201).json(comment);
  } catch (error) {
    logger.error({ error: error.message }, 'Add task comment error');
    res.status(500).json({ error: 'Failed to add comment' });
  }
};
