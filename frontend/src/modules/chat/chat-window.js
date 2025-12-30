// frontend/src/modules/chat/chat-window.js
// ============================================

import API from '../../api.js';
import Router from '../../router.js';
import WebSocket from '../../websocket.js';
import { formatTime, getInitials, escapeHtml } from '../../shared/utils/helpers.js';

let currentRoomId = null;
let messages = [];
let loadingMore = false;
let typingTimeout = null;
let room = null;

export async function init(roomId) {
  currentRoomId = roomId;
  console.log('Opening chat:', roomId);

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = `
    <div class="chat-window">
      <header class="chat-header">
        <button class="back-btn">←</button>
        <div class="avatar" id="chat-avatar"></div>
        <div class="chat-info">
          <h2 class="chat-name" id="chat-name">Loading...</h2>
          <span class="chat-status" id="chat-status"></span>
        </div>
        <button class="btn-icon" id="chat-menu-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="5" r="1"/>
            <circle cx="12" cy="12" r="1"/>
            <circle cx="12" cy="19" r="1"/>
          </svg>
        </button>
      </header>
      
      <div class="messages-container" id="messages">
        <div class="loading">Loading messages...</div>
      </div>
      
      <div class="message-input-container">
        <textarea 
          id="message-input" 
          class="message-input"
          placeholder="Type a message..."
          rows="1"
        ></textarea>
        <button id="send-btn" class="send-btn" disabled>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // Load room info and messages
  await Promise.all([
    loadRoomInfo(),
    loadMessages(),
  ]);

  // Subscribe to room updates
  WebSocket.subscribe(`room:${roomId}`);

  // Setup event listeners
  setupEventListeners();

  // Listen for WebSocket events
  window.addEventListener('ws:event', handleWebSocketEvent);

  // Focus input
  document.getElementById('message-input').focus();

  // Cleanup on navigation
  window.addEventListener('beforeunload', cleanup);
}

async function loadRoomInfo() {
  try {
    room = await API.getRoom(currentRoomId);
    
    let roomName = room.name;
    let avatarText = '';
    let statusText = '';

    if (room.type === 'private' && room.members) {
      const otherMember = room.members.find(m => m.id !== window.app.user.id);
      if (otherMember) {
        roomName = otherMember.username;
        avatarText = getInitials(otherMember.username);
        statusText = otherMember.status === 'online' ? 'Online' : 'Offline';
      }
    } else if (room.members) {
      avatarText = getInitials(room.name || 'Group');
      statusText = `${room.members.length} members`;
    }

    document.getElementById('chat-name').textContent = roomName || 'Unnamed Chat';
    document.getElementById('chat-avatar').textContent = avatarText;
    document.getElementById('chat-status').textContent = statusText;
    
  } catch (error) {
    console.error('Failed to load room info:', error);
  }
}

async function loadMessages(before = null) {
  if (loadingMore) return;
  loadingMore = true;

  try {
    const options = { limit: 50 };
    if (before) options.before = before;

    const newMessages = await API.getMessages(currentRoomId, options);

    if (before) {
      messages = [...newMessages, ...messages];
    } else {
      messages = newMessages;
    }

    renderMessages();

    if (!before) {
      scrollToBottom(false);
      
      // Mark all as read
      const unreadIds = messages
        .filter(m => !m.is_read && m.user_id !== window.app.user.id)
        .map(m => m.id);
      
      if (unreadIds.length > 0) {
        await API.markAsRead(currentRoomId, unreadIds);
      }
    }

  } catch (error) {
    console.error('Failed to load messages:', error);
  } finally {
    loadingMore = false;
  }
}

function renderMessages() {
  const container = document.getElementById('messages');
  const scrollHeight = container.scrollHeight;
  const scrollTop = container.scrollTop;

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👋</div>
        <p>No messages yet. Start the conversation!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const isOwn = msg.user_id === window.app.user.id;
    const avatarText = getInitials(msg.username || 'User');

    return `
      <div class="message ${isOwn ? 'own' : ''} ${msg.pending ? 'pending' : ''}" data-id="${msg.id}">
        ${!isOwn ? `<div class="avatar avatar-sm">${avatarText}</div>` : ''}
        <div class="message-content">
          ${!isOwn ? `<span class="username">${escapeHtml(msg.username)}</span>` : ''}
          <div class="message-text">${escapeHtml(msg.content)}</div>
          <span class="message-time">${formatTime(msg.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Restore scroll position if loading more
  if (scrollTop > 0) {
    container.scrollTop = container.scrollHeight - scrollHeight + scrollTop;
  }

  // Infinite scroll
  container.addEventListener('scroll', handleScroll, { passive: true });
}

function handleScroll() {
  const container = document.getElementById('messages');
  
  if (container.scrollTop < 100 && !loadingMore && messages.length >= 50) {
    loadMessages(messages[0].created_at);
  }
}

function setupEventListeners() {
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const backBtn = document.querySelector('.back-btn');

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    
    // Enable/disable send button
    sendBtn.disabled = !input.value.trim();
  });

  // Send message
  sendBtn.addEventListener('click', sendMessage);
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Typing indicator
  input.addEventListener('input', () => {
    WebSocket.sendTyping(currentRoomId, true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      WebSocket.sendTyping(currentRoomId, false);
    }, 1000);
  });

  // Back button
  backBtn.addEventListener('click', () => {
    Router.navigate('/chat');
  });

  // Mobile keyboard handling
  if ('visualViewport' in window) {
    window.visualViewport.addEventListener('resize', () => {
      const viewportHeight = window.visualViewport.height;
      document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
    });
  }

  // Auto-scroll on input focus (mobile)
  input.addEventListener('focus', () => {
    setTimeout(() => scrollToBottom(true), 300);
  });
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const content = input.value.trim();

  if (!content) return;

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  // Optimistic UI update
  const tempMessage = {
    id: 'temp-' + Date.now(),
    room_id: currentRoomId,
    user_id: window.app.user.id,
    username: window.app.user.username,
    avatar_url: window.app.user.avatar_url,
    content,
    created_at: new Date().toISOString(),
    pending: true,
  };

  messages.push(tempMessage);
  renderMessages();
  scrollToBottom(true);

  try {
    const sentMessage = await API.sendMessage({
      roomId: currentRoomId,
      content,
      type: 'text',
    });

    // Replace temp message with real one
    const index = messages.findIndex(m => m.id === tempMessage.id);
    if (index !== -1) {
      messages[index] = sentMessage;
      renderMessages();
    }

  } catch (error) {
    console.error('Failed to send message:', error);
    
    // Remove failed message
    messages = messages.filter(m => m.id !== tempMessage.id);
    renderMessages();
    
    alert('Failed to send message');
  }
}

