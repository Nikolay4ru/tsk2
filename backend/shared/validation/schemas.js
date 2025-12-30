// backend/shared/validation/schemas.js
// ============================================

const Joi = require('joi');

const schemas = {
  // Auth schemas
  register: Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Message schemas
  sendMessage: Joi.object({
    roomId: Joi.string().uuid().required(),
    content: Joi.string().max(5000).required(),
    encrypted: Joi.boolean().default(false),
    type: Joi.string().valid('text', 'image', 'file', 'video', 'audio').default('text'),
    replyTo: Joi.string().uuid().optional(),
  }),

  // Task schemas
  createTask: Joi.object({
    title: Joi.string().max(500).required(),
    description: Joi.string().max(10000).optional(),
    status: Joi.string().valid('todo', 'in_progress', 'review', 'done').default('todo'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    assigneeId: Joi.string().uuid().optional(),
    dueDate: Joi.date().optional(),
    boardId: Joi.string().uuid().optional(),
  }),

  updateTask: Joi.object({
    title: Joi.string().max(500).optional(),
    description: Joi.string().max(10000).optional(),
    status: Joi.string().valid('todo', 'in_progress', 'review', 'done').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
    assigneeId: Joi.string().uuid().allow(null).optional(),
    dueDate: Joi.date().allow(null).optional(),
  }),
};

function validate(schema, data) {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    throw { status: 400, errors };
  }
  return value;
}

module.exports = { schemas, validate };