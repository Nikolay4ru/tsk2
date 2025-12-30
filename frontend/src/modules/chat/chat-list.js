import API from '../../api.js';

let rooms = [];

export async function init() {
  console.log('Initializing chat list...');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-container">
      <aside class="sidebar">
        <header class="sidebar-header">
          <h1 class="sidebar-title">Chats</h1>
          <div class="flex gap-sm">
            <button class="btn-icon" id="new-chat-btn" title="New chat">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button class="btn-icon" id="tasks-btn" title="Tasks">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            </button>
            <button class="btn-icon" id="logout-btn" title="Logout">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </header>
        
        <div class="sidebar-content">
          <div id="chat-list" class="chat-list">
            <div class="loading">Loading chats...</div>
          </div>
        </div>
      </aside>
      
      <main class="main-content" id="main-content">
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <h2>Select a chat to start messaging</h2>
          <p>Or create a new chat to get started</p>
        </div>
      </main>
    </div>
  `;

  // Load chats
  await loadRooms();

  // Setup event listeners
  setupEventListeners();
}

async function loadRooms() {
  try {
    console.log('Loading rooms...');
    rooms = await API.getRooms();
    console.log('Rooms loaded:', rooms);
    renderRooms();
  } catch (error) {
    console.error('Failed to load rooms:', error);
    document.getElementById('chat-list').innerHTML = `
      <div class="empty-state">
        <p class="text-danger">Failed to load chats</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderRooms() {
  const container = document.getElementById('chat-list');

  if (rooms.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>No chats yet</h3>
        <p>Create your first chat!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = rooms.map(room => `
    <div class="chat-item" data-room-id="${room.id}">
      <div class="avatar">${getInitials(room.name)}</div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <h3 class="chat-item-title">${escapeHtml(room.name)}</h3>
          <span class="chat-item-time">${room.last_message_at ? formatTime(room.last_message_at) : ''}</span>
        </div>
        <p class="chat-item-message">
          ${room.last_message ? escapeHtml(room.last_message) : 'No messages yet'}
        </p>
      </div>
      ${room.unread_count > 0 ? `<span class="badge">${room.unread_count}</span>` : ''}
    </div>
  `).join('');

  // Add click listeners
  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      const roomId = item.dataset.roomId;
      window.app.router.navigate(`/chat/${roomId}`);
    });
  });
}

function setupEventListeners() {
  document.getElementById('new-chat-btn').addEventListener('click', showNewChatModal);
  document.getElementById('tasks-btn').addEventListener('click', () => {
    window.app.router.navigate('/tasks');
  });
  document.getElementById('logout-btn').addEventListener('click', () => {
    window.app.logout();
  });
}

function showNewChatModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <h2 class="modal-title">New Chat</h2>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <form id="new-chat-form">
          <div class="form-group">
            <label for="chat-name">Chat Name</label>
            <input type="text" id="chat-name" name="name" class="input" placeholder="Enter chat name" required />
          </div>
          <div class="form-group">
            <label for="chat-type">Type</label>
            <select id="chat-type" name="type" class="input">
              <option value="group">Group</option>
              <option value="private">Private</option>
            </select>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="create-btn">Create</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#new-chat-form');

  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-btn').addEventListener('click', () => modal.remove());
  
  modal.querySelector('#create-btn').addEventListener('click', async () => {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const data = {
      name: formData.get('name'),
      type: formData.get('type'),
    };

    try {
      const room = await API.createRoom(data);
      rooms.unshift(room);
      renderRooms();
      modal.remove();
      
      // Navigate to new chat
      window.app.router.navigate(`/chat/${room.id}`);
    } catch (error) {
      console.error('Failed to create chat:', error);
      alert('Failed to create chat');
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
