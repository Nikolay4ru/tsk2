const postgres = require('../../../shared/database/postgres');
const logger = require('../../../shared/utils/logger');

class TaskModel {
  // Create task
  async create(data) {
    const { rows } = await postgres.query(
      `INSERT INTO tasks (
        title, description, status, priority, 
        assignee_id, creator_id, due_date, board_id, position
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.title,
        data.description || null,
        data.status || 'todo',
        data.priority || 'medium',
        data.assigneeId || null,
        data.creatorId,
        data.dueDate || null,
        data.boardId || null,
        data.position || 0,
      ]
    );
    
    return rows[0];
  }

  // Get task by ID
  async findById(taskId) {
    const { rows } = await postgres.query(
      `SELECT t.*,
        json_build_object(
          'id', creator.id,
          'username', creator.username,
          'avatar_url', creator.avatar_url
        ) as creator,
        json_build_object(
          'id', assignee.id,
          'username', assignee.username,
          'avatar_url', assignee.avatar_url
        ) as assignee,
        (
          SELECT json_agg(json_build_object(
            'id', w.id,
            'username', w.username,
            'avatar_url', w.avatar_url
          ))
          FROM task_watchers tw
          JOIN users w ON tw.user_id = w.id
          WHERE tw.task_id = t.id
        ) as watchers
      FROM tasks t
      LEFT JOIN users creator ON t.creator_id = creator.id
      LEFT JOIN users assignee ON t.assignee_id = assignee.id
      WHERE t.id = $1`,
      [taskId]
    );
    
    return rows[0];
  }

  // Get tasks with filters
  async find(filters = {}) {
    let query = `
      SELECT t.*,
        json_build_object(
          'id', creator.id,
          'username', creator.username,
          'avatar_url', creator.avatar_url
        ) as creator,
        json_build_object(
          'id', assignee.id,
          'username', assignee.username,
          'avatar_url', assignee.avatar_url
        ) as assignee,
        (
          SELECT COUNT(*)::int
          FROM messages
          WHERE task_id = t.id
        ) as comment_count
      FROM tasks t
      LEFT JOIN users creator ON t.creator_id = creator.id
      LEFT JOIN users assignee ON t.assignee_id = assignee.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    if (filters.status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.assigneeId) {
      query += ` AND t.assignee_id = $${paramIndex}`;
      params.push(filters.assigneeId);
      paramIndex++;
    }

    if (filters.creatorId) {
      query += ` AND t.creator_id = $${paramIndex}`;
      params.push(filters.creatorId);
      paramIndex++;
    }

    if (filters.boardId) {
      query += ` AND t.board_id = $${paramIndex}`;
      params.push(filters.boardId);
      paramIndex++;
    }

    if (filters.priority) {
      query += ` AND t.priority = $${paramIndex}`;
      params.push(filters.priority);
      paramIndex++;
    }

    // Search
    if (filters.search) {
      query += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Sorting
    if (filters.sortBy === 'position') {
      query += ` ORDER BY t.position ASC, t.created_at DESC`;
    } else if (filters.sortBy === 'priority') {
      query += ` ORDER BY 
        CASE t.priority 
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.created_at DESC`;
    } else if (filters.sortBy === 'dueDate') {
      query += ` ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`;
    } else {
      query += ` ORDER BY t.created_at DESC`;
    }

    // Pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const { rows } = await postgres.query(query, params);
    return rows;
  }

  // Get tasks grouped by status (for Kanban)
  async getByBoard(boardId) {
    const { rows } = await postgres.query(
      `SELECT t.*,
        json_build_object(
          'id', creator.id,
          'username', creator.username,
          'avatar_url', creator.avatar_url
        ) as creator,
        json_build_object(
          'id', assignee.id,
          'username', assignee.username,
          'avatar_url', assignee.avatar_url
        ) as assignee
      FROM tasks t
      LEFT JOIN users creator ON t.creator_id = creator.id
      LEFT JOIN users assignee ON t.assignee_id = assignee.id
      WHERE t.board_id = $1 OR ($1 IS NULL AND t.board_id IS NULL)
      ORDER BY t.position ASC, t.created_at DESC`,
      [boardId]
    );
    
    // Group by status
    const grouped = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    
    rows.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });
    
    return grouped;
  }

  // Update task
  async update(taskId, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }

    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(data.status);
      paramIndex++;
    }

    if (data.priority !== undefined) {
      fields.push(`priority = $${paramIndex}`);
      values.push(data.priority);
      paramIndex++;
    }

    if (data.assigneeId !== undefined) {
      fields.push(`assignee_id = $${paramIndex}`);
      values.push(data.assigneeId);
      paramIndex++;
    }

    if (data.dueDate !== undefined) {
      fields.push(`due_date = $${paramIndex}`);
      values.push(data.dueDate);
      paramIndex++;
    }

    if (data.position !== undefined) {
      fields.push(`position = $${paramIndex}`);
      values.push(data.position);
      paramIndex++;
    }

    fields.push(`updated_at = NOW()`);

    values.push(taskId);

    const { rows } = await postgres.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return rows[0];
  }

  // Update position (for drag & drop)
  async updatePosition(taskId, newPosition, newStatus) {
    const { rows } = await postgres.query(
      `UPDATE tasks 
       SET position = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newPosition, newStatus, taskId]
    );

    return rows[0];
  }

  // Delete task
  async delete(taskId) {
    await postgres.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    return true;
  }

  // Add watcher
  async addWatcher(taskId, userId) {
    await postgres.query(
      `INSERT INTO task_watchers (task_id, user_id) 
       VALUES ($1, $2) 
       ON CONFLICT DO NOTHING`,
      [taskId, userId]
    );
    return true;
  }

  // Remove watcher
  async removeWatcher(taskId, userId) {
    await postgres.query(
      'DELETE FROM task_watchers WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );
    return true;
  }

  // Get watchers
  async getWatchers(taskId) {
    const { rows } = await postgres.query(
      `SELECT u.id, u.username, u.avatar_url
       FROM task_watchers tw
       JOIN users u ON tw.user_id = u.id
       WHERE tw.task_id = $1`,
      [taskId]
    );
    return rows;
  }
}

module.exports = new TaskModel();
