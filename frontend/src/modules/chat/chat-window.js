// chat-window.js
import API from '../../api.js';
import { formatTime, formatLastSeen, getInitials, escapeHtml } from '../../shared/utils/helpers.js';
import * as AddMemberModal from './add-member-modal.js';
import * as FilePreview from './file-preview-modal.js';

let currentRoomId = null;
let messages = [];
let loadingMore = false;
let typingTimeout = null;
let typingUsers = new Set();
let room = null;

export async function init(roomId) {
  currentRoomId = roomId;
  
  console.log('🟢 Opening chat:', roomId);

  const mainContent = document.getElementById('main-content');
  mainContent.classList.add('mobile-chat-active');
  mainContent.innerHTML = `
    <div class="chat-window">
      <header class="chat-header">
        <button class="back-btn mobile-only" id="chat-back-btn">←</button>
        <div class="avatar" id="chat-avatar"></div>
        <div class="chat-info">
          <h2 class="chat-name" id="chat-name">Загрузка...</h2>
          <span class="chat-status" id="chat-status"></span>
        </div>
        <button class="btn-icon" id="add-member-btn" title="Add member">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <line x1="20" y1="8" x2="20" y2="14"/>
            <line x1="23" y1="11" x2="17" y2="11"/>
          </svg>
        </button>

        <button class="btn-icon" id="audio-call-btn" title="Audio call">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
</button>

<button class="btn-icon" id="video-call-btn" title="Video call">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
</button>
        <button class="btn-icon" id="chat-menu-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="12" cy="6" r="1"/>
            <circle cx="12" cy="18" r="1"/>
          </svg>
        </button>
      </header>
      
      <div class="messages-container" id="messages">
        <div class="loading">Загрузка сообщений...</div>
      </div>
      
      <div class="message-input-container">
        <input type="file" id="file-input" style="display: none;" />
        <button class="btn-icon" id="attach-btn" title="Attach file">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <textarea 
          id="message-input" 
          class="message-input"
          placeholder="Введите сообщение..."
          rows="1"
        ></textarea>
        <button 
          type="submit" 
          class="btn btn-primary btn-icon" 
          id="send-btn"
          title="Отправить сообщение"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  if (window.innerWidth <= 768) {
    mainContent.classList.add('mobile-chat-active');
  }

  await Promise.all([
    loadRoomInfo(),
    loadMessages(),
  ]);

  await connectWebSocket();
  setupEventListeners();
  window.addEventListener('ws:event', handleWebSocketEvent);
  window.addEventListener('avatar-updated', handleAvatarUpdate);

  if (window.innerWidth > 768) {
    document.getElementById('message-input').focus();
  }
}

async function connectWebSocket() {
  try {
    console.log('🟡 Connecting to WebSocket...');
    
    if (!window.app.ws) {
      console.error('❌ WebSocket manager not initialized');
      return;
    }
    
    if (!window.app.ws.ws || window.app.ws.ws.readyState !== WebSocket.OPEN) {
      await window.app.ws.connect();
    }
    
    console.log('🟡 Subscribing to room:', currentRoomId);
    window.app.ws.subscribe(`room:${currentRoomId}`);
    
    console.log('✅ WebSocket connected and subscribed');
  } catch (error) {
    console.error('❌ Failed to connect WebSocket:', error);
  }
}

async function loadRoomInfo() {
  try {
    room = await API.getRoom(currentRoomId);
    
    let roomName = room.name || 'Chat';
    let avatarUrl = room.avatar_url;
    let statusText;

    if (room.type === 'private') {
      if (room.is_online) {
        statusText = 'online';
      } else if (room.last_seen) {
        statusText = formatLastSeen(room.last_seen);
      } else {
        statusText = 'offline';
      }
    } else {
      statusText = `${room.member_count || 0} участников`;
    }

    document.getElementById('chat-name').textContent = roomName;
    
    const avatarEl = document.getElementById('chat-avatar');
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" alt="${roomName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
      avatarEl.textContent = getInitials(roomName);
    }
    
    const statusEl = document.getElementById('chat-status');
    statusEl.textContent = statusText;
    
    if (room.type === 'private' && room.is_online) {
      statusEl.classList.add('online');
    } else {
      statusEl.classList.remove('online');
    }

    // Hide add member button for private chats
    const addMemberBtn = document.getElementById('add-member-btn');
    if (room.type === 'private') {
      addMemberBtn.style.display = 'none';
    }
    
    console.log('Room loaded:', room);
  } catch (error) {
    console.error('Failed to load room info:', error);
    document.getElementById('chat-name').textContent = 'Unknown Room';
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
      
      const unreadIds = messages
        .filter(m => !m.is_read && m.user_id !== window.app.user.id)
        .map(m => m.id);
      
      if (unreadIds.length > 0) {
        await API.markAsRead(currentRoomId, unreadIds).catch(console.error);
      }
    }

  } catch (error) {
    console.error('Failed to load messages:', error);
    
    const container = document.getElementById('messages');
    container.innerHTML = `
      <div class="empty-state">
        <p class="text-danger">Ошибка загрузки сообщений</p>
        <button class="btn btn-primary" onclick="location.reload()">Повторить</button>
      </div>
    `;
  } finally {
    loadingMore = false;
  }
}

function getMessageStatus(msg) {
  if (msg.pending) {
    return `
      <span class="message-status pending">
        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm3.5-6a.5.5 0 0 1-.5.5H8a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 1 0v3.5H11a.5.5 0 0 1 .5.5z"/>
        </svg>
      </span>
    `;
  }
  
  if (msg.is_read) {
    return `
      <span class="message-status read" title="Read">
        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <path d="M1.5 8.5l3 3 8-8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4.5 8.5l3 3 8-8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    `;
  }
  
  return `
    <span class="message-status" title="Sent">
      <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.5 8.5l3 3 8-8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  `;
}

