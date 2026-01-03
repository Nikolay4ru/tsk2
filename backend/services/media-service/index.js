require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const mediasoup = require('mediasoup');
const authMiddleware = require('../../shared/middleware/auth.middleware');
const logger = require('../../shared/utils/logger');

const app = express();
app.use(express.json());

// MediaSoup workers pool
let workers = [];
let nextWorkerIdx = 0;

// Routers для каждой конференции
const routers = new Map(); // callId -> router
const transports = new Map(); // transportId -> transport
const producers = new Map(); // producerId -> producer
const consumers = new Map(); // consumerId -> consumer

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
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
  },
};

// Initialize workers
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'media-service',
    workers: workers.length,
    routers: routers.size,
  });
});

app.use(authMiddleware);

// Get RTP capabilities
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

// Create WebRTC transport
app.post('/create-transport/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const { producing, consuming } = req.body;

    const router = routers.get(callId);
    if (!router) {
      return res.status(404).json({ error: 'Router not found' });
    }

    const transport = await router.createWebRtcTransport(config.webRtcTransport);

    transports.set(transport.id, transport);

    logger.info({ 
      callId, 
      transportId: transport.id, 
      producing, 
      consuming 
    }, 'Transport created');

    res.json({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Create transport error');
    res.status(500).json({ error: 'Failed to create transport' });
  }
});

// Connect transport
app.post('/connect-transport', async (req, res) => {
  try {
    const { transportId, dtlsParameters } = req.body;

    const transport = transports.get(transportId);
    if (!transport) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    await transport.connect({ dtlsParameters });

    logger.info({ transportId }, 'Transport connected');

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Connect transport error');
    res.status(500).json({ error: 'Failed to connect transport' });
  }
});

// Produce media
app.post('/produce', async (req, res) => {
  try {
    const { transportId, kind, rtpParameters } = req.body;

    const transport = transports.get(transportId);
    if (!transport) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    const producer = await transport.produce({ kind, rtpParameters });

    producers.set(producer.id, producer);

    logger.info({ 
      producerId: producer.id, 
      kind 
    }, 'Producer created');

    res.json({ id: producer.id });
  } catch (error) {
    logger.error({ error: error.message }, 'Produce error');
    res.status(500).json({ error: 'Failed to produce' });
  }
});

// Consume media
app.post('/consume', async (req, res) => {
  try {
    const { transportId, producerId, rtpCapabilities } = req.body;

    const transport = transports.get(transportId);
    if (!transport) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    const producer = producers.get(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer not found' });
    }

    const router = routers.get(Array.from(routers.keys())[0]); // Simplified

    if (!router.canConsume({ producerId, rtpCapabilities })) {
      return res.status(400).json({ error: 'Cannot consume' });
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    consumers.set(consumer.id, consumer);

    logger.info({ 
      consumerId: consumer.id, 
      producerId 
    }, 'Consumer created');

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

// Resume consumer
app.post('/resume-consumer', async (req, res) => {
  try {
    const { consumerId } = req.body;

    const consumer = consumers.get(consumerId);
    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    await consumer.resume();

    logger.info({ consumerId }, 'Consumer resumed');

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Resume consumer error');
    res.status(500).json({ error: 'Failed to resume consumer' });
  }
});

// Cleanup call
app.delete('/call/:callId', async (req, res) => {
  try {
    const { callId } = req.params;

    const router = routers.get(callId);
    if (router) {
      router.close();
      routers.delete(callId);
    }

    logger.info({ callId }, 'Call cleaned up');

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
