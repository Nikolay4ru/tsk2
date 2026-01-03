class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    this.subscriptions = new Set();
    this.connectionId = null;
  }

  async connect() {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('No access token available');
      return Promise.reject(new Error('No access token'));
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    console.log('Connecting to WebSocket:', wsUrl.replace(token, '***'));

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.startPing();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.stopPing();
        this.reconnect();
      };
    });
  }

  handleMessage(data) {
    console.log('WebSocket message:', data.type, data);

    switch (data.type) {
      case 'connected':
        this.connectionId = data.data.connectionId;
        console.log('Connection ID:', this.connectionId);
        
        // Re-subscribe to all channels
        this.subscriptions.forEach(channel => {
          this.subscribe(channel);
        });
        break;

      case 'subscribed':
        console.log('Subscribed to:', data.data.channel);
        break;
        
      case 'unsubscribed':
        console.log('Unsubscribed from:', data.data.channel);
        break;

      case 'event':
        // Dispatch custom event for components
        const event = new CustomEvent('ws:event', { 
          detail: {
            channel: data.channel,
            data: data.data,
          }
        });
        window.dispatchEvent(event);
        break;

      case 'webrtc-signal':
        // ✅ ДОБАВЛЕНА ОБРАБОТКА WebRTC СИГНАЛОВ
        console.log('📞 WebRTC signal received, dispatching event');
        const webrtcEvent = new CustomEvent('ws:event', {
          detail: {
            channel: 'webrtc',
            data: {
              type: 'webrtc-signal',
              data: data, // Весь объект: callId, fromUserId, signal
            },
          },
        });
        window.dispatchEvent(webrtcEvent);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'error':
        console.error('WebSocket error:', data.data);
        break;

      default:
        console.warn('Unknown message type:', data.type);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected');
    }
  }

  subscribe(channel) {
    console.log('Subscribing to:', channel);
    this.subscriptions.add(channel);
    
    this.send({
      type: 'subscribe',
      payload: { channel },
    });
  }

  unsubscribe(channel) {
    console.log('Unsubscribing from:', channel);
    this.subscriptions.delete(channel);
    
    this.send({
      type: 'unsubscribe',
      payload: { channel },
    });
  }

  sendTyping(roomId, isTyping) {
    this.send({
      type: 'typing',
      payload: {
        roomId,
        isTyping,
      },
    });
  }

  disconnect() {
    if (this.ws) {
      this.stopPing();
      this.ws.close();
      this.ws = null;
    }
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

export { WebSocketManager };
export default WebSocketManager;