function renderMessages() {
  const container = document.getElementById('messages');
  const scrollHeight = container.scrollHeight;
  const scrollTop = container.scrollTop;

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👋</div>
        <p>Нет сообщений. Начните разговор!</p>
      </div>
    `;
    return;
  }

  const currentUserId = window.app.user.id;
  
  let html = messages.map(msg => {
    const isOwn = msg.user_id === currentUserId;
    const statusHtml = isOwn ? getMessageStatus(msg) : '';

    let avatarHtml = '';
    if (!isOwn) {
      if (msg.avatar_url) {
        avatarHtml = `<div class="avatar avatar-sm"><img src="${msg.avatar_url}" alt="${msg.username}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;"></div>`;
      } else {
        const avatarText = getInitials(msg.username || 'User');
        avatarHtml = `<div class="avatar avatar-sm">${avatarText}</div>`;
      }
    }

    let messageContent = '';
    
    // File message
    if (msg.file_url) {
      const isImage = msg.file_type && msg.file_type.startsWith('image/');
      const isVideo = msg.file_type && msg.file_type.startsWith('video/');
      
      if (isImage) {
        messageContent = `
          <div class="message-file message-image" data-file-url="${msg.file_url}" data-file-name="${msg.file_name || 'image'}" data-file-type="${msg.file_type}">
            <img src="${msg.file_url}" alt="${msg.file_name || 'image'}" style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer;">
          </div>
        `;
      } else if (isVideo) {
        messageContent = `
          <div class="message-file message-video" data-file-url="${msg.file_url}" data-file-name="${msg.file_name || 'video'}" data-file-type="${msg.file_type}">
            <video style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer;">
              <source src="${msg.file_url}" type="${msg.file_type}">
            </video>
            <div class="video-overlay">▶</div>
          </div>
        `;
      } else {
        messageContent = `
          <div class="message-file" data-file-url="${msg.file_url}" data-file-name="${msg.file_name || 'file'}" data-file-type="${msg.file_type}">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            <div>
              <div class="file-name">${escapeHtml(msg.file_name || 'file')}</div>
              <div class="file-size">${formatFileSize(msg.file_size)}</div>
            </div>
          </div>
        `;
      }
      
      if (msg.content) {
        messageContent += `<div class="message-text">${escapeHtml(msg.content)}</div>`;
      }
    } else {
      // Text message
      messageContent = `<div class="message-text">${escapeHtml(msg.content)}</div>`;
    }

    return `
      <div class="message ${isOwn ? 'own' : ''} ${msg.pending ? 'pending' : ''}" data-id="${msg.id}">
        ${avatarHtml}
        <div class="message-content">
          ${!isOwn ? `<span class="username">${escapeHtml(msg.username)}</span>` : ''}
          ${messageContent}
          <span class="message-time">
            ${formatTime(msg.created_at)}
            ${statusHtml}
          </span>
        </div>
      </div>
    `;
  }).join('');
  
  if (typingUsers.size > 0) {
    html += `
      <div class="typing-indicator" id="typing-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
  }
  
  container.innerHTML = html;

  // Add click handlers for files
  container.querySelectorAll('.message-file').forEach(el => {
    el.addEventListener('click', () => {
      const fileUrl = el.dataset.fileUrl;
      const fileName = el.dataset.fileName;
      const fileType = el.dataset.fileType;
      FilePreview.show(fileUrl, fileName, fileType);
    });
  });

  if (scrollTop > 0) {
    container.scrollTop = container.scrollHeight - scrollHeight + scrollTop;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function setupEventListeners() {
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const backBtn = document.getElementById('chat-back-btn');
  const addMemberBtn = document.getElementById('add-member-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const audioCallBtn = document.getElementById('audio-call-btn');
  const videoCallBtn = document.getElementById('video-call-btn');


  if (audioCallBtn) {
  audioCallBtn.addEventListener('click', () => startCall('audio'));
}

if (videoCallBtn) {
  videoCallBtn.addEventListener('click', () => startCall('video'));
}

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    
    const hasText = input.value.trim().length > 0;
    sendBtn.disabled = !hasText;
  });

  sendBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await sendMessage();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      sendMessage();
    }
  });

  let isTyping = false;
  input.addEventListener('input', () => {
    if (window.app.ws && window.app.ws.sendTyping) {
      if (!isTyping) {
        isTyping = true;
        window.app.ws.sendTyping(currentRoomId, true);
      }
      
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        window.app.ws.sendTyping(currentRoomId, false);
      }, 1000);
    }
  });

  attachBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      alert('File is too large. Max size is 100MB');
      return;
    }

    await uploadAndSendFile(file);
    fileInput.value = '';
  });

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      cleanup();
      
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.classList.remove('mobile-chat-active');
      }
      
      window.app.router.navigate('/chat');
    });
  }

  if (addMemberBtn) {
    addMemberBtn.addEventListener('click', () => {
      AddMemberModal.show(currentRoomId);
    });
  }

  sendBtn.disabled = true;
}

