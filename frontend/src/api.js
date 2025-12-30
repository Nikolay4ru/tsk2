class API {
  constructor() {
    this.baseURL = window.location.origin + '/api';
    this.token = localStorage.getItem('accessToken');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // КРИТИЧНО: Добавить токен в заголовок
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers,
    };

    console.log('🔵 API Request:', {
      url,
      method: config.method || 'GET',
      hasToken: !!this.token,
      tokenLength: this.token ? this.token.length : 0,
      authHeader: headers['Authorization'] ? 'Bearer ***' : 'MISSING'
    });

    try {
      const response = await fetch(url, config);
      
      console.log('🟢 API Response:', {
        url,
        status: response.status,
        ok: response.ok
      });

      if (response.status === 401) {
        console.warn('⚠️ Unauthorized - clearing token');
        this.setToken(null);
        window.location.href = '/';
        throw new Error('Unauthorized');
      }

      const data = await response.json();

      if (!response.ok) {
        console.error('🔴 API Error:', data);
        throw data;
      }

      return data;
    } catch (error) {
      console.error('🔴 API Error:', error);
      throw error;
    }
  }

  // Auth
  register(email, username, password) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
  }

  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  // Chat
  getRooms() {
    return this.request('/chat/rooms');
  }

  getRoom(roomId) {
    return this.request(`/chat/rooms/${roomId}`);
  }

  createRoom(data) {
    return this.request('/chat/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  createPrivateRoom(recipientId) {
    return this.request('/chat/rooms/private', {
      method: 'POST',
      body: JSON.stringify({ recipientId }),
    });
  }

  getMessages(roomId, options = {}) {
    const params = new URLSearchParams(options);
    return this.request(`/chat/rooms/${roomId}/messages?${params}`);
  }

  sendMessage(data) {
    return this.request('/chat/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  markAsRead(roomId, messageIds) {
    return this.request(`/chat/rooms/${roomId}/read`, {
      method: 'POST',
      body: JSON.stringify({ messageIds }),
    });
  }

  deleteMessage(messageId) {
    return this.request(`/chat/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  updateMessage(messageId, content) {
    return this.request(`/chat/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  // Task API
  getTasks(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/task/tasks?${params}`);
  }

  getTask(taskId) {
    return this.request(`/task/tasks/${taskId}`);
  }

  getBoard(boardId = 'default') {
    return this.request(`/task/boards/${boardId}`);
  }

  createTask(data) {
    return this.request('/task/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateTask(taskId, data) {
    return this.request(`/task/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  updateTaskPosition(taskId, position, status) {
    return this.request(`/task/tasks/${taskId}/position`, {
      method: 'PATCH',
      body: JSON.stringify({ position, status }),
    });
  }

  deleteTask(taskId) {
    return this.request(`/task/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }

  addWatcher(taskId, userId) {
    return this.request(`/task/tasks/${taskId}/watchers`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  removeWatcher(taskId, userId) {
    return this.request(`/task/tasks/${taskId}/watchers/${userId}`, {
      method: 'DELETE',
    });
  }

  // Task Comments
  getTaskComments(taskId, options = {}) {
    const params = new URLSearchParams(options);
    return this.request(`/chat/tasks/${taskId}/comments?${params}`);
  }

  addTaskComment(taskId, content) {
    return this.request(`/chat/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }
}

export default new API();
