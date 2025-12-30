const API_BASE = '/api';

class API {
  constructor() {
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

  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    const config = {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    };

    try {
      console.log('📤 API Request:', url, config);
      
      const response = await fetch(url, config);

      console.log('📥 API Response:', { url, status: response.status, ok: response.ok });

      if (response.status === 401) {
        console.warn('⚠️ Unauthorized - clearing token');
        this.setToken(null);
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('🔴 API Error:', error);
      throw error;
    }
  }

  // Auth
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    this.setToken(data.accessToken);
    return data;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Rooms
  async getRooms() {
    return this.request('/chat/rooms');
  }

  async getRoom(roomId) {
    return this.request(`/chat/rooms/${roomId}`);
  }

  async createRoom(data) {
    return this.request('/chat/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addRoomMember(roomId, userId) {
    return this.request(`/chat/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  // Messages
  async getMessages(roomId, options = {}) {
    const params = new URLSearchParams();
    if (options.before) params.append('before', options.before);
    if (options.after) params.append('after', options.after);
    if (options.limit) params.append('limit', options.limit);
    
    const query = params.toString();
    return this.request(`/chat/rooms/${roomId}/messages${query ? '?' + query : ''}`);
  }

  async sendMessage(data) {
    return this.request('/chat/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async markAsRead(roomId, messageIds) {
    return this.request(`/chat/rooms/${roomId}/messages/read`, {
      method: 'POST',
      body: JSON.stringify({ messageIds }),
    });
  }

  // Users
  async searchUsers(query) {
    return this.request(`/auth/users/search?q=${encodeURIComponent(query)}`);
  }

  // Tasks
  async getTasks(filters = {}) {
    const params = new URLSearchParams(filters);
    const query = params.toString();
    return this.request(`/task/tasks${query ? '?' + query : ''}`);
  }

  async getTask(taskId) {
    return this.request(`/task/tasks/${taskId}`);
  }

  async createTask(data) {
    return this.request('/task/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(taskId, data) {
    return this.request(`/task/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTask(taskId) {
    return this.request(`/task/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }
}

export default new API();
