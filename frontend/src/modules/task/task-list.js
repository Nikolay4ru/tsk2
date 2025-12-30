// frontend/src/modules/task/task-list.js
// ============================================

import API from '../../api.js';
import Router from '../../router.js';
import WebSocket from '../../websocket.js';
import { formatTime, getInitials, escapeHtml } from '../../shared/utils/helpers.js';

let tasks = [];
let currentFilter = 'all';
let currentSort = 'created';

export async function init() {
  console.log('Initializing task list...');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-container">
      <aside class="sidebar">
        <header class="sidebar-header">
          <h1 class="sidebar-title">Tasks</h1>
          <div class="flex gap-sm">
            <button class="btn-icon" id="new-task-btn" title="New task">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button class="btn-icon" id="view-board-btn" title="Board view">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
          </div>
        </header>
        
        <div class="sidebar-content">
          <div class="task-filters">
            <button class="filter-btn active" data-filter="all">All</button>
            <button class="filter-btn" data-filter="todo">To Do</button>
            <button class="filter-btn" data-filter="in_progress">In Progress</button>
            <button class="filter-btn" data-filter="review">Review</button>
            <button class="filter-btn" data-filter="done">Done</button>
          </div>
          
          <div class="task-sort">
            <select id="sort-select" class="input" style="margin: 8px 16px; width: calc(100% - 32px);">
              <option value="created">Recent</option>
              <option value="priority">Priority</option>
              <option value="dueDate">Due Date</option>
            </select>
          </div>
          
          <div id="task-list" class="task-list">
            <div class="loading">Loading tasks...</div>
          </div>
        </div>
      </aside>
      
      <main class="main-content" id="main-content">
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h2>Select a task to view details</h2>
          <p>Or create a new task to get started</p>
        </div>
      </main>
    </div>
  `;

  // Load tasks
  await loadTasks();

  // Setup event listeners
  setupEventListeners();

  // Listen for WebSocket events
  window.addEventListener('ws:event', handleWebSocketEvent);
}

async function loadTasks() {
  try {
    const filters = {};
    
    if (currentFilter !== 'all') {
      filters.status = currentFilter;
    }
    
    filters.sortBy = currentSort;
    
    tasks = await API.getTasks(filters);
    renderTasks();
  } catch (error) {
    console.error('Failed to load tasks:', error);
    document.getElementById('task-list').innerHTML = `
      <div class="empty-state">
        <p class="text-danger">Failed to load tasks</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderTasks() {
  const container = document.getElementById('task-list');

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <h3>No tasks</h3>
        <p>Create your first task!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tasks.map(task => {
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

    return `
      <div class="task-item" data-task-id="${task.id}">
        <div class="task-item-header">
          <h3 class="task-item-title">${escapeHtml(task.title)}</h3>
          <span class="task-priority" style="background: ${priorityColors[task.priority]};">
            ${task.priority}
          </span>
        </div>
        
        ${task.description ? `<p class="task-item-desc">${escapeHtml(task.description.substring(0, 100))}${task.description.length > 100 ? '...' : ''}</p>` : ''}
        
        <div class="task-item-footer">
          <span class="task-status">${statusLabels[task.status]}</span>
          
          ${task.assignee ? `
            <div class="flex items-center gap-xs">
              <div class="avatar avatar-xs">${getInitials(task.assignee.username)}</div>
              <span class="text-sm">${escapeHtml(task.assignee.username)}</span>
            </div>
          ` : '<span class="text-sm text-secondary">Unassigned</span>'}
          
          ${task.due_date ? `
            <span class="text-xs text-secondary">
              Due: ${formatTime(task.due_date)}
            </span>
          ` : ''}
          
          ${task.comment_count > 0 ? `
            <span class="text-xs" style="display: flex; align-items: center; gap: 4px;">
              💬 ${task.comment_count}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add click listeners
  document.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('click', () => {
      const taskId = item.dataset.taskId;
      Router.navigate(`/tasks/${taskId}`);
    });
  });
}

function setupEventListeners() {
  // New task button
  document.getElementById('new-task-btn').addEventListener('click', showNewTaskModal);

  // Board view button
  document.getElementById('view-board-btn').addEventListener('click', () => {
    Router.navigate('/tasks/board');
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentFilter = btn.dataset.filter;
      loadTasks();
    });
  });

  // Sort select
  document.getElementById('sort-select').addEventListener('change', (e) => {
    currentSort = e.target.value;
    loadTasks();
  });
}

function showNewTaskModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width: 600px;">
      <div class="modal-header">
        <h2 class="modal-title">New Task</h2>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <form id="new-task-form">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
              Title *
            </label>
            <input type="text" name="title" class="input" placeholder="Task title" required />
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
              Description
            </label>
            <textarea name="description" class="input" rows="4" placeholder="Task description"></textarea>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
                Status
              </label>
              <select name="status" class="input">
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>
            
            <div>
              <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
                Priority
              </label>
              <select name="priority" class="input">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-secondary);">
              Due Date
            </label>
            <input type="datetime-local" name="dueDate" class="input" />
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="create-btn">Create Task</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#new-task-form');

  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-btn').addEventListener('click', () => modal.remove());
  
  modal.querySelector('#create-btn').addEventListener('click', async () => {
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
      modal.querySelector('#create-btn').textContent = 'Creating...';
      
      const task = await API.createTask(data);
      
      tasks.unshift(task);
      renderTasks();
      
      modal.remove();
      
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('Failed to create task: ' + (error.error || 'Unknown error'));
      modal.querySelector('#create-btn').textContent = 'Create Task';
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

function handleWebSocketEvent(event) {
  const { channel, data } = event.detail;

  if (channel === 'task:created' && data.data.creatorId !== window.app.user.id) {
    // New task created by another user
    tasks.unshift(data.data.task);
    renderTasks();
  } else if (channel === 'task:updated') {
    // Task updated
    const index = tasks.findIndex(t => t.id === data.data.task.id);
    if (index !== -1) {
      tasks[index] = data.data.task;
      renderTasks();
    }
  } else if (channel === 'task:deleted') {
    // Task deleted
    tasks = tasks.filter(t => t.id !== data.data.taskId);
    renderTasks();
  }
}

export function cleanup() {
  window.removeEventListener('ws:event', handleWebSocketEvent);
}