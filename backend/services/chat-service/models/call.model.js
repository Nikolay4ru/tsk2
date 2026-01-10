const postgres = require('../../../shared/database/postgres');

exports.create = async (roomId, initiatorId, type) => {
  const { rows } = await postgres.query(
    `INSERT INTO calls (id, room_id, initiator_id, type, status, started_at) 
     VALUES (gen_random_uuid(), $1, $2, $3, 'calling', NOW()) 
     RETURNING *`,
    [roomId, initiatorId, type]
  );
  return rows[0];
};

exports.findById = async (callId) => {
  const { rows } = await postgres.query(
    'SELECT * FROM calls WHERE id = $1',
    [callId]
  );
  return rows[0];
};

exports.updateStatus = async (callId, status) => {
  const { rows } = await postgres.query(
    'UPDATE calls SET status = $1 WHERE id = $2 RETURNING *',
    [status, callId]
  );
  return rows[0];
};

exports.endCall = async (callId) => {
  const { rows } = await postgres.query(
    `UPDATE calls 
     SET status = 'ended', 
         ended_at = NOW(), 
         duration = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
     WHERE id = $1 
     RETURNING *`,
    [callId]
  );
  return rows[0];
};

exports.addParticipant = async (callId, userId) => {
  const { rows } = await postgres.query(
    `INSERT INTO call_participants (id, call_id, user_id, status, joined_at) 
     VALUES (gen_random_uuid(), $1, $2, 'invited', NOW()) 
     RETURNING *`,
    [callId, userId]
  );
  return rows[0];
};

exports.updateParticipantStatus = async (callId, userId, status) => {
  // ✅ ИСПРАВЛЕНО: явное приведение типа VARCHAR
  const { rows } = await postgres.query(
    `UPDATE call_participants 
     SET status = $3::VARCHAR, 
         joined_at = CASE WHEN $3::VARCHAR = 'joined' THEN NOW() ELSE joined_at END,
         left_at = CASE WHEN $3::VARCHAR = 'left' THEN NOW() ELSE left_at END
     WHERE call_id = $1 AND user_id = $2 
     RETURNING *`,
    [callId, userId, status]
  );
  return rows[0];
};

exports.getActiveCallForRoom = async (roomId) => {
  const { rows } = await postgres.query(
    `SELECT * FROM calls 
     WHERE room_id = $1 AND status IN ('calling', 'active') 
     ORDER BY started_at DESC 
     LIMIT 1`,
    [roomId]
  );
  return rows[0];
};

exports.getParticipants = async (callId) => {
  const { rows } = await postgres.query(
    `SELECT cp.*, u.username, u.email 
     FROM call_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.call_id = $1`,
    [callId]
  );
  return rows;
};
