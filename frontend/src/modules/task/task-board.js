// frontend/src/modules/task/task-board.js
// ============================================

import API from '../../api.js';
import Router from '../../router.js';
import { getInitials, escapeHtml } from '../../shared/utils/helpers.js';

let board = null;
let draggedTask = null;

export async function init() {
  console.log('Initializing task board...');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="task-board-container">
      <header class="task-board-header">
        <button class="back-btn">←</button>
        <h1>Task Board</h1>
        <button class="btn-icon" id="new-task-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </header>
      
      <div class="task-board" id="task-board">
        <div class="loading">Loading board...</div>
      </div>
    </div>
  `;

  // Load board
  await loadBoard();

  // Setup event listeners
  document.querySelector('.back-btn').addEventListener('click', () => {
    Router.navigate('/tasks');
  });

  document.getElementById('new-task-btn').addEventListener('click', () => {
    Router.navigate('/tasks');
    // Trigger new task modal from task-list
  });
}

async function loadBoard() {
  try {
    board = await API.getBoard('default');
    renderBoard();
  } catch (error) {
    console.error('Failed to load board:', error);
  }
}

function renderBoard() {
  const container = document.getElementById('task-board');

  const columns = [
    { key: 'todo', title: 'To Do', color: '#8e44ad' },
    { key: 'in_progress', title: 'In Progress', color: '#3498db' },
    { key: 'review', title: 'Review', color: '#f39c12' },
    { key: 'done', title: 'Done', color: '#27ae60' },
  ];

  container.innerHTML = columns.map(column => {
    const tasks = board[column.key] || [];
    
    return `
      <div class="task-column" data-status="${column.key}">
        <div class="task-column-header" style="border-bottom: 3px solid ${column.color};">
          <h2>${column.title}</h2>
          <span class="task-count">${tasks.length}</span>
        </div>
        
        <div class="task-column-content" data-status="${column.key}">
          ${tasks.length === 0 ? `
            <div class="task-column-empty">
              Drop tasks here
            </div>
          ` : tasks.map(task => renderTaskCard(task)).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Setup drag and drop
  setupDragAndDrop();
}

function renderTaskCard(task) {
  const priorityColors = {
    urgent: '#ff4444',
    high: '#ff8800',
    medium: '#ffbb00',
    low: '#00aa00',
  };

  return `
    <div class="task-card" draggable="true" data-task-id="${task.id}">
      <div class="task-card-header">
        <span class="task-priority-badge" style="background: ${priorityColors[task.priority]};"></span>
        <h3 class="task-card-title">${escapeHtml(task.title)}</h3>
      </div>
      
      ${task.description ? `
        <p class="task-card-desc">${escapeHtml(task.description.substring(0, 80))}${task.description.length > 80 ? '...' : ''}</p>
      ` : ''}
      
      <div class="task-card-footer">
        ${task.assignee ? `
          <div class="avatar avatar-xs">${getInitials(task.assignee.username)}</div>
        ` : '<div class="avatar avatar-xs">?</div>'}
        
        ${task.comment_count > 0 ? `
          <span class="text-xs">💬 ${task.comment_count}</span>
        ` : ''}
      </div>
    </div>
  `;
}

function setupDragAndDrop() {
  const cards = document.querySelectorAll('.task-card');
  const columns = document.querySelectorAll('.task-column-content');

  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', handleTaskClick);
  });

  columns.forEach(column => {
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('drop', handleDrop);
    column.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedTask = e.target;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.task-column-content').forEach(col => {
    col.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (!draggedTask) return;

  const newStatus = e.currentTarget.dataset.status;
  const taskId = draggedTask.dataset.taskId;
  
  // Get position (index in new column)
  const cardsInColumn = Array.from(e.currentTarget.querySelectorAll('.task-card'));
  const newPosition = cardsInColumn.length;

  try {
    // Update task position
    await API.updateTaskPosition(taskId, newPosition, newStatus);
    
    // Move card to new column
    e.currentTarget.appendChild(draggedTask);
    
    // Update board data
    await loadBoard();
    
  } catch (error) {
    console.error('Failed to move task:', error);
    alert('Failed to move task');
  }
}

function handleTaskClick(e) {
  const taskId = e.currentTarget.dataset.taskId;
  Router.navigate(`/tasks/${taskId}`);
}