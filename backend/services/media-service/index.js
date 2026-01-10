// backend/services/media-service/index.js
require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const mediasoup = require('mediasoup');
const logger = require('../../shared/utils/logger');

const app = express();

// ✅ Ручной парсинг body из stream (Gateway proxy передаёт stream)
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (e) {
        logger.error({ error: e.message, body }, 'JSON parse error');
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

// MediaSoup workers pool
let workers = [];
let nextWorkerIdx = 0;

// Routers для каждой конференции
const routers = new Map();
const transports = new Map();
const producers = new Map();
const consumers = new Map();

// ⚡ Store producers by callId for multi-party calls
const callProducers = new Map(); // callId -> [ { producerId, userId, kind } ]

// MediaSoup configuration
const config = {
  worker: {
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  },
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  },
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: '5.35.83.166',
      },
    ],
    enableUdp: true,
    enableTcp: false, // ✅ CRITICAL FIX: Disable TCP to avoid DTLS role conflicts
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
    enableSctp: false,
  },
};

async function createWorkers() {
  const numWorkers = Object.keys(require('os').cpus()).length;
  
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.worker.logLevel,
      logTags: config.worker.logTags,
      rtcMinPort: config.worker.rtcMinPort,
      rtcMaxPort: config.worker.rtcMaxPort,
    });

    worker.on('died', () => {
      logger.error({ workerId: worker.pid }, 'MediaSoup worker died, exiting');
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
    logger.info({ workerId: worker.pid }, 'MediaSoup worker created');
  }
}

function getNextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'media-service',
    workers: workers.length,
    routers: routers.size,
  });
});

app.get('/router-capabilities/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    let router = routers.get(callId);
    
    if (!router) {
      const worker = getNextWorker();
      router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
      routers.set(callId, router);
      logger.info({ callId, routerId: router.id }, 'Router created');
    }

    res.json({ rtpCapabilities: router.rtpCapabilities });
  } catch (error) {
    logger.error({ error: error.message }, 'Get router capabilities error');
    res.status(500).json({ error: 'Failed to get router capabilities' });
  }
});

// ⚡ NEW: Get list of producers for a call
app.get('/producers/:callId', (req, res) => {
  try {
    const { callId } = req.params;
    const producersList = callProducers.get(callId) || [];
    
    logger.info({ callId, count: producersList.length }, 'Get producers list');
    console.log(`📋 Producers for call ${callId}:`, producersList);
    
    res.json({ producers: producersList });
  } catch (error) {
    logger.error({ error: error.message }, 'Get producers error');
    res.status(500).json({ error: 'Failed to get producers' });
  }
});

// ⚡ FIXED: Force dtlsRole to 'client' for browser compatibility
app.post('/create-transport/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const { producing, consuming } = req.body;

    const router = routers.get(callId);
    if (!router) {
      return res.status(404).json({ error: 'Router not found' });
    }

    console.log('🔧 Creating transport:', {
      callId,
      direction: producing ? 'SEND (producing)' : 'RECV (consuming)',
      announcedIp: config.webRtcTransport.listenIps[0].announcedIp
    });

    // Create transport with appData
    const transport = await router.createWebRtcTransport({
      ...config.webRtcTransport,
      appData: { producing, consuming, callId }
    });

    // Save transport with metadata
    transports.set(transport.id, {
      transport,
      callId,
      producing,
      consuming
    });

    logger.info({ callId, transportId: transport.id, producing, consuming }, 'Transport created');
    
    console.log('✅ Transport created (internal):', {
      id: transport.id,
      direction: producing ? 'SEND' : 'RECV',
      dtlsRole: transport.dtlsParameters.role,
      dtlsFingerprints: transport.dtlsParameters.fingerprints.length,
    });

    // ⚡ CRITICAL FIX: Override dtlsRole to 'client'
    // Browser WebRTC always wants to be DTLS client
    // MediaSoup with TCP enabled tries to be server → conflict
    // With TCP disabled + role='client' → handshake succeeds
    const dtlsParameters = {
      ...transport.dtlsParameters,
      role: 'client'
    };

    console.log('📤 Returning dtlsParameters:', {
      originalRole: transport.dtlsParameters.role,
      forcedRole: dtlsParameters.role,
    });

    // Prevent caching of transport parameters
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: dtlsParameters,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Create transport error');
    console.error('❌ Create transport error:', error);
    res.status(500).json({ error: 'Failed to create transport' });
  }
});

app.post('/connect-transport', async (req, res) => {
  try {
    const { transportId, dtlsParameters } = req.body;
    const transportData = transports.get(transportId);
    
    if (!transportData) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    await transportData.transport.connect({ dtlsParameters });
    logger.info({ transportId }, 'Transport connected');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Connect transport error');
    res.status(500).json({ error: 'Failed to connect transport' });
  }
});

