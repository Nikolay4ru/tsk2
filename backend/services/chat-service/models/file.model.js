const postgres = require('../../../shared/database/postgres');

exports.create = async (userId, roomId, filename, originalName, mimeType, size, url) => {
  const { rows } = await postgres.query(
    `INSERT INTO files (user_id, room_id, filename, original_name, mime_type, size, url) 
     VALUES ($1, $2, $3, $4, $5, $6, $7) 
     RETURNING *`,
    [userId, roomId, filename, originalName, mimeType, size, url]
  );
  return rows[0];
};

exports.findById = async (fileId) => {
  const { rows } = await postgres.query(
    'SELECT * FROM files WHERE id = $1',
    [fileId]
  );
  return rows[0];
};

exports.findByRoomId = async (roomId, limit = 50) => {
  const { rows } = await postgres.query(
    'SELECT * FROM files WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2',
    [roomId, limit]
  );
  return rows;
};

exports.delete = async (fileId) => {
  await postgres.query('DELETE FROM files WHERE id = $1', [fileId]);
};
