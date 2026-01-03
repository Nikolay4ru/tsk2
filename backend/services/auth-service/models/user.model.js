const postgres = require('../../../shared/database/postgres');

exports.create = async (email, username, passwordHash) => {
  const { rows } = await postgres.query(
    'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
    [email, username, passwordHash]
  );
  return rows[0];
};

exports.findByEmail = async (email) => {
  const { rows } = await postgres.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return rows[0];
};

exports.findById = async (id) => {
  const { rows } = await postgres.query(
    'SELECT id, email, username, created_at, last_seen, is_online FROM users WHERE id = $1',
    [id]
  );
  return rows[0];
};

exports.updateAvatar = async (userId, avatarUrl) => {
  const { rows } = await postgres.query(
    'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, email, username, avatar_url',
    [avatarUrl, userId]
  );
  return rows[0];
};

exports.search = async (query) => {
  const { rows } = await postgres.query(
    'SELECT id, email, username, is_online, last_seen FROM users WHERE username ILIKE $1 OR email ILIKE $1 LIMIT 20',
    [`%${query}%`]
  );
  return rows;
};

exports.updateLastSeen = async (userId, isOnline) => {
  await postgres.query(
    'UPDATE users SET last_seen = NOW(), is_online = $2 WHERE id = $1',
    [userId, isOnline]
  );
};

exports.setOnline = async (userId) => {
  await postgres.query(
    'UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1',
    [userId]
  );
};

exports.setOffline = async (userId) => {
  await postgres.query(
    'UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1',
    [userId]
  );
};
