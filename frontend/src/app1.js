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

    const token = localStorage.getItem('accessToken');
    
    if (token) {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
          this.user = await response.json();
          console.log('✅ User authenticated:', this.user.username);
          
          this.ws = new WebSocketManager();
          await this.ws.connect();
        } else {
          localStorage.removeItem('accessToken');
          this.user = null;
        }
      } catch (error) {
        console.error('❌ Auth check failed:', error);
        localStorage.removeItem('accessToken');
        this.user = null;
      }
    }

    this.router = new Router([
      { path: '/', module: this.user ? ChatListModule : LoginModule },
      { path: '/login', module: LoginModule },
      { path: '/chat', module: ChatListModule },
      { path: /^\/chat\/([a-f0-9-]+)$/, module: ChatWindowModule },
      { path: '/tasks', module: TaskBoardModule },
      { path: '/settings', module: SettingsModule },
      {
        path: '/404',
        module: {
          init: () => {
            document.getElementById('main-content').innerHTML = `
              <div class="empty-state">
                <h1>404</h1>
                <p>Page not found</p>
                <a href="/" class="btn btn-primary">Go Home</a>
              </div>
            `;
          },
        },
      },
    ]);

    await this.router.init();
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
        
        // Mobile: Show chat list when Chats nav clicked
        if (window.innerWidth <= 768 && link.dataset.nav === 'chat') {
          const chatListContainer = document.getElementById('chat-list-container');
          if (chatListContainer) {
            chatListContainer.classList.add('mobile-active');
          }
        }
        
        // Update active nav
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        this.router.navigate(path);
      }
    });

    // Mobile: Back button in chat list header
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        const chatListHeader = e.target.closest('.chat-list-header');
        if (chatListHeader && e.target === chatListHeader.querySelector('::before')) {
          const chatListContainer = document.getElementById('chat-list-container');
          if (chatListContainer) {
            chatListContainer.classList.remove('mobile-active');
          }
        }
      }
    });

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
          });
        } catch (error) {
          console.error('Logout error:', error);
        }

        localStorage.removeItem('accessToken');
        if (this.ws) this.ws.disconnect();
        window.location.href = '/';
      });
    }
  }

  async login(credentials) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      this.user = data.user;
      localStorage.setItem('accessToken', data.accessToken);

      this.ws = new WebSocketManager();
      await this.ws.connect();

      this.router.navigate('/chat');
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }
}

const app = new App();
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

export default app;
