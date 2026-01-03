import API from '../../api.js';
import { formatTime, getInitials, escapeHtml } from '../../shared/utils/helpers.js';
import * as StartChatModal from './start-chat-modal.js';

let rooms = [];
let typingStatus = new Map();

export async function init() {
  console.log('🟢 Initializing chat list');

  const container = document.getElementById('chat-list-container');
  
  container.innerHTML = `
    <header class="chat-list-header">
      <button class="back-btn-mobile" id="back-to-menu">←</button>
      <h3>Chats</h3>
      <button class="btn-icon" id="new-chat-btn" title="New Chat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </header>
    
    <div class="chat-list" id="chat-list">
      <div class="loading">Loading chats...</div>
    </div>
  `;

  await loadRooms();
  setupEventListeners();
  subscribeToRooms();
  window.addEventListener('ws:event', handleWebSocketEvent);

  const mainContent = document.getElementById('main-content');
  mainContent.classList.remove('mobile-chat-active');
  mainContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">💬</div>
      <h2>Select a chat to start messaging</h2>
    </div>
  `;
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
    document.getElementById('new-chat-empty')?.addEventListener('click', () => {
      StartChatModal.show();
    });
    return;
  }

  container.innerHTML = rooms.map(room => {
    const roomName = room.name || 'Chat';
    const avatarText = getInitials(roomName);
    
    // Last message
    let lastMessageText = '';
    if (room.last_message) {
      if (typeof room.last_message === 'object') {
        lastMessageText = room.last_message.content || '';
      } else {
        lastMessageText = room.last_message;
      }
    }
    
    // Typing indicator
    const isTyping = typingStatus.has(room.id);
    const typingUser = typingStatus.get(room.id);
    
    // Unread badge
    const unreadCount = room.unread_count || 0;
    const unreadBadge = unreadCount > 0 
      ? `<span class="badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` 
      : '';
    
    // Online indicator (только для private чатов)
    const onlineIndicator = room.type === 'private' && room.is_online 
      ? '<span class="online-indicator"></span>' 
      : '';

    return `
      <div class="chat-item" data-room-id="${room.id}">
        <div class="avatar">
          ${avatarText}
          ${onlineIndicator}
        </div>
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

  // Add click handlers
  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      const roomId = item.dataset.roomId;
      
      document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      window.app.router.navigate(`/chat/${roomId}`);
    });
  });
}

function setupEventListeners() {
  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      StartChatModal.show();
    });
  }

  const backBtn = document.getElementById('back-to-menu');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      console.log('📱 Back to menu clicked');
      const chatListContainer = document.getElementById('chat-list-container');
      if (chatListContainer) {
        chatListContainer.classList.remove('mobile-active');
      }
    });
  }
}

function subscribeToRooms() {
  if (!window.app.ws) return;
  
  // Subscribe to all rooms
  rooms.forEach(room => {
    window.app.ws.subscribe(`room:${room.id}`);
  });
  
  console.log('✅ Subscribed to', rooms.length, 'rooms');
}

function handleWebSocketEvent(event) {
  const { channel, data } = event.detail;
  
  // Handle global user status updates
  if (channel === 'global' && data.type === 'user_status') {
    handleUserStatusChange(data.data);
    return;
  }
  
  // Handle room events
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

function handleUserStatusChange({ userId, isOnline }) {
  // Обновить онлайн-статус в списке чатов
  let updated = false;
  
  rooms.forEach(room => {
    if (room.type === 'private' && room.other_members) {
      const otherUser = room.other_members.find(u => u.id === userId);
      if (otherUser) {
        room.is_online = isOnline;
        if (!isOnline) {
          room.last_seen = new Date().toISOString();
        }
        updated = true;
      }
    }
  });
  
  if (updated) {
    renderRooms();
  }
}

function handleNewMessage(roomId, message) {
  let room = rooms.find(r => r.id === roomId);
  
  // Если чата нет в списке - добавить
  if (!room) {
    console.log('New room detected, reloading list...');
    loadRooms();
    return;
  }
  
  // Обновить last message
  room.last_message = { 
    content: message.content, 
    created_at: message.created_at 
  };
  room.updated_at = message.created_at;
  
  // Увеличить unread count если сообщение не от текущего пользователя
  if (message.user_id !== window.app.user.id) {
    room.unread_count = (room.unread_count || 0) + 1;
  }
  
  // Переместить чат в начало списка
  rooms = [room, ...rooms.filter(r => r.id !== roomId)];
  
  // Убрать typing indicator
  typingStatus.delete(roomId);
  
  // Подписаться на новый чат если еще не подписаны
  if (window.app.ws) {
    window.app.ws.subscribe(`room:${roomId}`);
  }
  
  renderRooms();
}

function handleTyping(roomId, data) {
  const { userId, username, isTyping } = data;
  
  // Не показывать свой typing indicator
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
  
  // Обновить только свой unread count
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
