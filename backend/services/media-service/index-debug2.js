require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');
const mediasoup = require('mediasoup');
const logger = require('../../shared/utils/logger');

const app = express();

// Логируем ВСЁ
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

app.use(express.json());

// После JSON
app.use((req, res, next) => {
  console.log('✅ Body parsed:', req.body);
  next();
});

const PORT = 3004;
const routers = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/create-transport/:callId', async (req, res) => {
  console.log('');
  console.log('🎯 CREATE TRANSPORT HANDLER!');
  console.log('CallId:', req.params.callId);
  console.log('Body:', req.body);
  console.log('');
  
  res.json({
    id: 'test-transport-id',
    iceParameters: {},
    iceCandidates: [],
    dtlsParameters: {}
  });
  
  console.log('✅ Response sent!');
});

app.listen(PORT, () => {
  console.log('🎥 Media Service DEBUG v4 - Port:', PORT);
});
