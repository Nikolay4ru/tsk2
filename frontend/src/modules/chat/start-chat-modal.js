import API from '../../api.js';
import { getInitials, escapeHtml } from '../../shared/utils/helpers.js';

let searchTimeout = null;

export function show() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'start-chat-modal';
  
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Start Chat</h2>
        <button class="btn-icon" id="close-modal">×</button>
      </div>
      <div class="modal-body">
        <!-- Tabs -->
        <div class="chat-type-tabs">
          <button class="tab-btn active" data-tab="users">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Private Chat</span>
          </button>
          <button class="tab-btn" data-tab="group">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Group Chat</span>
          </button>
        </div>

        <!-- Private Chat Tab -->
        <div class="tab-content active" id="users-tab">
          <div class="search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" id="user-search" class="search-input" placeholder="Search users..." />
          </div>
          <div id="user-results" class="user-results">
            <div class="empty-state-small">
              <p>Search for users to start a chat</p>
            </div>
          </div>
        </div>

        <!-- Group Chat Tab -->
        <div class="tab-content" id="group-tab">
          <div class="form-group">
            <label>Group Name</label>
            <input type="text" id="group-name" class="input" placeholder="Enter group name" />
          </div>
          <button class="btn btn-primary btn-full" id="create-group-btn">Create Group</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  
  // КРИТИЧНО: Дождаться добавления в DOM
  setTimeout(() => {
    setupEventListeners(modal);
  }, 0);
}

function setupEventListeners(modal) {
  // Close modal
  const closeBtn = modal.querySelector('#close-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  const overlay = modal.querySelector('.modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        modal.remove();
      }
    });
  }

  // Tabs
  modal.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabContent = modal.querySelector(`#${tab}-tab`);
      if (tabContent) {
        tabContent.classList.add('active');
      }
    });
  });

  // User search
  const searchInput = modal.querySelector('#user-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      
      if (query.length < 2) {
        showEmptyState();
        return;
      }
      
      searchTimeout = setTimeout(() => {
        searchUsers(query);
      }, 300);
    });
  } else {
    console.error('Search input not found');
  }

  // Create group
  const createGroupBtn = modal.querySelector('#create-group-btn');
  if (createGroupBtn) {
    createGroupBtn.addEventListener('click', async () => {
      const nameInput = modal.querySelector('#group-name');
      if (!nameInput) return;
      
      const name = nameInput.value.trim();
      
      if (!name) {
        alert('Please enter a group name');
        return;
      }
      
      try {
        const room = await API.createRoom({ name, type: 'group', encrypted: false });
        modal.remove();
        window.app.router.navigate(`/chat/${room.id}`);
      } catch (error) {
        console.error('Failed to create group:', error);
        alert('Failed to create group');
      }
    });
  }
}

async function searchUsers(query) {
  const resultsContainer = document.querySelector('#user-results');
  if (!resultsContainer) {
    console.error('Results container not found');
    return;
  }
  
  resultsContainer.innerHTML = '<div class="loading">Searching...</div>';
  
  try {
    const users = await API.searchUsers(query);
    
    if (users.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state-small">
          <p>No users found</p>
        </div>
      `;
      return;
    }
    
    resultsContainer.innerHTML = users.map(user => {
      const avatarText = getInitials(user.username);
      const onlineIndicator = user.is_online 
        ? '<span class="online-indicator"></span>' 
        : '';
      
      return `
        <div class="user-result-item" data-user-id="${user.id}">
          <div class="avatar avatar-sm">
            ${avatarText}
            ${onlineIndicator}
          </div>
          <div class="user-info">
            <div class="username">${escapeHtml(user.username)}</div>
            <div class="email">${escapeHtml(user.email)}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    resultsContainer.querySelectorAll('.user-result-item').forEach(item => {
      item.addEventListener('click', async () => {
        const userId = item.dataset.userId;
        await createPrivateChat(userId);
      });
    });
    
  } catch (error) {
    console.error('Search failed:', error);
    resultsContainer.innerHTML = `
      <div class="empty-state-small">
        <p class="text-danger">Failed to search users</p>
      </div>
    `;
  }
}

async function createPrivateChat(recipientId) {
  try {
    const room = await API.createPrivateRoom(recipientId);
    const modal = document.querySelector('#start-chat-modal');
    if (modal) {
      modal.remove();
    }
    window.app.router.navigate(`/chat/${room.id}`);
  } catch (error) {
    console.error('Failed to create private chat:', error);
    alert('Failed to create chat');
  }
}

function showEmptyState() {
  const resultsContainer = document.querySelector('#user-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div class="empty-state-small">
        <p>Search for users to start a chat</p>
      </div>
    `;
  }
}
