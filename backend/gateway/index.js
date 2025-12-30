// КРИТИЧНО: dotenv.config() ДОЛЖЕН БЫТЬ САМЫМ ПЕРВЫМ
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ТЕПЕРЬ можно импортировать остальное
const express = require('express');
const cors = require('cors');
const logger = require('../shared/utils/logger');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'gateway',
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.use('/api', routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ 
    port: PORT,
    jwtSecretSet: !!process.env.JWT_SECRET,
    jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0
  }, `Gateway running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