function handleWebSocketEvent(event) {
  const { channel, data } = event.detail;

  if (channel === `room:${currentRoomId}`) {
    switch (data.type) {
      case 'new_message':
        handleNewMessage(data.data);
        break;

      case 'messages_read':
        handleMessagesRead(data.data);
        break;

      case 'message_deleted':
        handleMessageDeleted(data.data);
        break;

      case 'message_updated':
        handleMessageUpdated(data.data);
        break;
    }
  } else if (channel === `room:${currentRoomId}:typing`) {
    handleTypingIndicator(data);
  }
}

function handleNewMessage(message) {
  // Avoid duplicates
  if (messages.find(m => m.id === message.id)) return;

  messages.push(message);
  renderMessages();

  const container = document.getElementById('messages');
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

  if (isNearBottom || message.user_id === window.app.user.id) {
    scrollToBottom(true);
  }

  // Mark as read if from another user
  if (message.user_id !== window.app.user.id) {
    API.markAsRead(currentRoomId, [message.id]);
  }
}

function handleMessagesRead({ userId, messageIds }) {
  if (userId === window.app.user.id) return;

  messageIds.forEach(id => {
    const message = messages.find(m => m.id === id);
    if (message) {
      message.is_read = true;
    }
  });

  // Update UI if needed (e.g., show read receipts)
}

function handleMessageDeleted({ messageId }) {
  messages = messages.filter(m => m.id !== messageId);
  renderMessages();
}

function handleMessageUpdated(updatedMessage) {
  const index = messages.findIndex(m => m.id === updatedMessage.id);
  if (index !== -1) {
    messages[index] = { ...messages[index], ...updatedMessage };
    renderMessages();
  }
}

function handleTypingIndicator({ userId, username, isTyping }) {
  if (userId === window.app.user.id) return;

  const statusEl = document.getElementById('chat-status');
  
  if (isTyping) {
    statusEl.textContent = 'typing...';
    statusEl.style.color = 'var(--color-primary)';
  } else {
    // Restore original status
    if (room && room.type === 'private') {
      const otherMember = room.members?.find(m => m.id !== window.app.user.id);
      statusEl.textContent = otherMember?.status === 'online' ? 'Online' : 'Offline';
    } else {
      statusEl.textContent = room?.members ? `${room.members.length} members` : '';
    }
    statusEl.style.color = '';
  }
}

function scrollToBottom(smooth = false) {
  const container = document.getElementById('messages');
  if (smooth) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  } else {
    container.scrollTop = container.scrollHeight;
  }
}

function cleanup() {
  WebSocket.unsubscribe(`room:${currentRoomId}`);
  window.removeEventListener('ws:event', handleWebSocketEvent);
  clearTimeout(typingTimeout);
}