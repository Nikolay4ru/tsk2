// backend/services/chat-service/models/message.model.js
// ============================================

const postgres = require('../../../shared/database/postgres');
const logger = require('../../../shared/utils/logger');

class MessageModel {
  async create(data) {
    const { roomId, userId, content, encrypted, type, fileUrl, replyTo } = data;
    
    try {
      const { rows } = await postgres.query(
        `INSERT INTO messages (room_id, user_id, content, encrypted, type, file_url, reply_to, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [roomId, userId, content, encrypted || false, type || 'text', fileUrl || null, replyTo || null]
      );
      
      return rows[0];
    } catch (error) {
      logger.error({ error: error.message, data }, 'Failed to create message');
      throw error;
    }
  }

  async findByRoomId(roomId, options = {}) {
    const { limit = 50, before, after } = options;
    
    let query = `
      SELECT m.*, 
             u.username, 
             u.avatar_url,
             CASE WHEN m.reply_to IS NOT NULL THEN
               json_build_object(
                 'id', rm.id,
                 'content', rm.content,
                 'user_id', rm.user_id,
                 'username', ru.username
               )
             END as reply_message
      FROM messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN messages rm ON m.reply_to = rm.id
      LEFT JOIN users ru ON rm.user_id = ru.id
      WHERE m.room_id = $1
    `;
    
    const params = [roomId];
    let paramIndex = 2;
    
    if (before) {
      query += ` AND m.created_at < $${paramIndex}`;
      params.push(before);
      paramIndex++;
    }
    
    if (after) {
      query += ` AND m.created_at > $${paramIndex}`;
      params.push(after);
      paramIndex++;
    }
    
    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const { rows } = await postgres.query(query, params);
    
    return rows.reverse(); // Return oldest first
  }

  async findById(messageId) {
    const { rows } = await postgres.query(
      `SELECT m.*, u.username, u.avatar_url
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.id = $1`,
      [messageId]
    );
    return rows[0];
  }

  async markAsRead(roomId, userId, messageIds) {
    await postgres.query(
      `UPDATE messages 
       SET is_read = true 
       WHERE room_id = $1 AND id = ANY($2) AND user_id != $3`,
      [roomId, messageIds, userId]
    );
  }

  async getUnreadCount(roomId, userId) {
    const { rows } = await postgres.query(
      `SELECT COUNT(*) as count 
       FROM messages 
       WHERE room_id = $1 AND user_id != $2 AND is_read = false`,
      [roomId, userId]
    );
    return parseInt(rows[0].count);
  }

  async delete(messageId) {
    await postgres.query('DELETE FROM messages WHERE id = $1', [messageId]);
  }

  async update(messageId, content) {
    const { rows } = await postgres.query(
      `UPDATE messages SET content = $1 WHERE id = $2 RETURNING *`,
      [content, messageId]
    );
    return rows[0];
  }

  async search(roomId, query, limit = 20) {
    const { rows } = await postgres.query(
      `SELECT m.*, u.username, u.avatar_url
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.room_id = $1 AND m.content ILIKE $2
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [roomId, `%${query}%`, limit]
    );
    return rows;
  }
}

module.exports = new MessageModel();