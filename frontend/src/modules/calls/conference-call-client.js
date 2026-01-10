// frontend/src/services/conference-call-client.js
import * as mediasoupClient from 'mediasoup-client';

class ConferenceCallClient {
  constructor() {
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.localStream = null;
    this.remotePeers = new Map(); // { userId: { stream: MediaStream, consumers: [] } }
    this.callId = null;
    this.roomId = null;
    this.onRemoteStream = null;
    this.onRemoteStreamRemoved = null;
    this.onCallEnded = null;
    this.onProducerStateChange = null; // 🔹 callback for UI
    this.consumers = new Map(); // consumerId -> consumer
    this.wsManager = null;
    this.producerCheckInterval = null;
    this.wsEventHandler = null;
  }

  async fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const text = await response.text();
      console.error('❌ Fetch failed:', response.status, text);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async startCall(callId, roomId, isVideo = true) {
    this.callId = callId;
    this.roomId = roomId;

    console.log('🎥 Starting conference call:', { callId, roomId, isVideo });

    try {
      // 1. Get local media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      console.log('✅ Local stream acquired', {
        videoTracks: this.localStream.getVideoTracks().length,
        audioTracks: this.localStream.getAudioTracks().length,
      });

      // 2. Create MediaSoup device
      this.device = new mediasoupClient.Device();
      console.log('📦 MediaSoup client version:', mediasoupClient.version);

      // 3. Load router RTP capabilities
      const rtpCapabilities = await this.getRtpCapabilities();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('✅ MediaSoup device loaded');

      // 4. Create send/recv transports
      await this.createTransports();
      console.log('✅ Transports created');

      // 5. Produce local tracks
      await this.produceLocalTracks();
      console.log('✅ Local tracks produced');

      // 6. Setup WebSocket listeners
      this.setupWebSocketListeners();

      // 7. Get existing producers
      await this.getExistingProducers();

      return this.localStream;
    } catch (error) {
      console.error('❌ Failed to start conference call:', error);
      this.cleanup();
      throw error;
    }
  }

  setupWebSocketListeners() {
    console.log('🔌 Setting up WebSocket listeners for conference');

    if (window.wsManager) {
      this.wsManager = window.wsManager;
      this.wsManager.subscribe(`call:${this.callId}`);
    } else {
      console.warn('⚠️ WebSocket manager not available, using polling fallback');
      this.startProducerPolling();
      return;
    }

    const handleWebSocketEvent = (event) => {
      const { channel, data } = event.detail;
      if (channel === `call:${this.callId}`) this.handleCallEvent(data);
    };

    window.addEventListener('ws:event', handleWebSocketEvent);
    this.wsEventHandler = handleWebSocketEvent;
  }

  handleCallEvent(data) {
    console.log('📢 Call event received:', data);
    switch (data.type) {
      case 'new-producer':
        this.consumeTrack(data.producerId, data.userId, data.kind);
        break;
      case 'producer-closed':
        this.handleProducerClosed(data.producerId);
        break;
      default:
        console.log('Unknown call event type:', data.type);
    }
  }

  startProducerPolling() {
    this.producerCheckInterval = setInterval(() => this.checkForNewProducers(), 2000);
    this.checkForNewProducers();
  }

  async checkForNewProducers() {
    try {
      const { producers } = await this.fetchWithAuth(`/api/media/producers/${this.callId}`);
      const currentUserId = this.getCurrentUserId();

      for (const { producerId, userId, kind } of producers) {
        if (userId === currentUserId) continue;
        const exists = Array.from(this.consumers.values()).some(c => c.producerId === producerId);
        if (!exists) await this.consumeTrack(producerId, userId, kind);
      }
    } catch (error) {
      if (!error.message.includes('404')) console.warn('Producer check failed:', error.message);
    }
  }

  getCurrentUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      if (user.id) return user.id;
    } catch {}
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userId = payload.userId || payload.user_id || payload.sub || payload.id;
      if (userId) {
        localStorage.setItem('currentUser', JSON.stringify({ id: userId }));
        return userId;
      }
    } catch {}
    return null;
  }

  async getExistingProducers() {
    try {
      const { producers } = await this.fetchWithAuth(`/api/media/producers/${this.callId}`);
      for (const { producerId, userId, kind } of producers) {
        const exists = Array.from(this.consumers.values()).some(c => c.producerId === producerId);
        if (!exists) await this.consumeTrack(producerId, userId, kind);
      }
    } catch (error) {
      console.warn('Failed to get existing producers:', error.message);
    }
  }

