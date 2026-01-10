// frontend/src/api.js
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

  async getUserInfo(userId) {
    try {
      return await this.request(`/auth/users/${userId}`);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      return {
        userId,
        username: `User ${userId.substring(0, 8)}`,
        name: null,
        email: null,
        avatar: null,
        profilePicture: null
      };
    }
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

  // ========================================================================
  // LIVEKIT API - Primary call management
  // ========================================================================

  /**
   * Get LiveKit access token
   * @param {string} roomName - LiveKit room name
   * @param {string} participantName - Participant display name
   * @param {string} participantId - Participant ID
   * @returns {Promise<Object>} Token, URL, room info
   */
  async getLiveKitToken(roomName, participantName, participantId) {
    return this.request('/livekit/token', {
      method: 'POST',
      body: JSON.stringify({
        roomName,
        participantName,
        participantId: participantId || this.getCurrentUserId(),
      }),
    });
  }

  /**
   * List active LiveKit rooms
   * @returns {Promise<Object>}
   */
  async listLiveKitRooms() {
    return this.request('/livekit/rooms');
  }

  /**
   * Get LiveKit room details
   * @param {string} roomName - Room name
   * @returns {Promise<Object>}
   */
  async getLiveKitRoom(roomName) {
    return this.request(`/livekit/room/${roomName}`);
  }

  /**
   * End LiveKit room (disconnect all participants)
   * @param {string} roomName - Room name
   * @returns {Promise<Object>}
   */
  async endLiveKitRoom(roomName) {
    return this.request(`/livekit/room/${roomName}/end`, {
      method: 'POST',
    });
  }

  // ========================================================================
  // CALL MANAGEMENT - Stub methods for IncomingCallModal
  // ========================================================================
  // These are client-side only for LiveKit
  // Call state is managed via WebSocket notifications

  /**
   * Answer an incoming call (client-side only for LiveKit)
   * @param {string} callId - Call ID
   * @returns {Promise<Object>}
   */
  async answerCall(callId) {
    console.log('📞 Answer call (client-side):', callId);
    // For LiveKit, we just return success
    // Actual connection happens via getLiveKitToken()
    return { success: true, callId };
  }

  /**
   * Reject an incoming call (client-side only for LiveKit)
   * @param {string} callId - Call ID
   * @returns {Promise<Object>}
   */
  async rejectCall(callId) {
    console.log('📞 Reject call (client-side):', callId);
    // For LiveKit, we just return success
    // Notification sent via WebSocket
    return { success: true, callId };
  }

  /**
   * End an active call (client-side only for LiveKit)
   * @param {string} callId - Call ID
   * @returns {Promise<Object>}
   */
  async endCall(callId) {
    console.log('📞 End call (client-side):', callId);
    // For LiveKit, we just return success
    // Disconnect happens via LiveKitCallClient.endCall()
    return { success: true, callId };
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Get current user ID from localStorage or JWT
   * @returns {string} User ID or 'anonymous'
   */
  getCurrentUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      if (user.id || user.userId) {
        return user.id || user.userId;
      }

      const token = localStorage.getItem('accessToken');
      if (!token) return 'anonymous';

      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId || payload.user_id || payload.sub || payload.id || 'anonymous';
    } catch (error) {
      console.warn('Failed to get userId:', error);
      return 'anonymous';
    }
  }
}

export default new API();