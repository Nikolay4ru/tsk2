module.exports = {
  apps: [
    {
      name: 'gateway',
      script: 'backend/gateway/server.js',
      cwd: '/var/www/chatapp',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'auth-service',
      script: 'backend/services/auth-service/index.js',
      cwd: '/var/www/chatapp',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'chat-service',
      script: 'backend/services/chat-service/index.js',
      cwd: '/var/www/chatapp',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'task-service',
      script: 'backend/services/task-service/index.js',
      cwd: '/var/www/chatapp',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'media-service',
      script: 'backend/services/media-service/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        MEDIASOUP_ANNOUNCED_IP: process.env.SERVER_IP || '127.0.0.1',
      },
    },
  ],
};
