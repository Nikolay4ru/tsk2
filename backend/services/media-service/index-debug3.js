require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');

const app = express();
const PORT = 3004;

// БЕЗ express.json()!

app.post('/create-transport/:callId', (req, res) => {
  console.log('🎯 HANDLER HIT! CallId:', req.params.callId);
  
  res.json({
    id: 'test-transport-id',
    iceParameters: {},
    iceCandidates: [],
    dtlsParameters: {}
  });
  
  console.log('✅ Response sent!');
});

app.listen(PORT, () => {
  console.log('🎥 NO JSON PARSING - Port:', PORT);
});
