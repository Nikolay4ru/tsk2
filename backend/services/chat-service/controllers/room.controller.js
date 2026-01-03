const roomModel = require('../models/room.model');

exports.getRooms = async (req, res) => {
  try {
    const rooms = await roomModel.findByUserId(req.userId);
    
    const formattedRooms = rooms.map(room => {
      let displayName = room.name;
      let isOnline = false;
      let lastSeen = null;
      let avatarUrl = null;
      if (room.type === 'private' && room.other_members && room.other_members.length > 0) {
        const otherUser = room.other_members[0];
        displayName = otherUser.username;
        isOnline = otherUser.is_online;
        lastSeen = otherUser.last_seen;
        avatarUrl = otherUser.avatar_url;
      }
      
      return {
        ...room,
        name: displayName,
        is_online: isOnline,
        last_seen: lastSeen,
        avatar_url: avatarUrl,
      };
    });
    
    res.json(formattedRooms);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
};

exports.getRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await roomModel.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const members = await roomModel.getMembers(roomId);
    
    let displayName = room.name;
    let isOnline = false;
    let lastSeen = null;
    let avatarUrl = null;
    
    if (room.type === 'private') {
      const otherMember = members.find(m => m.id !== req.userId);
      if (otherMember) {
        displayName = otherMember.username;
        isOnline = otherMember.is_online;
        lastSeen = otherMember.last_seen;
        avatarUrl = otherMember.avatar_url;
      }
    }

    
    res.json({
      ...room,
      name: displayName,
      is_online: isOnline,
      last_seen: lastSeen,
      avatar_url: avatarUrl,
      member_count: members.length,
      members,
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const { name, type, encrypted } = req.body;
    
    if (type === 'private') {
      return res.status(400).json({ error: 'Use /rooms/private endpoint for private chats' });
    }
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required for group chats' });
    }
    
    const room = await roomModel.create(name, type || 'group', encrypted || false, req.userId);
    await roomModel.addMember(room.id, req.userId, 'admin');
    
    res.status(201).json(room);
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
};

exports.createPrivateRoom = async (req, res) => {
  try {
    const { recipientId } = req.body;
    
    console.log('Creating private room:', { userId: req.userId, recipientId });
    
    if (!recipientId) {
      return res.status(400).json({ error: 'Recipient ID is required' });
    }
    
    if (recipientId === req.userId) {
      return res.status(400).json({ error: 'Cannot create private chat with yourself' });
    }
    
    // Проверить существует ли уже чат
    let room = await roomModel.findPrivateRoom(req.userId, recipientId);
    
    if (room) {
      console.log('Private room already exists:', room.id);
      return res.status(200).json(room);
    }
    
    // Создать новый private чат
    console.log('Creating new private room...');
    room = await roomModel.create('Private Chat', 'private', false);
    
    console.log('Room created:', room.id);
    
    await roomModel.addMember(room.id, req.userId, 'member');
    await roomModel.addMember(room.id, recipientId, 'member');
    
    console.log('Members added to room');
    
    res.status(201).json(room);
  } catch (error) {
    console.error('Create private room error:', error);
    res.status(500).json({ error: 'Failed to create private room', details: error.message });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;
    
    // Проверить тип комнаты
    const room = await roomModel.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // ЗАПРЕТИТЬ добавление участников в private чаты
    if (room.type === 'private') {
      return res.status(403).json({ error: 'Cannot add members to private chats' });
    }
    
    await roomModel.addMember(roomId, userId);
    
    res.json({ message: 'Member added' });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    
    await roomModel.removeMember(roomId, userId);
    
    res.json({ message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    await roomModel.deleteRoom(roomId);
    
    res.json({ message: 'Room deleted' });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
};
