const taskModel = require('../models/task.model');
const redis = require('../../../shared/database/redis');
const logger = require('../../../shared/utils/logger');

// Get tasks
exports.getTasks = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      assigneeId: req.query.assigneeId,
      creatorId: req.query.creatorId,
      boardId: req.query.boardId,
      priority: req.query.priority,
      search: req.query.search,
      sortBy: req.query.sortBy,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    };

    const tasks = await taskModel.find(filters);

    res.json(tasks);
  } catch (error) {
    logger.error({ error: error.message }, 'Get tasks error');
    res.status(500).json({ error: 'Failed to get tasks' });
  }
};

// Get task by ID
exports.getTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await taskModel.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    logger.error({ error: error.message }, 'Get task error');
    res.status(500).json({ error: 'Failed to get task' });
  }
};

// Get tasks for Kanban board
exports.getBoard = async (req, res) => {
  try {
    const { boardId } = req.params;

    const board = await taskModel.getByBoard(boardId || null);

    res.json(board);
  } catch (error) {
    logger.error({ error: error.message }, 'Get board error');
    res.status(500).json({ error: 'Failed to get board' });
  }
};

// Create task
exports.createTask = async (req, res) => {
  try {
    const data = {
      ...req.body,
      creatorId: req.userId,
    };

    const task = await taskModel.create(data);

    // Publish event
    await redis.publish('task:created', JSON.stringify({
      task,
      creatorId: req.userId,
    }));

    logger.info({ taskId: task.id, userId: req.userId }, 'Task created');

    res.status(201).json(task);
  } catch (error) {
    logger.error({ error: error.message }, 'Create task error');
    res.status(500).json({ error: 'Failed to create task' });
  }
};

// Update task
exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    // Check if task exists
    const existingTask = await taskModel.findById(taskId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = await taskModel.update(taskId, req.body);

    // Publish event
    await redis.publish('task:updated', JSON.stringify({
      task,
      userId: req.userId,
    }));

    logger.info({ taskId, userId: req.userId }, 'Task updated');

    res.json(task);
  } catch (error) {
    logger.error({ error: error.message }, 'Update task error');
    res.status(500).json({ error: 'Failed to update task' });
  }
};

// Update task position (drag & drop)
exports.updatePosition = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { position, status } = req.body;

    const task = await taskModel.updatePosition(taskId, position, status);

    // Publish event
    await redis.publish('task:moved', JSON.stringify({
      taskId,
      position,
      status,
      userId: req.userId,
    }));

    res.json(task);
  } catch (error) {
    logger.error({ error: error.message }, 'Update position error');
    res.status(500).json({ error: 'Failed to update position' });
  }
};

// Delete task
exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await taskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only creator can delete
    if (task.creator_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await taskModel.delete(taskId);

    // Publish event
    await redis.publish('task:deleted', JSON.stringify({
      taskId,
      userId: req.userId,
    }));

    logger.info({ taskId, userId: req.userId }, 'Task deleted');

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Delete task error');
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

// Add watcher
exports.addWatcher = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;

    await taskModel.addWatcher(taskId, userId || req.userId);

    // Publish event
    await redis.publish('task:watcher_added', JSON.stringify({
      taskId,
      watcherId: userId || req.userId,
    }));

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Add watcher error');
    res.status(500).json({ error: 'Failed to add watcher' });
  }
};

// Remove watcher
exports.removeWatcher = async (req, res) => {
  try {
    const { taskId, userId } = req.params;

    await taskModel.removeWatcher(taskId, userId);

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Remove watcher error');
    res.status(500).json({ error: 'Failed to remove watcher' });
  }
};

// Get watchers
exports.getWatchers = async (req, res) => {
  try {
    const { taskId } = req.params;

    const watchers = await taskModel.getWatchers(taskId);

    res.json(watchers);
  } catch (error) {
    logger.error({ error: error.message }, 'Get watchers error');
    res.status(500).json({ error: 'Failed to get watchers' });
  }
};
