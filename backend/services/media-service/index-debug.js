require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');

const app = express();

const PORT = process.env.MEDIA_SERVICE_PORT || 3004;

// МИНИМАЛЬНЫЙ HANDLER БЕЗ MIDDLEWARE
app.post('/create-transport/:callId', (req, res) => {
  console.log('');
  console.log('🎯🎯🎯 HANDLER HIT!!!');
  console.log('CallId:', req.params.callId);
  console.log('');
  
  res.json({ success: true });
  console.log('✅ Response sent!');
});

app.listen(PORT, () => {
  console.log('🎥 Media Service MINIMAL - Port:', PORT);
});
