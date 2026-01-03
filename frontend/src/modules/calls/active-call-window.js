import API from '../../api.js';
import PeerCallClient from './peer-call-client.js';

let currentCall = null;
let isAudioMuted = false;
let isVideoOff = false;
let callTimer = null;
let callStartTime = Date.now();

async function show(call, isInitiator) {
  currentCall = call;

  console.log('🎥 Active call window:', { 
    callId: call.callId, 
    targetUserId: call.targetUserId,
    roomId: call.roomId,
    isInitiator 
  });

  const window = document.createElement('div');
  window.className = 'call-window';
  window.id = 'active-call-window';

  window.innerHTML = `
    <div class="call-window-header">
      <h3>${call.roomName || 'Call'}</h3>
      <span class="call-duration" id="call-duration">00:00</span>
    </div>
    
    <div class="call-video-container">
      <video id="remote-video" autoplay playsinline></video>
      <video id="local-video" autoplay playsinline muted></video>
    </div>
    
    <div class="call-controls">
      <button class="btn-call-control" id="toggle-audio-btn" title="Mute">🎤</button>
      <button class="btn-call-control" id="toggle-video-btn" title="Stop video">📷</button>
      <button class="btn-call-control btn-end-call" id="end-call-btn" title="End call">❌</button>
    </div>
  `;

  document.body.appendChild(window);

  setupEventListeners(window);
  startCallTimer();

  await startCall(isInitiator);
}

async function startCall(isInitiator) {
  try {
    const isVideo = currentCall.callType === 'video';

    // ✅ 1. СНАЧАЛА callbacks
    PeerCallClient.onRemoteStream = (stream) => {
      console.log('📥 Remote stream received');
      const remoteVideo = document.getElementById('remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = stream;
      }
    };

    PeerCallClient.onCallEnded = () => {
      console.log('📞 Peer call ended');
      cleanup();
    };

    // ✅ 2. ПОТОМ старт WebRTC
    const localStream = await PeerCallClient.startCall(
      currentCall.callId,
      currentCall.targetUserId,
      isInitiator,
      isVideo,
      currentCall.roomId
    );

    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    console.log('✅ WebRTC started');
  } catch (error) {
    console.error('❌ Failed to start call:', error);
    alert('Failed to start call: ' + error.message);
    cleanup();
  }
}

function setupEventListeners(window) {
  window.querySelector('#toggle-audio-btn').onclick = () => {
    isAudioMuted = !isAudioMuted;
    PeerCallClient.toggleAudio(!isAudioMuted);
  };

  window.querySelector('#toggle-video-btn').onclick = () => {
    isVideoOff = !isVideoOff;
    PeerCallClient.toggleVideo(!isVideoOff);

    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.style.display = isVideoOff ? 'none' : 'block';
    }
  };

  window.querySelector('#end-call-btn').onclick = async () => {
    try {
      await API.endCall(currentCall.callId);
    } finally {
      cleanup();
    }
  };
}

function startCallTimer() {
  callStartTime = Date.now();
  callTimer = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTime) / 1000);
    const m = Math.floor(s / 60);
    const d = document.getElementById('call-duration');
    if (d) d.textContent = `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}

function cleanup() {
  if (callTimer) clearInterval(callTimer);

  PeerCallClient.endCall();

  document.getElementById('active-call-window')?.remove();

  currentCall = null;
  isAudioMuted = false;
  isVideoOff = false;
}

function hide() {
  cleanup();
}

export default { show, hide };
