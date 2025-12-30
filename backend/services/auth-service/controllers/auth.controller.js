exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }
    
    const postgres = require('../../../shared/database/postgres');
    
    const { rows } = await postgres.query(
      `SELECT id, username, email, avatar_url, status
       FROM users
       WHERE username ILIKE $1 OR email ILIKE $1
       ORDER BY username
       LIMIT 20`,
      [`%${q}%`]
    );
    
    res.json(rows);
  } catch (error) {
    logger.error({ error: error.message }, 'Search users error');
    res.status(500).json({ error: 'Internal server error' });
  }
};