// backend/services/chat-service/controllers/room.controller.js
// ============================================

const RoomModel = require('../models/room.model');
const eventEmitter = require('../../../shared/events/event-emitter');
const logger = require('../../../shared/utils/logger');

class RoomController {
  async getRooms(req, res) {
    try {
      const userId = req.headers['x-user-id'];
      const rooms = await RoomModel.findByUserId(userId);
      res.json(rooms);
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get rooms');
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  }

  async getRoom(req, res) {
    try {
      const { roomId } = req.params;
      const userId = req.headers['x-user-id'];

      // Check membership
      const isMember = await RoomModel.isMember(roomId, userId);
      if (!isMember) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const room = await RoomModel.findById(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const members = await RoomModel.getMembers(roomId);

      res.json({ ...room, members });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get room');
      res.status(500).json({ error: 'Failed to fetch room' });
    }
  }

  async createRoom(req, res) {
    try {
      const userId = req.headers['x-user-id'];
      const { name, type, encrypted, members } = req.body;

      if (!type || !['private', 'group'].includes(type)) {
        return res.status(400).json({ error: 'Invalid room type' });
      }

      if (type === 'group' && !name) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const room = await RoomModel.create({
        name,
        type,
        encrypted,
        creatorId: userId,
      });

      // Add additional members
      if (members && Array.isArray(members)) {
        for (const memberId of members) {
          await RoomModel.addMember(room.id, memberId);
        }
      }

      // Publish event
      await eventEmitter.publish(`user:${userId}`, {
        type: 'room_created',
        data: room,
      });

      logger.info({ roomId: room.id, userId }, 'Room created');

      res.status(201).json(room);
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to create room');
      res.status(500).json({ error: 'Failed to create room' });
    }
  }

  async createPrivateRoom(req, res) {
    try {
      const userId = req.headers['x-user-id'];
      const { recipientId } = req.body;

      if (!recipientId) {
        return res.status(400).json({ error: 'Recipient ID is required' });
      }

      if (userId === recipientId) {
        return res.status(400).json({ error: 'Cannot create room with yourself' });
      }

      const room = await RoomModel.findOrCreatePrivateRoom(userId, recipientId);

      res.json(room);
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to create private room');
      res.status(500).json({ error: 'Failed to create private room' });
    }
  }

  async addMember(req, res) {
    try {
      const { roomId } = req.params;
      const { userId: memberId, role } = req.body;
      const requesterId = req.headers['x-user-id'];

      // Verify requester is admin
      const members = await RoomModel.getMembers(roomId);
      const requester = members.find(m => m.id === requesterId);

      if (!requester || requester.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      await RoomModel.addMember(roomId, memberId, role || 'member');

      // Publish event
      await eventEmitter.publish(`room:${roomId}`, {
        type: 'member_added',
        data: { roomId, userId: memberId },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to add member');
      res.status(500).json({ error: 'Failed to add member' });
    }
  }

  async removeMember(req, res) {
    try {
      const { roomId, userId: memberId } = req.params;
      const requesterId = req.headers['x-user-id'];

      // Allow self-removal or admin removal
      const members = await RoomModel.getMembers(roomId);
      const requester = members.find(m => m.id === requesterId);

      if (requesterId !== memberId && (!requester || requester.role !== 'admin')) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await RoomModel.removeMember(roomId, memberId);

      // Publish event
      await eventEmitter.publish(`room:${roomId}`, {
        type: 'member_removed',
        data: { roomId, userId: memberId },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to remove member');
      res.status(500).json({ error: 'Failed to remove member' });
    }
  }

  async deleteRoom(req, res) {
    try {
      const { roomId } = req.params;
      const userId = req.headers['x-user-id'];

      // Verify user is admin
      const members = await RoomModel.getMembers(roomId);
      const user = members.find(m => m.id === userId);

      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      await RoomModel.delete(roomId);

      // Publish event
      await eventEmitter.publish(`room:${roomId}`, {
        type: 'room_deleted',
        data: { roomId },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to delete room');
      res.status(500).json({ error: 'Failed to delete room' });
    }
  }
}

module.exports = new RoomController();