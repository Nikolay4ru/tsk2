require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');

const app = express();

// ✅ Middleware для ручного чтения body из stream
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (e) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

app.post('/create-transport/:callId', (req, res) => {
  console.log('🎯 Handler! CallId:', req.params.callId, 'Body:', req.body);
  res.json({ id: 'test-' + Date.now(), iceParameters: {}, iceCandidates: [], dtlsParameters: {} });
});

app.listen(3004, () => console.log('🎥 MANUAL PARSE - Port: 3004'));
