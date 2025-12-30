import API from './api.js';
import { Router } from './router.js';
import { WebSocketManager } from './websocket.js';

window.app = {
  user: null,
  router: null,
  ws: null,
};

async function init() {
  console.log('Initializing app...');

  const token = localStorage.getItem('accessToken');
  
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      window.app.user = {
        id: payload.userId,
        email: payload.email,
      };
      console.log('User authenticated:', window.app.user);
    } catch (error) {
      console.error('Token validation failed:', error);
      localStorage.removeItem('accessToken');
      window.app.user = null;
    }
  }

  const router = new Router();
  window.app.router = router;

  router.addRoute('/', async () => {
    if (window.app.user) {
      router.navigate('/chat');
      return;
    }
    
    const { init: loginInit } = await import('./modules/auth/login.js');
    await loginInit();
  });

  router.addRoute('/chat', async () => {
    if (!window.app.user) {
      router.navigate('/');
      return;
    }
    const { init: chatInit } = await import('./modules/chat/chat-list.js');
    await chatInit();
  });

  router.addRoute('/chat/:id', async (params) => {
    if (!window.app.user) {
      router.navigate('/');
      return;
    }
    const { init: windowInit } = await import('./modules/chat/chat-window.js');
    await windowInit(params.id);
  });

  router.addRoute('/tasks', async () => {
    if (!window.app.user) {
      router.navigate('/');
      return;
    }
    const { init: tasksInit } = await import('./modules/task/task-list.js');
    await tasksInit();
  });

  router.addRoute('/tasks/board', async () => {
    if (!window.app.user) {
      router.navigate('/');
      return;
    }
    const { init: boardInit } = await import('./modules/task/task-board.js');
    await boardInit();
  });

  router.addRoute('/tasks/:id', async (params) => {
    if (!window.app.user) {
      router.navigate('/');
      return;
    }
    const { init: detailInit } = await import('./modules/task/task-detail.js');
    await detailInit(params.id);
  });

  router.addRoute('/settings', async () => {
    if (!window.app.user) {
      router.navigate('/');
      return;
    }
    const { init: settingsInit } = await import('./modules/settings/settings.js');
    await settingsInit();
  });

  if (window.app.user) {
    const ws = new WebSocketManager();
    window.app.ws = ws;
    await ws.connect();
  }

  router.start();

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

window.app.logout = async function() {
  try {
    await API.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.removeItem('accessToken');
    window.app.user = null;
    
    if (window.app.ws) {
      window.app.ws.disconnect();
      window.app.ws = null;
    }
    
    window.app.router.navigate('/');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
