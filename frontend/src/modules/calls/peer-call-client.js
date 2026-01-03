import SimplePeer from 'simple-peer';

class PeerCallClient {
  constructor() {
    this.peer = null;
    this.localStream = null;
    this.remoteStream = null;

    this.callId = null;
    this.targetUserId = null;
    this.isInitiator = false;

    this.pendingSignals = []; // 🔥 очередь сигналов

    this.onRemoteStream = null;
    this.onCallEnded = null;
  }

  async startCall(callId, targetUserId, isInitiator, isVideo = true) {
    this.callId = callId;
    this.targetUserId = targetUserId;
    this.isInitiator = isInitiator;

    console.log('🎥 Starting peer call:', {
      callId,
      targetUserId,
      isInitiator,
      isVideo,
    });

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: isVideo
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log('✅ Local stream acquired');

      this.peer = new SimplePeer({
        initiator: isInitiator,
        stream: this.localStream,
        trickle: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      this.setupPeerListeners();

      // 🔥 применяем все сигналы, которые пришли ДО создания peer
      if (this.pendingSignals.length) {
        console.log(`📥 Applying ${this.pendingSignals.length} queued signals`);
        this.pendingSignals.forEach(signal => {
          try {
            this.peer.signal(signal);
          } catch (e) {
            console.error('❌ Failed to apply queued signal:', e);
          }
        });
        this.pendingSignals = [];
      }

      return this.localStream;
    } catch (error) {
      console.error('❌ Failed to start call:', error);
      throw error;
    }
  }

  setupPeerListeners() {
    if (!this.peer) return;

    this.peer.on('signal', signal => {
      console.log('📤 Sending WebRTC signal');

      if (!window.app?.ws?.ws) {
        console.error('❌ WebSocket not available');
        return;
      }

      const message = {
        type: 'webrtc-signal',
        callId: this.callId,
        targetUserId: this.targetUserId,
        signal,
      };

      window.app.ws.ws.send(JSON.stringify(message));
    });

    this.peer.on('stream', stream => {
      console.log('📥 Remote stream received');
      this.remoteStream = stream;

      if (this.onRemoteStream) {
        this.onRemoteStream(stream);
      }
    });

    this.peer.on('connect', () => {
      console.log('🔗 Peer connected');
    });

    this.peer.on('error', err => {
      console.error('❌ Peer error:', err);
    });

    this.peer.on('close', () => {
      console.log('🔌 Peer connection closed');
      this.cleanup();

      if (this.onCallEnded) {
        this.onCallEnded();
      }
    });
  }

  handleSignal(signal) {
    console.log('📥 Received WebRTC signal');

    if (!this.peer) {
      console.warn('⚠️ Peer not ready, queueing signal');
      this.pendingSignals.push(signal);
      return;
    }

    try {
      this.peer.signal(signal);
    } catch (error) {
      console.error('❌ Failed to apply signal:', error);
    }
  }

  toggleAudio(enabled) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  toggleVideo(enabled) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  endCall() {
    console.log('📞 Ending call');
    this.cleanup();

    if (this.onCallEnded) {
      this.onCallEnded();
    }
  }

  cleanup() {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        console.warn('⚠️ Peer destroy error:', e);
      }
      this.peer = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    this.callId = null;
    this.targetUserId = null;
    this.isInitiator = false;
    this.pendingSignals = [];
  }
}

export default new PeerCallClient();