async function uploadAndSendFile(file) {
  const tempId = 'temp-' + Date.now();
  const tempMessage = {
    id: tempId,
    room_id: currentRoomId,
    user_id: window.app.user.id,
    username: window.app.user.username,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    content: '',
    created_at: new Date().toISOString(),
    pending: true,
  };

  messages.push(tempMessage);
  renderMessages();
  scrollToBottom(true);

  try {
    console.log('📤 Uploading file:', file.name);

    const uploadResult = await API.uploadChatFile(currentRoomId, file);

    console.log('✅ File uploaded:', uploadResult);

    const sentMessage = await API.sendMessage({
      roomId: currentRoomId,
      content: '',
      type: 'file',
      fileId: uploadResult.id,
      fileUrl: uploadResult.url,
      fileName: uploadResult.filename,
      fileType: uploadResult.mime_type,
    });

    console.log('✅ Message sent:', sentMessage);

    const index = messages.findIndex(m => m.id === tempId);
    if (index !== -1) {
      messages[index] = sentMessage;
      renderMessages();
    }

  } catch (error) {
    console.error('❌ Failed to upload file:', error);
    
    messages = messages.filter(m => m.id !== tempId);
    renderMessages();
    
    alert('Failed to upload file: ' + error.message);
  }
}


async function startCall(type) {
  try {
    console.log('📞 Starting call:', type);
    console.log('📞 Room type:', room.type);
    
    // Для private - найти второго пользователя
    // Для group - использовать roomId для broadcast
    let targetUserId = null;
    let isConference = false;
    
    if (room.type === 'private') {
      const otherMember = room.members?.find(m => m.id !== window.app.user.id);
      if (otherMember) {
        targetUserId = otherMember.id;
        console.log('🎯 Target user (1-1):', targetUserId);
      } else {
        throw new Error('Cannot find other participant');
      }
    } else if (room.type === 'group') {
      isConference = true;
      console.log('🎯 Group call - using roomId:', currentRoomId);
    }
    
    const call = await API.startCall(currentRoomId, type);
    
    const { default: ActiveCallWindow } = await import('../calls/active-call-window.js');
    await ActiveCallWindow.show({
      callId: call.id,
      roomId: currentRoomId, // ✅ ВСЕГДА передаем roomId
      roomName: room.name,
      callType: type,
      isConference: isConference,
      targetUserId: targetUserId, // null для group, userId для private
    }, true);
    
  } catch (error) {
    console.error('Failed to start call:', error);
    alert('Failed to start call: ' + error.message);
  }
}


