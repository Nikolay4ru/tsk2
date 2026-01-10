require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const mediasoup = require('mediasoup');
const logger = require('../../shared/utils/logger');

const app = express();

console.log('📦 Setting up middleware...');

// Логируем каждый запрос
app.use((req, res, next) => {
  console.log(`\n📥 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', Object.keys(req.headers));
  next();
});

// ✅ Raw parser
app.use(express.raw({ type: 'application/json', limit: '10mb' }));

app.use((req, res, next) => {
  console.log('✅ After raw parser, body length:', req.body?.length || 0);
  
  if (req.body && req.body.length > 0) {
    try {
      req.body = JSON.parse(req.body.toString());
      console.log('✅ JSON parsed:', req.body);
    } catch (e) {
      console.error('❌ JSON parse error:', e.message);
      req.body = {};
    }
  } else {
    req.body = {};
  }
  next();
});

console.log('✅ Middleware setup complete');

// Minimal test endpoint
app.post('/create-transport/:callId', (req, res) => {
  console.log('\n🎯 CREATE TRANSPORT HANDLER HIT!');
  console.log('CallId:', req.params.callId);
  console.log('Body:', req.body);
  
  res.json({
    id: 'test-' + Date.now(),
    iceParameters: {},
    iceCandidates: [],
    dtlsParameters: {}
  });
  
  console.log('✅ Response sent!\n');
});

const PORT = 3004;

app.listen(PORT, () => {
  console.log('\n=================================');
  console.log('🎥 Media Service WITH LOGS');
  console.log('Port:', PORT);
  console.log('=================================\n');
});
