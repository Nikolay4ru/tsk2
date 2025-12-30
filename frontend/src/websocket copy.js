class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    this.subscriptions = new Set();
  }

  async connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.startPing();
        
        // Re-subscribe to all channels
        this.subscriptions.forEach(channel => {
          this.send({ type: 'subscribe', channel });
        });
        
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
    const event = new CustomEvent('ws:event', { detail: data });
    window.dispatchEvent(event);
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
    this.send({ type: 'subscribe', channel });
  }

  unsubscribe(channel) {
    console.log('Unsubscribing from:', channel);
    this.subscriptions.delete(channel);
    this.send({ type: 'unsubscribe', channel });
  }

  sendTyping(roomId, isTyping) {
    this.send({
      type: 'typing',
      roomId,
      isTyping,
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
        this.ws.send(JSON.stringify({ type: 'ping' }));
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
