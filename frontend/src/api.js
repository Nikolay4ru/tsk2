const API_BASE = '/api';

class API {
  constructor() {
    this.baseURL = '/api';
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


async uploadFile(endpoint, formData) {
    const url = `${this.baseURL}${endpoint}`;
    
    console.log('📤 Upload Request:', { url });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
        body: formData,
      });

      console.log('📥 Upload Response:', {
        url,
        status: response.status,
      });

      if (response.status === 401) {
        this.setToken(null);
        window.location.href = '/';
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Upload Error:', error);
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


  async register(email, password, username) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
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

async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.uploadFile('/auth/upload-avatar', formData);
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


  async createPrivateRoom(recipientId) {
    return this.request('/chat/rooms/private', {
      method: 'POST',
      body: JSON.stringify({ recipientId }),
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
  // Files
  async uploadChatFile(roomId, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', roomId);
    return this.uploadFile('/chat/files/upload', formData);
  }

  async getRoomFiles(roomId) {
    return this.request(`/chat/rooms/${roomId}/files`);
  }


  // Calls
  async startCall(roomId, type = 'video') {
    return this.request('/chat/calls/start', {
      method: 'POST',
      body: JSON.stringify({ roomId, type }),
    });
  }

  async answerCall(callId) {
    return this.request(`/chat/calls/${callId}/answer`, {
      method: 'POST',
    });
  }

  async rejectCall(callId) {
    return this.request(`/chat/calls/${callId}/reject`, {
      method: 'POST',
    });
  }

  async endCall(callId) {
    return this.request(`/chat/calls/${callId}/end`, {
      method: 'POST',
    });
  }

  async getActiveCall(roomId) {
    return this.request(`/chat/rooms/${roomId}/call`);
  }

  // MediaSoup (Media Service)
  async getRouterCapabilities(callId) {
    return this.request(`/media/router-capabilities/${callId}`);
  }

  async createTransport(callId, options) {
    return this.request(`/media/create-transport/${callId}`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async connectTransport(transportId, dtlsParameters) {
    return this.request('/media/connect-transport', {
      method: 'POST',
      body: JSON.stringify({ transportId, dtlsParameters }),
    });
  }

  async produce(transportId, kind, rtpParameters) {
    return this.request('/media/produce', {
      method: 'POST',
      body: JSON.stringify({ transportId, kind, rtpParameters }),
    });
  }

  async consume(transportId, producerId, rtpCapabilities) {
    return this.request('/media/consume', {
      method: 'POST',
      body: JSON.stringify({ transportId, producerId, rtpCapabilities }),
    });
  }

  async resumeConsumer(consumerId) {
    return this.request('/media/resume-consumer', {
      method: 'POST',
      body: JSON.stringify({ consumerId }),
    });
  }

  async cleanupCall(callId) {
    return this.request(`/media/call/${callId}`, {
      method: 'DELETE',
    });
  }
}

export default new API();
