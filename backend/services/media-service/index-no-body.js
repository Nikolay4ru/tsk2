require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');

const app = express();

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// ✅ БЕЗ ЛЮБОГО BODY PARSING!

app.post('/create-transport/:callId', (req, res) => {
  console.log('🎯 HANDLER HIT! CallId:', req.params.callId);
  
  res.json({
    id: 'test-' + Date.now(),
    iceParameters: { test: true },
    iceCandidates: [],
    dtlsParameters: { test: true }
  });
  
  console.log('✅ Response sent!');
});

app.listen(3004, () => {
  console.log('🎥 NO BODY PARSER - Port: 3004');
});