async function handleIncomingCall(callData) {
  console.log('📞 Incoming call:', callData);
  
  if (callData.initiatorId === window.app.user.id) {
    return; // Это наш звонок
  }
  
  const { default: IncomingCallModal } = await import('../calls/incoming-call-modal.js');
  IncomingCallModal.show({
    callId: callData.callId,
    roomId: callData.roomId,
    initiatorId: callData.initiatorId,  // ✅ ДОБАВЛЕНО
    initiatorName: 'User',
    callType: callData.callType,
  });
}

function handleCallEnded(data) {
  console.log('📞 Call ended:', data);
  
  const { default: ActiveCallWindow } = require('../calls/active-call-window.js');
  ActiveCallWindow.hide();
}

async function handleWebRTCSignal(data) {
  console.log('📞 WebRTC signal:', data);

  const {
    callId,
    fromUserId,
    signal,
  } = data;

  const PeerCallClient = (await import('../calls/peer-call-client.js')).default;

  // 🔥 ВАЖНО: передаём контекст
  await PeerCallClient.handleSignal(
    signal,
    callId,
    fromUserId
  );
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const content = input.value.trim();

  if (!content) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  const tempId = 'temp-' + Date.now();
  const tempMessage = {
    id: tempId,
    room_id: currentRoomId,
    user_id: window.app.user.id,
    username: window.app.user.username,
    content,
    created_at: new Date().toISOString(),
    pending: true,
  };

  messages.push(tempMessage);
  renderMessages();
  scrollToBottom(true);

  try {
    console.log('📤 Sending message:', { roomId: currentRoomId, content });

    const sentMessage = await API.sendMessage({
      roomId: currentRoomId,
      content,
      type: 'text',
    });

    console.log('✅ Message sent:', sentMessage);

    const index = messages.findIndex(m => m.id === tempId);
    if (index !== -1) {
      messages[index] = sentMessage;
      renderMessages();
    }

  } catch (error) {
    console.error('❌ Failed to send message:', error);
    
    messages = messages.filter(m => m.id !== tempId);
    renderMessages();
    
    alert('Failed to send message');
  }
}

function handleWebSocketEvent(event) {
  const { channel, data } = event.detail;
  
  console.log('📨 WebSocket event:', channel, data.type, data.data);

  if (channel === 'webrtc' && data.type === 'webrtc-signal') {
    console.log('📞 WebRTC signal from webrtc channel');
    handleWebRTCSignal(data.data);
    return;
  }

  
  if (channel === 'global' && data.type === 'user_status') {
    handleUserStatusUpdate(data.data);
    return;
  }

console.log('test data.type:', data.type);

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
        
      case 'typing':
        handleTypingIndicator(data.data);
        break;

      case 'call_started':
  handleIncomingCall(data.data);
  break;

case 'call_ended':
  handleCallEnded(data.data);
  break;

    }
  }
}

