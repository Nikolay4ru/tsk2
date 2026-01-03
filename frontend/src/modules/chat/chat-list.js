import API from '../../api.js';
import { formatTime, getInitials, escapeHtml, formatLastSeen } from '../../shared/utils/helpers.js';
import * as StartChatModal from './start-chat-modal.js';
import * as AvatarUploadModal from '../profile/avatar-upload-modal.js';

let rooms = [];
let typingStatus = new Map();

export async function init() {
  console.log('🟢 Initializing chat list');

  const container = document.getElementById('chat-list-container');
  
  container.innerHTML = `
    <header class="chat-list-header">
      <button class="back-btn-mobile" id="back-to-menu">←</button>
      <div class="avatar avatar-current-user" id="current-user-avatar" title="Upload avatar"></div>
      <h3>Chats</h3>
      <button class="btn-icon" id="new-chat-btn" title="New Chat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </header>
    
    <div class="chat-list" id="chat-list">
      <div class="loading">Загрузка чатов...</div>
    </div>
  `;

  updateCurrentUserAvatar();
  await loadRooms();
  setupEventListeners();
  subscribeToRooms();
  window.addEventListener('ws:event', handleWebSocketEvent);
  window.addEventListener('avatar-updated', handleAvatarUpdated);

  const mainContent = document.getElementById('main-content');
  mainContent.classList.remove('mobile-chat-active');
  mainContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">💬</div>
      <h2>Выберите чат для начала переписки</h2>
    </div>
  `;
}

function updateCurrentUserAvatar() {
  const avatarEl = document.getElementById('current-user-avatar');
  if (!avatarEl) return;

  const user = window.app.user;
  if (user && user.avatar_url) {
    avatarEl.innerHTML = `<img src="${user.avatar_url}" alt="${user.username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
  } else {
    avatarEl.textContent = getInitials(user?.username || '?');
  }
}

function handleAvatarUpdated(event) {
  const { avatarUrl } = event.detail;
  
  // Update current user avatar
  if (window.app.user) {
    window.app.user.avatar_url = avatarUrl;
  }
  updateCurrentUserAvatar();
  
  // Reload rooms to update avatars in list
  loadRooms();
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
        <p class="text-danger">Не удалось загрузить чаты</p>
        <button class="btn btn-primary" onclick="location.reload()">Повторить</button>
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
        <button class="btn btn-primary" id="new-chat-empty">Начать разговор</button>
      </div>
    `;
    document.getElementById('new-chat-empty')?.addEventListener('click', () => {
      StartChatModal.show();
    });
    return;
  }

  container.innerHTML = rooms.map(room => {
    const roomName = room.name || 'Chat';
    
    let lastMessageText = '';
    if (room.last_message) {
      if (typeof room.last_message === 'object') {
        lastMessageText = room.last_message.content || '';
      } else {
        lastMessageText = room.last_message;
      }
    }


    if (room.last_message && room.last_message.type === 'file') {
      lastMessageText = `[File] ${room.last_message.file_name}`;
    }

  
    
    const isTyping = typingStatus.has(room.id);
    const typingUser = typingStatus.get(room.id);
    const unreadCount = room.unread_count || 0;
    const unreadBadge = unreadCount > 0 
      ? `<span class="badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` 
      : '';

    console.log('unread Badge:', room.unread_count);
    
    // Online indicator для private чатов
    const onlineIndicator = room.is_online 
      ? '<span class="online-indicator"></span>' 
      : '';

    // Avatar
    let avatarHtml = '';
    if (room.avatar_url) {
      avatarHtml = `
        <div class="avatar">
          <img src="${room.avatar_url}" alt="${roomName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
          ${onlineIndicator}
        </div>
      `;
    } else {
      const avatarText = getInitials(roomName);
      avatarHtml = `
        <div class="avatar">
          ${avatarText}
          ${onlineIndicator}
        </div>
      `;
    }

    return `
      <div class="chat-item" data-room-id="${room.id}">
        ${avatarHtml}
        <div class="chat-item-content">
          <div class="chat-item-header">
            <span class="chat-item-name">${escapeHtml(roomName)}</span>
            <span class="chat-item-time">${room.updated_at ? formatTime(room.updated_at) : ''}</span>
          </div>
          <div class="chat-item-message ${isTyping ? 'typing' : ''}">
            ${isTyping 
              ? `<span class="typing-text">${escapeHtml(typingUser)} печатает...</span>`
              : escapeHtml(lastMessageText || 'Пока нет сообщений')
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

  const avatarEl = document.getElementById('current-user-avatar');
  if (avatarEl) {
    avatarEl.addEventListener('click', () => {
      AvatarUploadModal.show();
    });
  }
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
  
  if (channel === 'global' && data.type === 'user_status') {
    handleUserStatusChange(data.data);
    return;
  }
  
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
  let updated = false;
  rooms.forEach(room => {
    if (room.type === 'private' && room.other_members) {
      const otherUser = room.other_members.find(u => u.id === userId);
      if (otherUser) {
        room.is_online = isOnline;
        updated = true;
      }
    }
  });
  
  if (updated) {
    renderRooms();
  }
}

function handleNewMessage(roomId, message) {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return;
  
  room.last_message = { content: message.content, created_at: message.created_at };
  room.updated_at = message.created_at;
  
  if (message.user_id !== window.app.user.id) {
    console.log('Incrementing unread count for room', room);
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
  window.removeEventListener('avatar-updated', handleAvatarUpdated);
  typingStatus.clear();
}
