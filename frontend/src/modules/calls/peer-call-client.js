import SimplePeer from 'simple-peer';

class PeerCallClient {
  constructor() {
    this.peer = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callId = null;
    this.targetUserId = null;
    this.isInitiator = false;
    this.onRemoteStream = null;
    this.onCallEnded = null;
    this.pendingSignals = []; // ✅ БУФЕР для сигналов
  }

  async startCall(callId, targetUserId, isInitiator, isVideo = true, roomId = null) {
    this.callId = callId;
    this.targetUserId = targetUserId;
    this.isInitiator = isInitiator;

    console.log('🎥 Starting peer call:', { callId, targetUserId, isInitiator, isVideo, roomId });

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: isVideo ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } : false,
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

      // ✅ Применить все буферизованные сигналы
      if (this.pendingSignals.length > 0) {
        console.log(`📦 Applying ${this.pendingSignals.length} buffered signals`);
        this.pendingSignals.forEach(signal => {
          try {
            this.peer.signal(signal);
          } catch (error) {
            console.error('❌ Failed to apply buffered signal:', error);
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
    this.peer.on('signal', (signal) => {
      console.log('📤 Sending signal to user:', this.targetUserId);
      
      if (window.app && window.app.ws && window.app.ws.ws) {
        window.app.ws.ws.send(JSON.stringify({
          type: 'webrtc-signal',
          callId: this.callId,
          targetUserId: this.targetUserId,
          signal,
          signalType: this.isInitiator ? 'offer' : 'answer',
        }));
      } else {
        console.error('❌ WebSocket not available');
      }
    });

    this.peer.on('stream', (stream) => {
      console.log('📥 Remote stream received');
      this.remoteStream = stream;
      
      if (this.onRemoteStream) {
        this.onRemoteStream(stream);
      }
    });

    this.peer.on('connect', () => {
      console.log('✅ Peer connected');
    });

    this.peer.on('error', (err) => {
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
    console.log('📥 Received signal');
    
    if (this.peer) {
      try {
        this.peer.signal(signal);
        console.log('✅ Signal applied to peer');
      } catch (error) {
        console.error('❌ Failed to apply signal:', error);
      }
    } else {
      // ✅ Буферизуем сигнал если peer ещё не создан
      console.log('📦 Buffering signal (peer not ready yet)');
      this.pendingSignals.push(signal);
    }
  }

  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  endCall() {
    console.log('📞 Ending call');
    this.cleanup();
  }

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.remoteStream = null;
    this.callId = null;
    this.targetUserId = null;
    this.pendingSignals = [];
  }
}

export default new PeerCallClient();
