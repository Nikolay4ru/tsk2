import API from '../../api.js';
import Router from '../../router.js';
import WebSocket from '../../websocket.js';
import { formatTime, getInitials, escapeHtml } from '../../shared/utils/helpers.js';

let currentTaskId = null;
let task = null;
let comments = [];

export async function init(taskId) {
  currentTaskId = taskId;
  console.log('Opening task:', taskId);

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = `
    <div class="task-detail">
      <header class="task-detail-header">
        <button class="back-btn">←</button>
        <div style="flex: 1;"></div>
        <button class="btn-icon" id="edit-task-btn" title="Edit task">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon" id="delete-task-btn" title="Delete task">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </header>

      <div class="task-detail-content" id="task-content">
        <div class="loading">Loading task...</div>
      </div>

      <div class="task-comments-section">
        <h3 style="margin: 0 0 16px 0; font-size: 18px;">Comments</h3>
        <div class="task-comments" id="task-comments">
          <div class="loading">Loading comments...</div>
        </div>
        
        <div class="comment-input-container">
          <textarea 
            id="comment-input" 
            class="message-input"
            placeholder="Add a comment..."
            rows="2"
          ></textarea>
          <button id="send-comment-btn" class="send-btn" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  await Promise.all([
    loadTask(),
    loadComments(),
  ]);

  setupEventListeners();
  window.addEventListener('ws:event', handleWebSocketEvent);
}

async function loadTask() {
  try {
    task = await API.getTask(currentTaskId);
    renderTask();
  } catch (error) {
    console.error('Failed to load task:', error);
    document.getElementById('task-content').innerHTML = `
      <div class="empty-state">
        <p class="text-danger">Failed to load task</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderTask() {
  const container = document.getElementById('task-content');

  const priorityColors = {
    urgent: '#ff4444',
    high: '#ff8800',
    medium: '#ffbb00',
    low: '#00aa00',
  };

  const statusLabels = {
    todo: 'To Do',
    in_progress: 'In Progress',
    review: 'Review',
    done: 'Done',
  };

  container.innerHTML = `
    <div class="task-detail-main">
      <div class="task-detail-badges">
        <span class="task-status-badge" style="background: ${priorityColors[task.priority]};">
          ${task.priority}
        </span>
        <span class="task-status-badge" style="background: var(--color-background-secondary); color: var(--color-text);">
          ${statusLabels[task.status]}
        </span>
      </div>

      <h1 class="task-detail-title">${escapeHtml(task.title)}</h1>

      ${task.description ? `
        <div class="task-detail-description">
          <p>${escapeHtml(task.description)}</p>
        </div>
      ` : ''}

      <div class="task-detail-meta">
        <div class="task-meta-item">
          <span class="task-meta-label">Created by</span>
          <div class="flex items-center gap-xs">
            <div class="avatar avatar-sm">${getInitials(task.creator.username)}</div>
            <span>${escapeHtml(task.creator.username)}</span>
          </div>
        </div>

        ${task.assignee ? `
          <div class="task-meta-item">
            <span class="task-meta-label">Assigned to</span>
            <div class="flex items-center gap-xs">
              <div class="avatar avatar-sm">${getInitials(task.assignee.username)}</div>
              <span>${escapeHtml(task.assignee.username)}</span>
            </div>
          </div>
        ` : `
          <div class="task-meta-item">
            <span class="task-meta-label">Assigned to</span>
            <button class="btn btn-secondary btn-sm" id="assign-btn">Assign to me</button>
          </div>
        `}

        ${task.due_date ? `
          <div class="task-meta-item">
            <span class="task-meta-label">Due date</span>
            <span>${formatTime(task.due_date)}</span>
          </div>
        ` : ''}

        <div class="task-meta-item">
          <span class="task-meta-label">Created</span>
          <span>${formatTime(task.created_at)}</span>
        </div>
      </div>

      <div class="task-watchers">
        <h3>Watchers</h3>
        <div class="watchers-list" id="watchers-list">
          ${task.watchers && task.watchers.length > 0 ? task.watchers.map(w => `
            <div class="watcher-item">
              <div class="avatar avatar-sm">${getInitials(w.username)}</div>
              <span>${escapeHtml(w.username)}</span>
            </div>
          `).join('') : '<p class="text-secondary">No watchers</p>'}
        </div>
        <button class="btn btn-secondary btn-sm" id="watch-btn">
          ${task.watchers?.find(w => w.id === window.app.user.id) ? 'Unwatch' : 'Watch'}
        </button>
      </div>
    </div>
  `;

  const assignBtn = container.querySelector('#assign-btn');
  if (assignBtn) {
    assignBtn.addEventListener('click', assignToMe);
  }

  const watchBtn = container.querySelector('#watch-btn');
  if (watchBtn) {
    watchBtn.addEventListener('click', toggleWatch);
  }
}

async function loadComments() {
  try {
    comments = await API.getTaskComments(currentTaskId);
    renderComments();
  } catch (error) {
    console.error('Failed to load comments:', error);
    document.getElementById('task-comments').innerHTML = `
      <div class="empty-state-small">
        <p class="text-danger">Failed to load comments</p>
      </div>
    `;
  }
}

function renderComments() {
  const container = document.getElementById('task-comments');

  if (comments.length === 0) {
    container.innerHTML = `
      <div class="empty-state-small">
        <p class="text-secondary">No comments yet. Be the first to comment!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = comments.map(comment => `
    <div class="comment-item">
      <div class="avatar avatar-sm">${getInitials(comment.username)}</div>
      <div class="comment-content">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(comment.username)}</span>
          <span class="comment-time">${formatTime(comment.created_at)}</span>
        </div>
        <p class="comment-text">${escapeHtml(comment.content)}</p>
      </div>
    </div>
  `).join('');
}

function setupEventListeners() {
  const input = document.getElementById('comment-input');
  const sendBtn = document.getElementById('send-comment-btn');
  const backBtn = document.querySelector('.back-btn');

  backBtn.addEventListener('click', () => {
    Router.navigate('/tasks');
  });

  document.getElementById('edit-task-btn').addEventListener('click', showEditModal);
  document.getElementById('delete-task-btn').addEventListener('click', deleteTask);

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    sendBtn.disabled = !input.value.trim();
  });

  sendBtn.addEventListener('click', sendComment);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendComment();
    }
  });
}

async function assignToMe() {
  try {
    await API.updateTask(currentTaskId, {
      assigneeId: window.app.user.id,
    });
    await loadTask();
  } catch (error) {
    console.error('Failed to assign task:', error);
    alert('Failed to assign task');
  }
}

async function toggleWatch() {
  try {
    const isWatching = task.watchers?.find(w => w.id === window.app.user.id);
    
    if (isWatching) {
      await API.removeWatcher(currentTaskId, window.app.user.id);
    } else {
      await API.addWatcher(currentTaskId, window.app.user.id);
    }
    
    await loadTask();
  } catch (error) {
    console.error('Failed to toggle watch:', error);
    alert('Failed to update watchers');
  }
}

function showEditModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width: 600px;">
      <div class="modal-header">
        <h2 class="modal-title">Edit Task</h2>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <form id="edit-task-form">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
              Title *
            </label>
            <input type="text" name="title" class="input" value="${escapeHtml(task.title)}" required />
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
              Description
            </label>
            <textarea name="description" class="input" rows="4">${escapeHtml(task.description || '')}</textarea>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
                Status
              </label>
              <select name="status" class="input">
                <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
                <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="review" ${task.status === 'review' ? 'selected' : ''}>Review</option>
                <option value="done" ${task.status === 'done' ? 'selected' : ''}>Done</option>
              </select>
            </div>
            
            <div>
              <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
                Priority
              </label>
              <select name="priority" class="input">
                <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
              </select>
            </div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
              Due Date
            </label>
            <input 
              type="datetime-local" 
              name="dueDate" 
              class="input" 
              value="${task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : ''}"
            />
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="save-btn">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#edit-task-form');

  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-btn').addEventListener('click', () => modal.remove());
  
  modal.querySelector('#save-btn').addEventListener('click', async () => {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const data = {
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status'),
      priority: formData.get('priority'),
      dueDate: formData.get('dueDate') || null,
    };

    try {
      modal.querySelector('#save-btn').textContent = 'Saving...';
      
      await API.updateTask(currentTaskId, data);
      await loadTask();
      
      modal.remove();
      
    } catch (error) {
      console.error('Failed to update task:', error);
      alert('Failed to update task: ' + (error.error || 'Unknown error'));
      modal.querySelector('#save-btn').textContent = 'Save Changes';
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

async function deleteTask() {
  if (!confirm('Are you sure you want to delete this task?')) {
    return;
  }

  try {
    await API.deleteTask(currentTaskId);
    Router.navigate('/tasks');
  } catch (error) {
    console.error('Failed to delete task:', error);
    alert('Failed to delete task');
  }
}

async function sendComment() {
  const input = document.getElementById('comment-input');
  const content = input.value.trim();

  if (!content) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-comment-btn').disabled = true;

  const tempComment = {
    id: 'temp-' + Date.now(),
    user_id: window.app.user.id,
    username: window.app.user.username,
    avatar_url: window.app.user.avatar_url,
    content,
    created_at: new Date().toISOString(),
    pending: true,
  };

  comments.push(tempComment);
  renderComments();

  const commentsContainer = document.getElementById('task-comments');
  commentsContainer.scrollTop = commentsContainer.scrollHeight;

  try {
    const comment = await API.addTaskComment(currentTaskId, content);

    const index = comments.findIndex(c => c.id === tempComment.id);
    if (index !== -1) {
      comments[index] = comment;
      renderComments();
    }

  } catch (error) {
    console.error('Failed to send comment:', error);
    
    comments = comments.filter(c => c.id !== tempComment.id);
    renderComments();
    
    alert('Failed to send comment');
  }
}

function handleWebSocketEvent(event) {
  const { channel, data } = event.detail;

  if (channel === `task:${currentTaskId}`) {
    switch (data.type) {
      case 'task_updated':
        loadTask();
        break;
      
      case 'comment_added':
        if (data.data.user_id !== window.app.user.id) {
          comments.push(data.data);
          renderComments();
        }
        break;
    }
  }
}

export function cleanup() {
  window.removeEventListener('ws:event', handleWebSocketEvent);
}