// ⚡ UPDATED: Store producer info and emit WebSocket event
app.post('/produce', async (req, res) => {
  try {
    const { transportId, kind, rtpParameters, userId } = req.body;
    
    console.log('');
    console.log('═══════════════════════════════════');
    console.log('📤 PRODUCE REQUEST');
    console.log('Transport ID:', transportId);
    console.log('Kind:', kind);
    console.log('User ID:', userId || 'not provided');
    console.log('═══════════════════════════════════');
    
    const transportData = transports.get(transportId);
    
    if (!transportData) {
      console.error('❌ Transport not found:', transportId);
      return res.status(404).json({ error: 'Transport not found' });
    }

    const { callId } = transportData;
    console.log('✅ Transport found for call:', callId);
    console.log('Transport state:', transportData.transport.connectionState);
    
    const producer = await transportData.transport.produce({ kind, rtpParameters });
    producers.set(producer.id, producer);
    
    // ⚡ Store producer info for multi-party calls
    if (!callProducers.has(callId)) {
      callProducers.set(callId, []);
    }
    
    const producerInfo = {
      producerId: producer.id,
      userId: userId || 'unknown',
      kind,
      timestamp: Date.now(),
    };
    
    callProducers.get(callId).push(producerInfo);
    
    console.log('✅ Producer created:', producer.id);
    console.log('Producer type:', producer.type);
    console.log('Producer paused:', producer.paused);
    console.log('📊 Total producers for call:', callProducers.get(callId).length);
    console.log('═══════════════════════════════════');
    console.log('');
    
    logger.info({ producerId: producer.id, kind, userId, callId }, 'Producer created');
    
    // ⚡ TODO: Emit WebSocket event to other participants
    // You need to implement WebSocket broadcasting here
    // Example (pseudo-code):
    // websocketServer.to(`call:${callId}`).emit('new-producer', {
    //   producerId: producer.id,
    //   userId,
    //   kind
    // });
    
    res.json({ id: producer.id });
  } catch (error) {
    console.error('');
    console.error('❌❌❌ PRODUCE ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('═══════════════════════════════════');
    console.error('');
    
    logger.error({ error: error.message }, 'Produce error');
    res.status(500).json({ error: 'Failed to produce' });
  }
});

app.post('/consume', async (req, res) => {
  try {
    const { transportId, producerId, rtpCapabilities } = req.body;
    const transportData = transports.get(transportId);
    
    if (!transportData) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    const producer = producers.get(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer not found' });
    }

    // Get router from transport's callId
    const { callId } = transportData;
    const router = routers.get(callId);
    
    if (!router) {
      return res.status(404).json({ error: 'Router not found' });
    }

    if (!router.canConsume({ producerId, rtpCapabilities })) {
      return res.status(400).json({ error: 'Cannot consume' });
    }

    const consumer = await transportData.transport.consume({ 
      producerId, 
      rtpCapabilities, 
      paused: true 
    });
    
    consumers.set(consumer.id, consumer);
    
    logger.info({ consumerId: consumer.id, producerId, callId }, 'Consumer created');
    console.log('✅ Consumer created:', {
      consumerId: consumer.id,
      producerId,
      kind: consumer.kind,
      callId,
    });
    
    res.json({
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Consume error');
    res.status(500).json({ error: 'Failed to consume' });
  }
});

app.post('/resume-consumer', async (req, res) => {
  try {
    const { consumerId } = req.body;
    const consumer = consumers.get(consumerId);
    
    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    await consumer.resume();
    logger.info({ consumerId }, 'Consumer resumed');
    console.log('✅ Consumer resumed:', consumerId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Resume consumer error');
    res.status(500).json({ error: 'Failed to resume consumer' });
  }
});

// ⚡ UPDATED: Clean up producers list
app.delete('/call/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const router = routers.get(callId);
    
    if (router) {
      router.close();
      routers.delete(callId);
    }

    // Clean up producers list
    const producersCount = callProducers.get(callId)?.length || 0;
    callProducers.delete(callId);

    logger.info({ callId, producersCount }, 'Call cleaned up');
    console.log(`🧹 Call ${callId} cleaned up (${producersCount} producers removed)`);
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Cleanup call error');
    res.status(500).json({ error: 'Failed to cleanup call' });
  }
});

const PORT = process.env.MEDIA_SERVICE_PORT || 3004;

async function start() {
  await createWorkers();
  
  app.listen(PORT, () => {
    logger.info(`Media service running on port ${PORT}`);
    console.log('=================================');
    console.log('🎥 MediaSoup SFU Server Ready');
    console.log(`Workers: ${workers.length}`);
    console.log(`Port: ${PORT}`);
    console.log('TCP: disabled (UDP only)');
    console.log('=================================');
  });
}

start().catch(err => {
  logger.error({ error: err.message }, 'Failed to start media service');
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  workers.forEach(w => w.close());
  process.exit(0);
});
