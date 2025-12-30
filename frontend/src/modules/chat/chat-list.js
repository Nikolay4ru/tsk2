import API from '../../api.js';
import { formatTime, getInitials, escapeHtml } from '../../shared/utils/helpers.js';

let rooms = [];
let typingStatus = new Map();

export async function init() {
  console.log('🟢 Initializing chat list');

  const mainContent = document.getElementById('main-content');
  
  // Clear mobile-chat-active class
  mainContent.classList.remove('mobile-chat-active');
  
  mainContent.innerHTML = `
    <div class="chat-list-container">
      <header class="chat-list-header">
        <h1>Chats</h1>
        <button class="btn btn-primary" id="new-chat-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New Chat
        </button>
      </header>
      
      <div class="chat-list" id="chat-list">
        <div class="loading">Loading chats...</div>
      </div>
    </div>
  `;

  await loadRooms();
  setupEventListeners();
  subscribeToRooms();
  window.addEventListener('ws:event', handleWebSocketEvent);
}

async function loadRooms() {
  try {
    rooms = await API.getRooms();
    console.log('Rooms loaded:', rooms);
    renderRooms();
  } catch (error) {
    console.error('Failed to load rooms:', error);
    const container = document.getElementById('chat-list');
    container.innerHTML = `
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
        <div class="empty-state-icon">💬</div>
        <p>No chats yet</p>
        <button class="btn btn-primary" id="new-chat-empty">Start a conversation</button>
      </div>
    `;
    document.getElementById('new-chat-empty')?.addEventListener('click', showNewChatModal);
    return;
  }

  container.innerHTML = rooms.map(room => {
    const roomName = room.name || 'Chat';
    const avatarText = getInitials(roomName);
    
    let lastMessageText = '';
    if (room.last_message) {
      if (typeof room.last_message === 'object') {
        lastMessageText = room.last_message.content || '';
      } else {
        lastMessageText = room.last_message;
      }
    }
    
    const isTyping = typingStatus.has(room.id);
    const typingUser = typingStatus.get(room.id);
    const unreadCount = room.unread_count || 0;
    const unreadBadge = unreadCount > 0 
      ? `<span class="badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` 
      : '';

    return `
      <div class="chat-item" data-room-id="${room.id}">
        <div class="avatar">${avatarText}</div>
        <div class="chat-item-content">
          <div class="chat-item-header">
            <span class="chat-item-name">${escapeHtml(roomName)}</span>
            <span class="chat-item-time">${room.updated_at ? formatTime(room.updated_at) : ''}</span>
          </div>
          <div class="chat-item-message ${isTyping ? 'typing' : ''}">
            ${isTyping 
              ? `<span class="typing-text">${escapeHtml(typingUser)} is typing...</span>`
              : escapeHtml(lastMessageText || 'No messages yet')
            }
          </div>
        </div>
        ${unreadBadge}
      </div>
    `;
  }).join('');

  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      const roomId = item.dataset.roomId;
      window.app.router.navigate(`/chat/${roomId}`);
    });
  });
}

function setupEventListeners() {
  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', showNewChatModal);
  }
}

function showNewChatModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'new-chat-modal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>New Chat</h2>
        <button class="btn-icon" id="close-modal">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Chat Name</label>
          <input type="text" id="chat-name" class="input" placeholder="Enter chat name" />
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="chat-type" class="input">
            <option value="group">Group</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="create-btn">Create</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('close-modal').addEventListener('click', () => modal.remove());
  document.getElementById('cancel-btn').addEventListener('click', () => modal.remove());
  document.getElementById('create-btn').addEventListener('click', async () => {
    const name = document.getElementById('chat-name').value.trim();
    const type = document.getElementById('chat-type').value;

    if (!name) {
      alert('Please enter a chat name');
      return;
    }

    try {
      const room = await API.createRoom({ name, type, encrypted: false });
      modal.remove();
      window.app.router.navigate(`/chat/${room.id}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Failed to create chat');
    }
  });
}

function subscribeToRooms() {
  if (!window.app.ws) return;
  rooms.forEach(room => {
    window.app.ws.subscribe(`room:${room.id}`);
  });
  console.log('✅ Subscribed to', rooms.length, 'rooms');
}

function handleWebSocketEvent(event) {
  const { channel, data } = event.detail;
  const match = channel.match(/^room:(.+)$/);
  if (!match) return;
  
  const roomId = match[1];
  
  switch (data.type) {
    case 'new_message':
      handleNewMessage(roomId, data.data);
      break;
    case 'typing':
      handleTyping(roomId, data.data);
      break;
    case 'messages_read':
      handleMessagesRead(roomId, data.data);
      break;
  }
}

function handleNewMessage(roomId, message) {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return;
  
  room.last_message = { content: message.content, created_at: message.created_at };
  room.updated_at = message.created_at;
  
  if (message.user_id !== window.app.user.id) {
    room.unread_count = (room.unread_count || 0) + 1;
  }
  
  rooms = [room, ...rooms.filter(r => r.id !== roomId)];
  typingStatus.delete(roomId);
  renderRooms();
}

function handleTyping(roomId, data) {
  const { userId, username, isTyping } = data;
  if (userId === window.app.user.id) return;
  
  if (isTyping) {
    typingStatus.set(roomId, username);
  } else {
    typingStatus.delete(roomId);
  }
  renderRooms();
}

function handleMessagesRead(roomId, data) {
  const { userId, messageIds } = data;
  if (userId !== window.app.user.id) return;
  
  const room = rooms.find(r => r.id === roomId);
  if (!room) return;
  
  room.unread_count = Math.max(0, (room.unread_count || 0) - messageIds.length);
  renderRooms();
}

export function cleanup() {
  console.log('🧹 Cleaning up chat list');
  if (window.app.ws) {
    rooms.forEach(room => {
      window.app.ws.unsubscribe(`room:${room.id}`);
    });
  }
  window.removeEventListener('ws:event', handleWebSocketEvent);
  typingStatus.clear();
}
