// frontend/src/modules/settings/settings.js
// ============================================

import API from '../../api.js';
import Router from '../../router.js';

export async function init() {
  console.log('Settings module');
  
  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = `
    <div class="chat-window">
      <header class="chat-header">
        <button class="back-btn">←</button>
        <div class="chat-info">
          <h2 class="chat-name">Settings</h2>
        </div>
      </header>
      
      <div class="messages-container" style="padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h3 style="margin-bottom: 16px;">Account</h3>
          
          <div style="background: var(--color-background-secondary); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
            <div style="margin-bottom: 12px;">
              <strong>Email:</strong> ${window.app.user?.email || 'N/A'}
            </div>
            <div style="margin-bottom: 12px;">
              <strong>Username:</strong> ${window.app.user?.username || 'N/A'}
            </div>
            <div>
              <strong>Status:</strong> ${window.app.user?.status || 'N/A'}
            </div>
          </div>
          
          <h3 style="margin-bottom: 16px; margin-top: 32px;">Actions</h3>
          
          <button class="btn btn-danger" id="logout-btn" style="width: 100%;">
            Logout
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Back button
  document.querySelector('.back-btn').addEventListener('click', () => {
    Router.navigate('/chat');
  });
  
  // Logout button
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
      await window.app.logout();
    }
  });
}