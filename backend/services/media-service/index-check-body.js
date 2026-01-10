require('dotenv').config({ path: '/var/www/chatapp/backend/.env' });
const express = require('express');

const app = express();

// БЕЗ парсинга

app.post('/create-transport/:callId', (req, res) => {
  console.log('🎯 Handler!');
  console.log('req.body:', req.body);
  console.log('typeof req.body:', typeof req.body);
  console.log('req.body keys:', req.body ? Object.keys(req.body) : 'no keys');
  
  // Попробуем прочитать stream
  let rawBody = '';
  req.on('data', chunk => {
    console.log('📦 Received chunk:', chunk.length, 'bytes');
    rawBody += chunk.toString();
  });
  
  req.on('end', () => {
    console.log('📦 Raw body:', rawBody);
    console.log('📦 Raw body length:', rawBody.length);
    
    res.json({ 
      id: 'test',
      receivedBody: rawBody,
      reqBody: req.body
    });
  });
});

app.listen(3004, () => console.log('🎥 BODY CHECK - Port: 3004'));
