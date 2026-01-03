const postgres = require('../../../shared/database/postgres');
exports.create = async (name, type, encrypted, createdBy) => {
  const { rows } = await postgres.query(
    'INSERT INTO rooms (name, type, encrypted) VALUES ($1, $2, $3) RETURNING *',
    [name, type, encrypted]
  );
  return rows[0];
};

exports.findById = async (roomId) => {
  const { rows } = await postgres.query(
    'SELECT * FROM rooms WHERE id = $1',
    [roomId]
  );
  return rows[0];
};

exports.findByUserId = async (userId) => {
  const { rows } = await postgres.query(
    `SELECT 
       r.*,
       COUNT(DISTINCT m.id) FILTER (WHERE m.is_read = false AND m.user_id != $1) as unread_count,
       (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count,
       (
         SELECT json_build_object(
           'content', m2.content,
           'type', m2.type,
           'created_at', m2.created_at,
           'user_id', m2.user_id,
           'file_name', m2.file_name
         )
         FROM messages m2 
         WHERE m2.room_id = r.id 
         ORDER BY m2.created_at DESC 
         LIMIT 1
       ) as last_message,
       (
         SELECT json_agg(
           json_build_object(
             'id', u.id,
             'username', u.username,
             'avatar_url', u.avatar_url,
             'is_online', COALESCE(u.is_online, false),
             'last_seen', u.last_seen
           )
         )
         FROM room_members rm2
         JOIN users u ON u.id = rm2.user_id
         WHERE rm2.room_id = r.id AND u.id != $1
       ) as other_members
     FROM rooms r
     JOIN room_members rm ON rm.room_id = r.id
     LEFT JOIN messages m ON m.room_id = r.id
     WHERE rm.user_id = $1
     GROUP BY r.id
     ORDER BY r.updated_at DESC`,
    [userId]
  );
  return rows;
};

exports.addMember = async (roomId, userId, role = 'member') => {
  await postgres.query(
    'INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [roomId, userId, role]
  );
};

exports.getMembers = async (roomId) => {
  const { rows } = await postgres.query(
    `SELECT u.id, u.username, u.email, u.avatar_url, COALESCE(u.is_online, false) as is_online, u.last_seen, rm.role 
     FROM room_members rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1`,
    [roomId]
  );
  return rows;
};

exports.findPrivateRoom = async (userId1, userId2) => {
  const { rows } = await postgres.query(
    `SELECT r.* FROM rooms r
     WHERE r.type = 'private'
     AND EXISTS (SELECT 1 FROM room_members WHERE room_id = r.id AND user_id = $1)
     AND EXISTS (SELECT 1 FROM room_members WHERE room_id = r.id AND user_id = $2)
     LIMIT 1`,
    [userId1, userId2]
  );
  return rows[0];
};

exports.updateTimestamp = async (roomId) => {
  await postgres.query(
    'UPDATE rooms SET updated_at = NOW() WHERE id = $1',
    [roomId]
  );
};

exports.removeMember = async (roomId, userId) => {
  await postgres.query(
    'DELETE FROM room_members WHERE room_id = $1 AND user_id = $2',
    [roomId, userId]
  );
};


exports.isMember = async (roomId, userId) => {
  const { rows } = await postgres.query(
    'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
    [roomId, userId]
  );
  return rows.length > 0;
};


exports.updateLastActivity = async (roomId) => {
    await postgres.query(
      'UPDATE rooms SET updated_at = NOW() WHERE id = $1',
      [roomId]
    );
  };


exports.deleteRoom = async (roomId) => {
  await postgres.query('DELETE FROM rooms WHERE id = $1', [roomId]);
};
