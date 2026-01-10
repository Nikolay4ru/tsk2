const callModel = require('../models/call.model');
const roomModel = require('../models/room.model');
const eventEmitter = require('../../../shared/events/event-emitter');

exports.startCall = async (req, res) => {
  try {
    const { roomId, type = 'video' } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    const isMember = await roomModel.isMember(roomId, req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    let activeCall = await callModel.getActiveCallForRoom(roomId);
    
    if (activeCall) {
      const callAge = (Date.now() - new Date(activeCall.started_at).getTime()) / 1000;
      
      if (callAge > 300) {
        console.log('🧹 Auto-cleanup old call:', activeCall.id, 'age:', callAge);
        await callModel.endCall(activeCall.id);
        activeCall = null;
      } else {
        return res.status(400).json({ 
          error: 'Call already in progress', 
          call: activeCall,
          age: Math.floor(callAge),
        });
      }
    }

    const call = await callModel.create(roomId, req.userId, type);

    const members = await roomModel.getMembers(roomId);
    
    for (const member of members) {
      if (member.id !== req.userId) {
        await callModel.addParticipant(call.id, member.id);
      }
    }

    // ✅ ИСПРАВЛЕНО: первый параметр = канал
    await eventEmitter.publish(`room:${roomId}`, {
      type: 'call_started',
      data: {
        callId: call.id,
        roomId,
        initiatorId: req.userId,
        callType: type,
      },
    });

    console.log('✅ Call started:', call.id);

    res.status(201).json(call);
  } catch (error) {
    console.error('❌ Start call error:', error);
    res.status(500).json({ error: 'Failed to start call' });
  }
};

exports.answerCall = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await callModel.findById(callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    await callModel.updateParticipantStatus(callId, req.userId, 'joined');

    if (call.status === 'calling') {
      await callModel.updateStatus(callId, 'active');
    }

    // ✅ ИСПРАВЛЕНО
    await eventEmitter.publish(`room:${call.room_id}`, {
      type: 'call_answered',
      data: {
        callId,
        userId: req.userId,
      },
    });

    res.json({ message: 'Call answered' });
  } catch (error) {
    console.error('Answer call error:', error);
    res.status(500).json({ error: 'Failed to answer call' });
  }
};

exports.rejectCall = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await callModel.findById(callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    await callModel.updateParticipantStatus(callId, req.userId, 'rejected');

    // ✅ ИСПРАВЛЕНО
    await eventEmitter.publish(`room:${call.room_id}`, {
      type: 'call_rejected',
      data: {
        callId,
        userId: req.userId,
      },
    });

    res.json({ message: 'Call rejected' });
  } catch (error) {
    console.error('Reject call error:', error);
    res.status(500).json({ error: 'Failed to reject call' });
  }
};

exports.endCall = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await callModel.findById(callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    await callModel.endCall(callId);

    // ✅ ИСПРАВЛЕНО
    await eventEmitter.publish(`room:${call.room_id}`, {
      type: 'call_ended',
      data: {
        callId,
        endedBy: req.userId,
      },
    });

    console.log('✅ Call ended:', callId);

    res.json({ message: 'Call ended' });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
};

exports.getActiveCall = async (req, res) => {
  try {
    const { roomId } = req.params;

    const call = await callModel.getActiveCallForRoom(roomId);
    
    if (!call) {
      return res.status(404).json({ error: 'No active call' });
    }

    const participants = await callModel.getParticipants(call.id);

    res.json({
      ...call,
      participants,
    });
  } catch (error) {
    console.error('Get active call error:', error);
    res.status(500).json({ error: 'Failed to get active call' });
  }
};
