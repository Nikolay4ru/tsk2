import API from '../../api.js';

let currentRoomId = null;
let messages = [];
let messageCheckInterval = null;

export async function init(roomId) {
  currentRoomId = roomId;
  console.log('Initializing chat window for room:', roomId);

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-container">
      <aside class="sidebar">
        <header class="sidebar-header">
          <button class="btn-icon" id="back-btn" title="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 class="sidebar-title">Chats</h1>
        </header>
        <div class="sidebar-content" id="sidebar-rooms">
          <div class="loading">Loading...</div>
        </div>
      </aside>
      
      <main class="main-content">
        <header class="chat-header" id="chat-header">
          <div class="chat-header-info">
            <div class="avatar">?</div>
            <div>
              <h2 class="chat-header-title" id="room-name">Loading...</h2>
              <p class="chat-header-status" id="room-status">...</p>
            </div>
          </div>
          <div class="chat-header-actions">
            <button class="btn-icon" title="Room settings">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="chat-messages" id="messages-container">
          <div class="loading">Loading messages...</div>
        </div>

        <div class="chat-input-container">
          <form class="chat-input-form" id="message-form">
            <button type="button" class="btn-icon" title="Attach file">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            
            <input 
              type="text" 
              class="chat-input" 
              id="message-input" 
              placeholder="Type a message..."
              autocomplete="off"
            />
            
            <button 
              type="submit" 
              class="btn btn-primary btn-icon" 
              id="send-btn"
              title="Send message"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </form>
        </div>
      </main>
    </div>
  `;

  // Load room info and messages
  await loadRoom();
  await loadMessages();

  // Setup event listeners
  setupEventListeners();

  // Start polling for new messages (будем заменено на WebSocket)
  startMessagePolling();

  // Load sidebar rooms
  loadSidebarRooms();
}

async function loadRoom() {
  try {
    const room = await API.getRoom(currentRoomId);
    
    document.getElementById('room-name').textContent = room.name || 'Private Chat';
    document.getElementById('room-status').textContent = `${room.member_count || 0} members`;
    
    console.log('Room loaded:', room);
  } catch (error) {
    console.error('Failed to load room:', error);
    document.getElementById('room-name').textContent = 'Unknown Room';
  }
}

async function loadMessages() {
  try {
    console.log('Loading messages for room:', currentRoomId);
    
    messages = await API.getMessages(currentRoomId, { limit: 50 });
    
    console.log('Messages loaded:', messages.length);
    
    renderMessages();
  } catch (error) {
    console.error('Failed to load messages:', error);
    
    const container = document.getElementById('messages-container');
    container.innerHTML = `
      <div class="empty-state">
        <p class="text-danger">Failed to load messages</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderMessages() {
  const container = document.getElementById('messages-container');
  
  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <h3>No messages yet</h3>
        <p>Start the conversation!</p>
      </div>
    `;
    return;
  }

  const currentUserId = window.app.user.id;
  
  container.innerHTML = messages.map(msg => {
    const isOwn = msg.user_id === currentUserId;
    const time = new Date(msg.created_at).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    return `
      <div class="message ${isOwn ? 'message-own' : 'message-other'}">
        ${!isOwn ? `<div class="avatar avatar-sm">${getInitials(msg.username)}</div>` : ''}
        <div class="message-content">
          ${!isOwn ? `<div class="message-author">${escapeHtml(msg.username)}</div>` : ''}
          <div class="message-bubble">
            <p class="message-text">${escapeHtml(msg.content)}</p>
            <span class="message-time">${time}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function setupEventListeners() {
  const form = document.getElementById('message-form');
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const backBtn = document.getElementById('back-btn');

  // Enable/disable send button based on input
  input.addEventListener('input', () => {
    const hasText = input.value.trim().length > 0;
    sendBtn.disabled = !hasText;
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await sendMessage();
  });

  // Back button
  backBtn.addEventListener('click', () => {
    stopMessagePolling();
    window.app.router.navigate('/chat');
  });

  // Initial button state
  sendBtn.disabled = true;
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const content = input.value.trim();

  if (!content) return;

  // Disable input while sending
  input.disabled = true;
  sendBtn.disabled = true;

  try {
    console.log('Sending message:', { roomId: currentRoomId, content });

    const message = await API.sendMessage({
      roomId: currentRoomId,
      content,
      type: 'text',
    });

    console.log('Message sent:', message);

    // Add to messages array
    messages.push(message);
    renderMessages();

    // Clear input
    input.value = '';

  } catch (error) {
    console.error('Failed to send message:', error);
    alert('Failed to send message. Please try again.');
  } finally {
    // Re-enable input
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function startMessagePolling() {
  // Poll for new messages every 2 seconds
  messageCheckInterval = setInterval(async () => {
    try {
      const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : 0;
      
      const newMessages = await API.getMessages(currentRoomId, { 
        after: messages[messages.length - 1]?.created_at,
        limit: 20 
      });

      if (newMessages.length > 0) {
        messages.push(...newMessages);
        renderMessages();
      }
    } catch (error) {
      console.error('Failed to poll messages:', error);
    }
  }, 2000);
}

function stopMessagePolling() {
  if (messageCheckInterval) {
    clearInterval(messageCheckInterval);
    messageCheckInterval = null;
  }
}

async function loadSidebarRooms() {
  try {
    const rooms = await API.getRooms();
    
    const container = document.getElementById('sidebar-rooms');
    
    if (rooms.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No chats</p></div>';
      return;
    }

    container.innerHTML = rooms.map(room => `
      <div class="chat-item ${room.id === currentRoomId ? 'active' : ''}" data-room-id="${room.id}">
        <div class="avatar">${getInitials(room.name || 'Private')}</div>
        <div class="chat-item-content">
          <div class="chat-item-header">
            <h3 class="chat-item-title">${escapeHtml(room.name || 'Private Chat')}</h3>
          </div>
          <p class="chat-item-message">
            ${room.last_message ? escapeHtml(room.last_message.substring(0, 30)) : 'No messages'}
          </p>
        </div>
        ${room.unread_count > 0 ? `<span class="badge">${room.unread_count}</span>` : ''}
      </div>
    `).join('');

    // Add click listeners
    document.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const roomId = item.dataset.roomId;
        if (roomId !== currentRoomId) {
          stopMessagePolling();
          init(roomId);
        }
      });
    });
  } catch (error) {
    console.error('Failed to load sidebar rooms:', error);
  }
}

function getInitials(name) {
  if (!name) return '?';
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

// Cleanup on navigation
window.addEventListener('beforeunload', () => {
  stopMessagePolling();
});
