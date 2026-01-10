// backend/services/livekit-service/index.js
require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const logger = require('../../shared/utils/logger');

const app = express();
app.use(express.json());

// Configuration from .env
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'APIkeya4741c177af776889e66dd65fef77e0b';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'uSam9RvfHa6BsueQC7EYEVg/SieDNuybFXJW3CDq1N0=';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://chat.koleso.app/livekit';

// Validate configuration
if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('❌ LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in .env');
  process.exit(1);
}

// Initialize RoomServiceClient for room management
const roomService = new RoomServiceClient(
  LIVEKIT_URL.replace('ws://', 'http://').replace('wss://', 'https://'),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'livekit-service',
    livekitUrl: LIVEKIT_URL,
    apiKeyConfigured: !!LIVEKIT_API_KEY
  });
});

// Generate access token
app.post('/token', async (req, res) => {
  try {
    const { roomName, participantName, participantId, metadata } = req.body;
    
    if (!roomName || !participantName) {
      return res.status(400).json({ 
        error: 'roomName and participantName are required' 
      });
    }

    logger.info({ 
      roomName, 
      participantName, 
      participantId 
    }, 'Generating LiveKit token');

    // Create access token
    const at = new AccessToken(
      LIVEKIT_API_KEY, 
      LIVEKIT_API_SECRET, 
      {
        identity: participantId || participantName,
        name: participantName,
        metadata: metadata || '',
      }
    );

    // Grant room permissions
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });

    // Token valid for 6 hours
    at.ttl = '6h';

    const token = await at.toJwt();

    console.log('TOKEN TYPE:', typeof token);
console.log('TOKEN VALUE:', token);

    logger.info({ token, roomName, participantName }, 'Token generated successfully');
    
    res.json({
      token,
      url: LIVEKIT_URL,
      roomName,
      participantName,
      participantId: participantId || participantName,
    });

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Token generation error');
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// List active rooms
app.get('/rooms', async (req, res) => {
  try {
    const rooms = await roomService.listRooms();
    
    logger.info({ count: rooms.length }, 'Retrieved rooms list');
    
    res.json({ 
      rooms: rooms.map(room => ({
        name: room.name,
        sid: room.sid,
        numParticipants: room.numParticipants,
        creationTime: room.creationTime,
        emptyTimeout: room.emptyTimeout,
      }))
    });

  } catch (error) {
    logger.error({ error: error.message }, 'List rooms error');
    res.status(500).json({ error: 'Failed to list rooms' });
  }
});

// Get room details
app.get('/room/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    
    const participants = await roomService.listParticipants(roomName);
    
    logger.info({ roomName, participantCount: participants.length }, 'Retrieved room details');
    
    res.json({
      roomName,
      participants: participants.map(p => ({
        identity: p.identity,
        name: p.name,
        sid: p.sid,
        state: p.state,
        tracks: p.tracks.map(t => ({
          sid: t.sid,
          type: t.type,
          name: t.name,
          muted: t.muted,
        })),
      })),
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Room not found' });
    }
    logger.error({ error: error.message, roomName: req.params.roomName }, 'Get room error');
    res.status(500).json({ error: 'Failed to get room details' });
  }
});

// Remove participant from room
app.post('/room/:roomName/remove-participant', async (req, res) => {
  try {
    const { roomName } = req.params;
    const { participantId } = req.body;
    
    if (!participantId) {
      return res.status(400).json({ error: 'participantId is required' });
    }
    
    await roomService.removeParticipant(roomName, participantId);
    
    logger.info({ roomName, participantId }, 'Participant removed from room');
    
    res.json({ success: true });

  } catch (error) {
    logger.error({ error: error.message }, 'Remove participant error');
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

// End room (disconnect all participants)
app.post('/room/:roomName/end', async (req, res) => {
  try {
    const { roomName } = req.params;
    
    await roomService.deleteRoom(roomName);
    
    logger.info({ roomName }, 'Room ended');
    
    res.json({ success: true });

  } catch (error) {
    logger.error({ error: error.message }, 'End room error');
    res.status(500).json({ error: 'Failed to end room' });
  }
});

// Webhook endpoint for LiveKit events (optional)
app.post('/webhook', express.raw({ type: 'application/webhook+json' }), async (req, res) => {
  try {
    // In production: verify webhook signature
    // const event = WebhookReceiver.receive(req.body, req.headers['authorization'], LIVEKIT_API_SECRET);
    
    logger.info('Webhook received from LiveKit');
    
    // Handle events:
    // - room_started
    // - room_finished
    // - participant_joined
    // - participant_left
    // - track_published
    // - track_unpublished
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Webhook processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

const PORT = process.env.LIVEKIT_SERVICE_PORT || 3005;

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════');
  console.log('🎥 LiveKit Service Started');
  console.log(`Port: ${PORT}`);
  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
  console.log(`API Key: ${LIVEKIT_API_KEY}`);
  console.log('═══════════════════════════════════════');
  
  logger.info({ 
    port: PORT, 
    livekitUrl: LIVEKIT_URL 
  }, 'LiveKit service started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