async consumeTrack(producerId, userId, kind) {
  if (!this.recvTransport || this.recvTransport.connectionState !== 'connected') {
    console.warn('⚠️ Recv transport not ready, queuing consumer:', producerId);
    setTimeout(() => this.consumeTrack(producerId, userId, kind), 500);
    return;
  }

  try {
    const response = await this.fetchWithAuth('/api/media/consume', {
      method: 'POST',
      body: JSON.stringify({
        transportId: this.recvTransport.id,
        producerId,
        rtpCapabilities: this.device.rtpCapabilities,
      }),
    });

    const { id, rtpParameters } = response;
    const consumer = await this.recvTransport.consume({ id, producerId, kind, rtpParameters });

    this.consumers.set(consumer.id, consumer);
    await this.fetchWithAuth('/api/media/resume-consumer', {
      method: 'POST',
      body: JSON.stringify({ consumerId: consumer.id }),
    });
    consumer.resume();

    this.addTrackToPeer(userId, consumer.track, consumer.id);
  } catch (error) {
    console.error(`❌ Failed to consume ${kind}:`, error);
  }
}


  addTrackToPeer(userId, track, consumerId) {
    let peer = this.remotePeers.get(userId);
    if (!peer) {
      peer = { stream: new MediaStream(), consumers: [] };
      this.remotePeers.set(userId, peer);
    }

    // 🔹 Проверка на дубли
    const existingTrack = peer.stream.getTracks().find(t => t.kind === track.kind);
    if (existingTrack) {
      if (existingTrack.id === track.id) return; // тот же трек уже есть
      peer.stream.removeTrack(existingTrack);
      console.log(`♻️ Replaced old ${track.kind} track for ${userId}`);
    }

    peer.stream.addTrack(track);
    peer.consumers.push(consumerId);
    console.log(`✅ Added ${track.kind} track to peer ${userId}`);

    if (this.onRemoteStream) this.onRemoteStream(peer.stream, userId);

    // 🔹 Callback на обновление состояния
    if (this.onProducerStateChange) {
      this.onProducerStateChange(userId, track.kind, track.enabled);
    }

    // Подписка на события трека
    track.addEventListener('ended', () => this.updateProducerState(userId, track.kind, false));
    track.addEventListener('mute', () => this.updateProducerState(userId, track.kind, false));
    track.addEventListener('unmute', () => this.updateProducerState(userId, track.kind, true));
  }

  handleProducerClosed(producerId) {
    for (const [consumerId, consumer] of this.consumers.entries()) {
      if (consumer.producerId === producerId) {
        consumer.close();
        this.consumers.delete(consumerId);

        for (const [userId, peer] of this.remotePeers.entries()) {
          if (peer.consumers.includes(consumerId)) {
            const trackKind = consumer.track.kind;
            peer.stream.getTracks()
              .filter(t => t.kind === trackKind)
              .forEach(t => peer.stream.removeTrack(t));
            peer.consumers = peer.consumers.filter(id => id !== consumerId);

            if (this.onRemoteStreamRemoved) this.onRemoteStreamRemoved(peer.stream, userId);
            if (this.onProducerStateChange) this.onProducerStateChange(userId, trackKind, false);

            console.log(`♻️ Removed ${trackKind} track(s) for peer ${userId}`);
            break;
          }
        }

        console.log(`✅ Consumer ${consumerId} closed`);
        break;
      }
    }
  }

  async handleRecvTransportFailure() {
    if (!this.recvTransport) return;
    console.warn('⚠️ Recv transport failed, recreating...');

    this.recvTransport.close();
    this.recvTransport = null;

    const recvTransportInfo = await this.fetchWithAuth(`/api/media/create-transport/${this.callId}`, {
      method: 'POST',
      body: JSON.stringify({ producing: false, consuming: true }),
    });

    this.recvTransport = this.device.createRecvTransport(recvTransportInfo);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.connectTransport(recvTransportInfo.id, dtlsParameters);
        callback();
        console.log('✅ Recv transport reconnected');
      } catch (error) {
        console.error('❌ Failed to reconnect recvTransport:', error);
        errback(error);
      }
    });

    this.recvTransport.on('connectionstatechange', (state) => {
      console.log('📡 Recv transport state:', state);
      if (state === 'failed') this.handleRecvTransportFailure();
    });

    // Пересоздание всех потребителей безопасно
    const producers = Array.from(this.consumers.values()).map(c => ({
      producerId: c.producerId,
      userId: this.getUserIdFromConsumer(c),
      kind: c.kind,
    }));

    this.consumers.clear();
    for (const p of producers) {
      const peer = this.remotePeers.get(p.userId);
      const hasTrack = peer?.stream.getTracks().some(t => t.kind === p.kind);
      if (!hasTrack) await this.consumeTrack(p.producerId, p.userId, p.kind);
    }
  }

  getUserIdFromConsumer(consumer) {
    for (const [userId, peer] of this.remotePeers.entries()) {
      if (peer.consumers.includes(consumer.id)) return userId;
    }
    return null;
  }

  async createTransports() {
    const sendTransportInfo = await this.fetchWithAuth(`/api/media/create-transport/${this.callId}`, {
      method: 'POST',
      body: JSON.stringify({ producing: true, consuming: false }),
    });

    this.sendTransport = this.device.createSendTransport(sendTransportInfo);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try { await this.connectTransport(sendTransportInfo.id, dtlsParameters); callback(); }
      catch (error) { errback(error); }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const { id } = await this.produce(sendTransportInfo.id, kind, rtpParameters);
        callback({ id });
      } catch (error) { errback(error); }
    });

    const recvTransportInfo = await this.fetchWithAuth(`/api/media/create-transport/${this.callId}`, {
      method: 'POST',
      body: JSON.stringify({ producing: false, consuming: true }),
    });

    this.recvTransport = this.device.createRecvTransport(recvTransportInfo);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try { await this.connectTransport(recvTransportInfo.id, dtlsParameters); callback(); }
      catch (error) { errback(error); }
    });

    this.recvTransport.on('connectionstatechange', (state) => {
      console.log('📡 Recv transport state:', state);
      if (state === 'failed') this.handleRecvTransportFailure();
    });
  }

  async connectTransport(transportId, dtlsParameters) {
    await this.fetchWithAuth('/api/media/connect-transport', { method: 'POST', body: JSON.stringify({ transportId, dtlsParameters }) });
  }

  async produce(transportId, kind, rtpParameters) {
    const userId = this.getCurrentUserId();
    if (!userId) throw new Error('Cannot produce: userId not available');
    return this.fetchWithAuth('/api/media/produce', {
      method: 'POST',
      body: JSON.stringify({ transportId, kind, rtpParameters, userId }),
    });
  }

  async produceLocalTracks() {
    const producers = [];
    if (this.localStream.getVideoTracks().length > 0) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      const producer = await this.sendTransport.produce({ track: videoTrack });
      producers.push(producer);
    }
    if (this.localStream.getAudioTracks().length > 0) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      const producer = await this.sendTransport.produce({ track: audioTrack });
      producers.push(producer);
    }
    console.log(`✅ Produced ${producers.length} local tracks`);
  }

  toggleAudio(enabled) { this.localStream?.getAudioTracks().forEach(t => t.enabled = enabled); }
  toggleVideo(enabled) { this.localStream?.getVideoTracks().forEach(t => t.enabled = enabled); }

  endCall() { this.cleanup(); }

  cleanup() {
    if (this.producerCheckInterval) { clearInterval(this.producerCheckInterval); this.producerCheckInterval = null; }
    if (this.wsEventHandler) { window.removeEventListener('ws:event', this.wsEventHandler); this.wsEventHandler = null; }
    if (this.wsManager && this.callId) this.wsManager.unsubscribe(`call:${this.callId}`);

    for (const consumer of this.consumers.values()) consumer.close();
    this.consumers.clear();

    this.sendTransport?.close();
    this.sendTransport = null;
    this.recvTransport?.close();
    this.recvTransport = null;

    this.localStream?.getTracks().forEach(track => track.stop());
    this.localStream = null;

    this.remotePeers.clear();
    this.callId = null;
    this.roomId = null;
    this.wsManager = null;

    console.log('✅ Cleanup complete');
  }

  async getRtpCapabilities() {
    const data = await this.fetchWithAuth(`/api/media/router-capabilities/${this.callId}`);
    return data.rtpCapabilities;
  }

  updateProducerState(userId, kind, enabled) {
    if (this.onProducerStateChange) this.onProducerStateChange(userId, kind, enabled);
  }
}

export default new ConferenceCallClient();