function handleAvatarUpdate(event) {
  const { avatarUrl } = event.detail;
  
  // Update room avatar if it's a private chat
  if (room && room.type === 'private') {
    loadRoomInfo();
  }
}

function handleUserStatusUpdate({ userId, isOnline }) {
  if (!room || room.type !== 'private') return;
  
  const otherMember = room.members?.find(m => m.id !== window.app.user.id);
  if (!otherMember || otherMember.id !== userId) return;
  
  room.is_online = isOnline;
  if (!isOnline) {
    room.last_seen = new Date().toISOString();
  }
  
  const statusEl = document.getElementById('chat-status');
  if (statusEl && typingUsers.size === 0) {
    if (isOnline) {
      statusEl.textContent = 'online';
      statusEl.classList.add('online');
    } else {
      statusEl.textContent = formatLastSeen(room.last_seen);
      statusEl.classList.remove('online');
    }
  }
}

function handleNewMessage(message) {
  console.log('📬 New message received:', message);
  
  if (message.user_id === window.app.user.id) {
    const exists = messages.find(m => m.id === message.id);
    if (exists) {
      console.log('⏭️ Own message already exists, skipping');
      return;
    }
  }
  
  if (messages.find(m => m.id === message.id)) {
    console.log('⏭️ Message already exists, skipping');
    return;
  }

  messages.push(message);
  renderMessages();

  const container = document.getElementById('messages');
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

  if (isNearBottom || message.user_id === window.app.user.id) {
    scrollToBottom(true);
  }

  if (message.user_id !== window.app.user.id) {
    API.markAsRead(currentRoomId, [message.id]).catch(console.error);
  }
}

function handleMessagesRead({ userId, messageIds }) {
  console.log('📖 Messages read:', { userId, messageIds });
  
  if (userId === window.app.user.id) {
    console.log('⏭️ Own read event, skipping');
    return;
  }

  let updated = false;
  messageIds.forEach(id => {
    const message = messages.find(m => m.id === id);
    if (message && !message.is_read) {
      message.is_read = true;
      updated = true;
      console.log('✅ Marked message as read:', id);
    }
  });
  
  if (updated) {
    console.log('🔄 Re-rendering messages with updated read status');
    renderMessages();
  }
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

function handleTypingIndicator(data) {
  const { userId, username, isTyping } = data;
  
  console.log('⌨️ Typing indicator:', { userId, username, isTyping });
  
  if (userId === window.app.user.id) return;

  const statusEl = document.getElementById('chat-status');
  
  if (isTyping) {
    typingUsers.add(username || 'Someone');
    statusEl.textContent = `${username || 'Someone'} печатает...`;
    statusEl.classList.add('typing');
  } else {
    typingUsers.delete(username || 'Someone');
    
    if (typingUsers.size === 0) {
      if (room.type === 'private') {
        if (room.is_online) {
          statusEl.textContent = 'online';
          statusEl.classList.add('online');
        } else {
          statusEl.textContent = formatLastSeen(room.last_seen);
          statusEl.classList.remove('online');
        }
      } else {
        statusEl.textContent = `${room?.member_count || 0} участников`;
      }
      statusEl.classList.remove('typing');
    } else {
      const names = Array.from(typingUsers);
      statusEl.textContent = `${names.join(', ')} ${names.length > 1 ? 'печатают...' : 'печатает...'}`;
    }
  }
  
  renderMessages();
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
  console.log('🧹 Cleaning up chat window');
  
  if (window.app.ws && window.app.ws.unsubscribe) {
    window.app.ws.unsubscribe(`room:${currentRoomId}`);
  }
  
  window.removeEventListener('ws:event', handleWebSocketEvent);
  window.removeEventListener('avatar-updated', handleAvatarUpdate);
  clearTimeout(typingTimeout);
  typingUsers.clear();
}
