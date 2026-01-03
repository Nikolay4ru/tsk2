import API from '../../api.js';
import { escapeHtml } from '../../shared/utils/helpers.js';

let currentRoomId = null;

export function show(roomId) {
  currentRoomId = roomId;
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'add-member-modal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Add Member</h2>
        <button class="btn-icon" id="close-modal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <div class="modal-body">
        <div class="form-group">
          <label>Search users</label>
          <input 
            type="text" 
            id="user-search" 
            class="input" 
            placeholder="Type username or email..."
            autocomplete="off"
          />
        </div>
        
        <div id="user-results" class="user-results">
          <div class="empty-state">
            <p>Start typing to search users</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Setup listeners
  setupListeners();
  
  // Focus search
  document.getElementById('user-search').focus();
}

function setupListeners() {
  const modal = document.getElementById('add-member-modal');
  const closeBtn = document.getElementById('close-modal');
  const searchInput = document.getElementById('user-search');
  
  // Close modal
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  
  // Search users
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    
    const query = e.target.value.trim();
    
    if (query.length < 2) {
      document.getElementById('user-results').innerHTML = `
        <div class="empty-state">
          <p>Start typing to search users</p>
        </div>
      `;
      return;
    }
    
    searchTimeout = setTimeout(() => searchUsers(query), 300);
  });
}

async function searchUsers(query) {
  const resultsContainer = document.getElementById('user-results');
  
  resultsContainer.innerHTML = '<div class="loading">Поис...</div>';
  
  try {
    const users = await API.searchUsers(query);
    
    if (users.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <p>Пользователи не найдены</p>
        </div>
      `;
      return;
    }
    
    resultsContainer.innerHTML = users.map(user => `
      <div class="user-result-item" data-user-id="${user.id}">
        <div class="avatar">${getInitials(user.username)}</div>
        <div class="user-info">
          <div class="username">${escapeHtml(user.username)}</div>
          <div class="email">${escapeHtml(user.email)}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.addMemberToRoom('${user.id}')">
          Add
        </button>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Failed to search users:', error);
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <p class="text-danger">Failed to search users</p>
      </div>
    `;
  }
}

window.addMemberToRoom = async function(userId) {
  try {
    await API.addRoomMember(currentRoomId, userId);
    
    alert('Пользователь добавлен!');
    close();
    
    // Reload room info
    window.location.reload();
    
  } catch (error) {
    console.error('Failed to add member:', error);
    alert('Failed to add member. Please try again.');
  }
};

function close() {
  const modal = document.getElementById('add-member-modal');
  if (modal) {
    modal.remove();
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
