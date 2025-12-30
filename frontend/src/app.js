import Router from './router.js';
import WebSocketManager from './websocket.js';
import API from './api.js';
import * as LoginModule from './modules/auth/login.js';
import * as ChatListModule from './modules/chat/chat-list.js';
import * as ChatWindowModule from './modules/chat/chat-window.js';
import * as TaskBoardModule from './modules/task/task-board.js';
import * as SettingsModule from './modules/settings/settings.js';

class App {
  constructor() {
    this.user = null;
    this.router = null;
    this.ws = null;
  }

  async init() {
    console.log('🚀 Initializing app...');

    // Check authentication
    const token = localStorage.getItem('accessToken');
    
    if (token) {
      try {
        // КРИТИЧНО: Установить токен в API перед запросом
        API.setToken(token);
        
        const user = await API.getMe();
        this.user = user;
        console.log('✅ User authenticated:', this.user.username);
        
        // Initialize WebSocket
        this.ws = new WebSocketManager();
        await this.ws.connect();
      } catch (error) {
        console.error('❌ Auth check failed:', error);
        localStorage.removeItem('accessToken');
        this.user = null;
      }
    }

    // Setup router with routes
    const routes = [
      {
        path: '/',
        module: this.user ? ChatListModule : LoginModule,
      },
      {
        path: '/login',
        module: LoginModule,
      },
      {
        path: '/chat',
        module: ChatListModule,
      },
      {
        path: /^\/chat\/([a-f0-9-]+)$/,
        module: ChatWindowModule,
      },
      {
        path: '/tasks',
        module: TaskBoardModule,
      },
      {
        path: '/settings',
        module: SettingsModule,
      },
      {
        path: '/404',
        module: {
          init: () => {
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
              mainContent.innerHTML = `
                <div class="empty-state">
                  <h1>404</h1>
                  <p>Page not found</p>
                  <a href="/" class="btn btn-primary">Go Home</a>
                </div>
              `;
            }
          },
        },
      },
    ];

    this.router = new Router(routes);
    await this.router.init();

    // Setup navigation
    this.setupNavigation();

    console.log('✅ App initialized');
  }

  setupNavigation() {
    // Navigation links
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.nav-link, [data-link]');
      if (link && link.hasAttribute('href')) {
        e.preventDefault();
        const path = link.getAttribute('href');
        this.router.navigate(path);
      }
    });

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.logout();
      });
    }
  }

  async login(credentials) {
    try {
      const data = await API.login(credentials.email, credentials.password);
      
      this.user = data.user;
      // Токен уже установлен в API.login()

      // Initialize WebSocket
      this.ws = new WebSocketManager();
      await this.ws.connect();

      // Navigate to chat
      this.router.navigate('/chat');

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await API.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }

    this.user = null;
    
    if (this.ws) {
      this.ws.disconnect();
      this.ws = null;
    }
    
    window.location.href = '/';
  }
}

// Initialize app
const app = new App();
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

export default app;
