const postgres = require('../../../shared/database/postgres');
const logger = require('../../../shared/utils/logger');

class RoomModel {
  async create(data) {
    const { name, type, encrypted, creatorId } = data;
    
    try {
      const result = await postgres.transaction(async (client) => {
        const { rows: roomRows } = await client.query(
          `INSERT INTO rooms (name, type, encrypted, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           RETURNING *`,
          [name, type, encrypted || false]
        );
        
        const room = roomRows[0];
        
        await client.query(
          `INSERT INTO room_members (room_id, user_id, role, joined_at)
           VALUES ($1, $2, $3, NOW())`,
          [room.id, creatorId, 'admin']
        );
        
        return room;
      });
      
      return result;
    } catch (error) {
      logger.error({ error: error.message, data }, 'Failed to create room');
      throw error;
    }
  }

  async findById(roomId) {
    const { rows } = await postgres.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count
       FROM rooms r
       WHERE r.id = $1`,
      [roomId]
    );
    
    if (rows.length === 0) return null;
    
    const room = rows[0];
    room.member_count = parseInt(room.member_count);
    
    return room;
  }

  async findByUserId(userId) {
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
             'user_id', m2.user_id
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
               'status', u.status
             )
           )
           FROM room_members rm2
           JOIN users u ON rm2.user_id = u.id
           WHERE rm2.room_id = r.id
         ) as members
       FROM rooms r
       JOIN room_members rm ON r.id = rm.room_id
       LEFT JOIN messages m ON r.id = m.room_id
       WHERE rm.user_id = $1
       GROUP BY r.id
       ORDER BY r.updated_at DESC`,
      [userId]
    );
    
    return rows.map(room => ({
      ...room,
      unread_count: parseInt(room.unread_count) || 0,
      member_count: parseInt(room.member_count) || 0,
    }));
  }

  async addMember(roomId, userId, role = 'member') {
    try {
      await postgres.query(
        `INSERT INTO room_members (room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [roomId, userId, role]
      );
      return true;
    } catch (error) {
      logger.error({ error: error.message, roomId, userId }, 'Failed to add member');
      throw error;
    }
  }

  async removeMember(roomId, userId) {
    await postgres.query(
      'DELETE FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
  }

  async isMember(roomId, userId) {
    const { rows } = await postgres.query(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    return rows.length > 0;
  }

  async getMembers(roomId) {
    const { rows } = await postgres.query(
      `SELECT u.id, u.username, u.email, u.avatar_url, u.status, rm.role, rm.joined_at
       FROM room_members rm
       JOIN users u ON rm.user_id = u.id
       WHERE rm.room_id = $1
       ORDER BY rm.joined_at`,
      [roomId]
    );
    return rows;
  }

  async updateLastActivity(roomId) {
    await postgres.query(
      'UPDATE rooms SET updated_at = NOW() WHERE id = $1',
      [roomId]
    );
  }

  async update(roomId, updates) {
    const { name } = updates;
    
    const { rows } = await postgres.query(
      `UPDATE rooms SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [name, roomId]
    );
    
    return rows[0];
  }

  async findOrCreatePrivateRoom(user1Id, user2Id) {
    try {
      const { rows: existing } = await postgres.query(
        `SELECT r.* FROM rooms r
         JOIN room_members rm1 ON r.id = rm1.room_id AND rm1.user_id = $1
         JOIN room_members rm2 ON r.id = rm2.room_id AND rm2.user_id = $2
         WHERE r.type = 'private'
         AND (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) = 2
         LIMIT 1`,
        [user1Id, user2Id]
      );

      if (existing.length > 0) {
        return existing[0];
      }

      const room = await this.create({
        name: null,
        type: 'private',
        encrypted: false,
        creatorId: user1Id,
      });

      await this.addMember(room.id, user2Id);

      return room;
    } catch (error) {
      logger.error({ error: error.message, user1Id, user2Id }, 'Failed to find or create private room');
      throw error;
    }
  }

  async delete(roomId) {
    await postgres.query('DELETE FROM rooms WHERE id = $1', [roomId]);
  }
}

module.exports = new RoomModel();
