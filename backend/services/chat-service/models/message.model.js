const postgres = require('../../../shared/database/postgres');
const logger = require('../../../shared/utils/logger');

exports.create = async (data) => {
  const { roomId, taskId, userId, content, type, fileId, fileUrl, fileName, fileType, replyTo } = data;
  
  const { rows } = await postgres.query(
    `INSERT INTO messages (room_id, task_id, user_id, content, type, file_id, file_url, file_name, file_type, reply_to, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
     RETURNING *`,
    [roomId, taskId, userId, content, type, fileId, fileUrl, fileName, fileType, replyTo]
  );
  
  // Get username
  const { rows: userRows } = await postgres.query(
    'SELECT username FROM users WHERE id = $1',
    [userId]
  );
  
  return {
    ...rows[0],
    username: userRows[0]?.username,
  };
};

exports.findByRoomId = async (roomId, options = {}) => {
  const { before, after, limit = 50 } = options;
  
  let query = `
    SELECT m.*, u.username, u.avatar_url
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
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
  
  return rows.reverse();
};

exports.findByTaskId = async (taskId, options = {}) => {
  const { limit = 50 } = options;
  
  const { rows } = await postgres.query(
    `SELECT m.*, u.username
     FROM messages m
     LEFT JOIN users u ON m.user_id = u.id
     WHERE m.task_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [taskId, limit]
  );
  
  return rows.reverse();
};

exports.findById = async (messageId) => {
  const { rows } = await postgres.query(
    `SELECT m.*, u.username
     FROM messages m
     LEFT JOIN users u ON m.user_id = u.id
     WHERE m.id = $1`,
    [messageId]
  );
  
  return rows[0];
};

exports.update = async (messageId, data) => {
  const { content } = data;
  
  const { rows } = await postgres.query(
    `UPDATE messages
     SET content = $1, updated_at = NOW(), edited = TRUE
     WHERE id = $2
     RETURNING *`,
    [content, messageId]
  );
  
  if (rows.length === 0) return null;
  
  // Get username
  const { rows: userRows } = await postgres.query(
    'SELECT username FROM users WHERE id = $1',
    [rows[0].user_id]
  );
  
  return {
    ...rows[0],
    username: userRows[0]?.username,
  };
};

exports.delete = async (messageId) => {
  await postgres.query('DELETE FROM messages WHERE id = $1', [messageId]);
};

exports.markAsRead = async (messageIds, userId) => {
  if (!messageIds || messageIds.length === 0) return;
  
  // ИСПРАВЛЕНО: использовать is_read вместо read
  const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(',');
  
  await postgres.query(
    `UPDATE messages 
     SET is_read = TRUE 
     WHERE id IN (${placeholders})
     AND user_id != $${messageIds.length + 1}`,
    [...messageIds, userId]
  );
};

exports.getUnreadCount = async (roomId, userId) => {
  const { rows } = await postgres.query(
    `SELECT COUNT(*) as count
     FROM messages
     WHERE room_id = $1
     AND user_id != $2
     AND is_read = FALSE`,
    [roomId, userId]
  );
  
  return parseInt(rows[0].count);
};

exports.search = async (roomId, query) => {
  const { rows } = await postgres.query(
    `SELECT m.*, u.username
     FROM messages m
     LEFT JOIN users u ON m.user_id = u.id
     WHERE m.room_id = $1
     AND m.content ILIKE $2
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [roomId, `%${query}%`]
  );
  
  return rows;
};
