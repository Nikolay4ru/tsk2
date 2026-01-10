// frontend/src/modules/calls/active-call-window.js
// ✅ FIXED: Don't stop processing when disabling background
// ✅ FIXED: Just switch to 'none' mode

import API from '../../api.js';
import LiveKitCallClient from './livekit-call-client.js';
import VirtualBackgroundProcessor from './virtual-background-processor.js';
import { 
  createBackgroundSelector, 
  showBackgroundSelector,
  removeBackgroundSelector 
} from './virtual-background-ui.js';
import 'ionicons';

// State management
let currentCall = null;
let isAudioMuted = false;
let isVideoOff = false;
let callTimer = null;
let callStartTime = Date.now();
let remoteParticipants = new Map();
let localParticipantId = null;
let virtualBgProcessor = null;
let originalStream = null;
let processedStream = null; // ✅ Store processed stream

async function show(call, isInitiator) {
  currentCall = call;

  console.log('🎥 LiveKit call window:', { 
    callId: call.callId, 
    roomId: call.roomId,
    roomName: call.roomName,
    callType: call.callType,
    isInitiator 
  });

  const window = createCallWindowUI(call);
  document.body.appendChild(window);

  await startCall(isInitiator);
  setupEventListeners(window);
  startCallTimer();
}

function createCallWindowUI(call) {
  const window = document.createElement('div');
  window.className = 'call-window';
  window.id = 'active-call-window';

  window.innerHTML = `
    <div class="call-window-header">
      <h3>${call.roomName || 'Video Call'}</h3>
      <span class="call-duration" id="call-duration">00:00</span>
    </div>
    
    <div class="call-video-container conference">
      <div id="remote-videos-grid" class="remote-videos-grid grid-empty">
        <div class="empty-grid-message">
          Ожидание остальных участников...
        </div>
      </div>
      
      <div class="local-video-wrapper">
        <video id="local-video" class="local-video-pip" autoplay playsinline muted></video>
        <div class="local-video-overlay">
          <span class="participant-name">You</span>
          <div class="participant-indicators">
            <ion-icon name="mic" id="local-mic-indicator" class="indicator-mic"></ion-icon>
            <ion-icon name="videocam" id="local-video-indicator" class="indicator-video"></ion-icon>
          </div>
        </div>
      </div>
    </div>
    
    <div class="call-controls">
      <button class="btn-call-control" id="toggle-audio-btn" title="Выключить микрофон">
        <ion-icon name="mic"></ion-icon>
      </button>
      
      <button class="btn-call-control" id="toggle-video-btn" title="Выключить камеру">
        <ion-icon name="videocam"></ion-icon>
      </button>
      
      <button class="btn-call-control btn-virtual-bg" id="virtual-bg-btn" title="Виртуальный фон">
        <ion-icon name="color-palette"></ion-icon>
      </button>
      
      <button class="btn-call-control btn-end-call" id="end-call-btn" title="Завершить звонок">
        <ion-icon name="call"></ion-icon>
      </button>
    </div>
  `;

  return window;
}

async function startCall(isInitiator) {
  try {
    const isVideo = currentCall.callType === 'video';
    const userName = await getCurrentUserName();
    const userId = await getCurrentUserId();
    
    localParticipantId = userId;
    
    console.log('🎥 Starting LiveKit call:', { userName, userId, isVideo, localParticipantId });
    
    setupLiveKitCallbacks();

    if (isVideo) {
      try {
        virtualBgProcessor = new VirtualBackgroundProcessor();
        await virtualBgProcessor.initialize();
        console.log('✅ Virtual background processor ready');
      } catch (error) {
        console.error('⚠️ Failed to initialize virtual background:', error);
        virtualBgProcessor = null;
      }
    }

    const localStream = await LiveKitCallClient.startCall(
      currentCall.callId,
      currentCall.roomId,
      userName,
      isVideo
    );

    originalStream = localStream;

    const localVideo = document.getElementById('local-video');
    if (localVideo && localStream) {
      localVideo.srcObject = localStream;
      console.log('✅ Local video set');
    }

    const virtualBgBtn = document.getElementById('virtual-bg-btn');
    if (virtualBgBtn) {
      if (virtualBgProcessor && isVideo) {
        virtualBgBtn.style.display = 'flex';
      } else {
        virtualBgBtn.style.display = 'none';
      }
    }

    console.log('✅ LiveKit call started successfully');

  } catch (error) {
    console.error('❌ Failed to start call:', error);
    alert(`Call Error: ${error.message || 'Failed to start call'}\n\nPlease check:\n- Camera/microphone permissions\n- Network connection\n- Server status`);
    cleanup();
  }
}

/**
 * Handle virtual background selection
 * ✅ FIXED: Don't stop processing, just switch modes
 */
async function handleBackgroundChange(background) {
  console.log('🎨 Changing virtual background:', background);
  
  if (!virtualBgProcessor) {
    console.error('❌ Virtual background processor not initialized');
    return;
  }
  
  if (!originalStream) {
    console.error('❌ No original stream available');
    return;
  }
  
  try {
    const virtualBgBtn = document.getElementById('virtual-bg-btn');
    const localVideo = document.getElementById('local-video');
    
    if (background.type === 'none') {
      // ═══════════════════════════════════════════════════════════════════
      // ✅ FIXED: Don't stop processing! Just switch to 'none' mode
      // ═══════════════════════════════════════════════════════════════════
      console.log('🔄 Disabling virtual background (switching to none mode)');
      
      // Just switch mode - processFrame will draw original video
      virtualBgProcessor.setBackgroundMode('none');
      
      // ✅ processedStream is STILL ACTIVE, just rendering original video now
      // No need to restore anything!
      
      virtualBgBtn?.classList.remove('active');
      console.log('✅ Virtual background disabled (still using processed stream in none mode)');
      
    } else {
      // ✅ Enable background
      
      // Configure effect
      if (background.type === 'blur') {
        if (background.amount) {
          virtualBgProcessor.setBlurAmount(background.amount);
        }
        virtualBgProcessor.setBackgroundMode('blur');
        console.log('🌫️ Blur background configured:', background.amount || 15, 'px');
        
      } else if (background.type === 'image') {
        await virtualBgProcessor.setBackgroundImage(background.url);
        virtualBgProcessor.setBackgroundMode('image');
        console.log('🖼️ Image background configured:', background.url);
      }
      
      // Start processing if not already started
      if (!virtualBgProcessor.isProcessing) {
        processedStream = await virtualBgProcessor.startProcessing(originalStream);
        
        if (!processedStream) {
          throw new Error('Failed to create processed stream');
        }
        
        console.log('✅ Virtual background processing started');
        
        // Update local preview
        if (localVideo) {
          localVideo.srcObject = processedStream;
          console.log('✅ Local preview updated with processed stream');
        }
        
        // Publish to LiveKit
        if (LiveKitCallClient && LiveKitCallClient.replaceVideoTrack) {
          try {
            await LiveKitCallClient.replaceVideoTrack(processedStream);
            console.log('✅ Processed video track published for remote viewers');
            console.log('🎉 Remote participants can now see your virtual background!');
          } catch (error) {
            console.warn('⚠️ Could not publish processed track:', error);
          }
        }
      } else {
        // Already processing, just changed mode
        console.log('✅ Background mode updated (already processing)');
      }
      
      virtualBgBtn?.classList.add('active');
      console.log('✅ Virtual background applied');
    }
    
  } catch (error) {
    console.error('❌ Failed to change background:', error);
    alert('Не удалось применить виртуальный фон. Попробуйте снова.');
  }
}

function setupLiveKitCallbacks() {
  LiveKitCallClient.onParticipantConnected = (participant) => {
    if (participant.identity === localParticipantId || participant.isLocal) {
      console.log('⚠️ Ignoring local participant in onParticipantConnected:', participant.identity);
      return;
    }
    
    console.log('👤 Participant connected:', participant.identity, participant.name);
    addParticipant(participant);
  };

  LiveKitCallClient.onParticipantDisconnected = (participant) => {
    if (participant.identity === localParticipantId || participant.isLocal) {
      console.log('⚠️ Ignoring local participant in onParticipantDisconnected:', participant.identity);
      return;
    }
    
    console.log('👋 Participant disconnected:', participant.identity);
    removeParticipant(participant.identity);
  };

  LiveKitCallClient.onRemoteTrackAdded = (track, participant) => {
    if (participant.identity === localParticipantId || participant.isLocal) {
      console.log('⚠️ Ignoring local track in onRemoteTrackAdded:', track.kind, participant.identity);
      return;
    }
    
    console.log('📥 Remote track added:', track.kind, 'from', participant.identity);
    addTrackToParticipant(track, participant);
  };

  LiveKitCallClient.onRemoteTrackRemoved = (track, participant) => {
    if (participant.identity === localParticipantId || participant.isLocal) {
      console.log('⚠️ Ignoring local track in onRemoteTrackRemoved:', track.kind, participant.identity);
      return;
    }
    
    console.log('📤 Remote track removed:', track.kind, 'from', participant.identity);
    removeTrackFromParticipant(track, participant);
  };

  LiveKitCallClient.onCallEnded = () => {
    console.log('📞 Call ended by LiveKit');
    cleanup();
  };
}

async function getCurrentUserName() {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (user.username) return user.username;
    
    const me = await API.getMe();
    return me.username || me.email || 'Anonymous';
  } catch (error) {
    console.warn('Failed to get username:', error);
    return 'Anonymous';
  }
}

async function getCurrentUserId() {
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

function addParticipant(participant) {
  const participantId = participant.identity;
  
  if (participantId === localParticipantId || participant.isLocal) {
    console.log('⚠️ Skipping local participant in addParticipant:', participantId);
    return;
  }
  
  if (remoteParticipants.has(participantId)) {
    console.log('⚠️ Participant already exists:', participantId);
    return;
  }

  console.log('➕ Adding participant:', participantId, participant.name);

  const grid = document.getElementById('remote-videos-grid');
  if (!grid) {
    console.error('❌ Grid not found!');
    return;
  }

  const emptyMessage = grid.querySelector('.empty-grid-message');
  if (emptyMessage) {
    emptyMessage.remove();
  }

  const container = document.createElement('div');
  container.className = 'remote-video-container';
  container.id = `remote-video-${participantId}`;

  const avatar = document.createElement('div');
  avatar.className = 'participant-avatar';
  const displayName = participant.name || participantId;
  avatar.textContent = displayName.charAt(0).toUpperCase();
  avatar.style.display = 'flex';

  const loader = document.createElement('div');
  loader.className = 'video-loader';
  loader.innerHTML = '<div class="loader-spinner"></div>';
  loader.style.display = 'none';

  const video = document.createElement('video');
  video.id = `video-${participantId}`;
  video.autoplay = true;
  video.playsinline = true;
  video.className = 'remote-video-grid-item';
  video.style.display = 'none';

  video.addEventListener('loadedmetadata', () => {
    console.log('✅ Video metadata loaded for', participantId);
    loader.style.display = 'none';
    container.classList.add('video-playing');
  });

  video.addEventListener('playing', () => {
    console.log('✅ Video playing for', participantId);
    loader.style.display = 'none';
    container.classList.add('video-playing');
    container.classList.remove('video-off');
  });

  video.addEventListener('waiting', () => {
    console.log('⏳ Video buffering for', participantId);
    loader.style.display = 'flex';
    container.classList.remove('video-playing');
  });

  const audio = document.createElement('audio');
  audio.id = `audio-${participantId}`;
  audio.autoplay = true;

  const overlay = document.createElement('div');
  overlay.className = 'remote-video-overlay';
  overlay.innerHTML = `
    <span class="participant-name">${displayName}</span>
    <div class="participant-indicators">
      <ion-icon name="mic-off" class="indicator-mic off" data-user="${participantId}"></ion-icon>
      <ion-icon name="videocam-off" class="indicator-video off" data-user="${participantId}"></ion-icon>
    </div>
  `;

  container.appendChild(avatar);
  container.appendChild(loader);
  container.appendChild(video);
  container.appendChild(audio);
  container.appendChild(overlay);
  grid.appendChild(container);

  remoteParticipants.set(participantId, {
    participant,
    video,
    audio,
    container,
    avatar,
    loader,
  });

  updateGridLayout();
  console.log('✅ Participant added to UI:', participantId);
}

function addTrackToParticipant(track, participant) {
  const participantId = participant.identity;
  
  if (participantId === localParticipantId || participant.isLocal) {
    console.log('⚠️ Skipping local track in addTrackToParticipant:', track.kind);
    return;
  }
  
  let data = remoteParticipants.get(participantId);
  
  if (!data) {
    console.warn('⚠️ Participant not found for track, adding now:', participantId);
    addParticipant(participant);
    data = remoteParticipants.get(participantId);
    
    if (!data) {
      console.error('❌ Failed to add participant:', participantId);
      return;
    }
  }

  const mediaStream = new MediaStream([track.mediaStreamTrack]);

  if (track.kind === 'video') {
    data.loader.style.display = 'flex';
    data.container.classList.remove('video-playing');
    data.container.classList.remove('video-off');
    
    data.video.srcObject = mediaStream;
    data.video.play().catch(err => {
      console.error('Failed to play video:', err);
      data.loader.style.display = 'none';
      data.container.classList.add('video-off');
    });
    
    data.video.style.display = 'block';
    data.avatar.style.display = 'none';
    
    console.log('✅ Video track attached to', participantId);
    updateIndicator(participantId, 'video', !track.isMuted);
    
  } else if (track.kind === 'audio') {
    data.audio.srcObject = mediaStream;
    data.audio.play().catch(err => {
      console.error('Failed to play audio:', err);
    });
    
    console.log('✅ Audio track attached to', participantId);
    updateIndicator(participantId, 'audio', !track.isMuted);
  }

  track.on('muted', () => {
    console.log(`🔇 ${track.kind} muted for ${participantId}`);
    
    if (track.kind === 'video') {
      data.video.style.display = 'none';
      data.avatar.style.display = 'flex';
      data.loader.style.display = 'none';
      data.container.classList.remove('video-playing');
      data.container.classList.add('video-off');
    }
    
    updateIndicator(participantId, track.kind, false);
  });

  track.on('unmuted', () => {
    console.log(`🔊 ${track.kind} unmuted for ${participantId}`);
    
    if (track.kind === 'video') {
      data.loader.style.display = 'flex';
      data.container.classList.remove('video-playing');
      data.container.classList.remove('video-off');
      data.video.style.display = 'block';
      data.avatar.style.display = 'none';
    }
    
    updateIndicator(participantId, track.kind, true);
  });
}

function removeTrackFromParticipant(track, participant) {
  const participantId = participant.identity;
  console.log('📤 Removing track:', track.kind, 'from', participantId);
  
  const data = remoteParticipants.get(participantId);
  if (!data) {
    console.warn('⚠️ Participant not found:', participantId);
    return;
  }

  if (track.kind === 'video') {
    data.video.srcObject = null;
    data.video.style.display = 'none';
    data.avatar.style.display = 'flex';
    data.loader.style.display = 'none';
    data.container.classList.remove('video-playing');
    data.container.classList.add('video-off');
    updateIndicator(participantId, 'video', false);
  } else if (track.kind === 'audio') {
    data.audio.srcObject = null;
    updateIndicator(participantId, 'audio', false);
  }
}

function removeParticipant(participantId) {
  const data = remoteParticipants.get(participantId);
  if (!data) {
    console.warn('⚠️ Participant not found:', participantId);
    return;
  }

  data.container.remove();
  remoteParticipants.delete(participantId);
  updateGridLayout();

  if (remoteParticipants.size === 0) {
    const grid = document.getElementById('remote-videos-grid');
    if (grid) {
      grid.innerHTML = '<div class="empty-grid-message">Ожидание остальных участников...</div>';
    }
  }

  console.log('✅ Participant removed:', participantId);
}

function updateIndicator(participantId, kind, enabled) {
  const indicatorClass = kind === 'video' ? 'indicator-video' : 'indicator-mic';
  const indicator = document.querySelector(`.${indicatorClass}[data-user="${participantId}"]`);
  
  if (!indicator) {
    console.warn('⚠️ Indicator not found:', indicatorClass, participantId);
    return;
  }

  if (kind === 'video') {
    indicator.setAttribute('name', enabled ? 'videocam' : 'videocam-off');
    indicator.classList.toggle('off', !enabled);
  } else {
    indicator.setAttribute('name', enabled ? 'mic' : 'mic-off');
    indicator.classList.toggle('off', !enabled);
  }
}

function updateGridLayout() {
  const grid = document.getElementById('remote-videos-grid');
  if (!grid) return;

  const count = remoteParticipants.size;
  grid.className = 'remote-videos-grid';

  if (count === 0) {
    grid.classList.add('grid-empty');
  } else if (count === 1) {
    grid.classList.add('grid-1');
  } else if (count === 2) {
    grid.classList.add('grid-2');
  } else if (count <= 4) {
    grid.classList.add('grid-4');
  } else if (count <= 9) {
    grid.classList.add('grid-9');
  } else {
    grid.classList.add('grid-16');
  }

  console.log('📐 Grid layout updated:', count, 'participants');
}

function setupEventListeners(window) {
  const toggleAudioBtn = window.querySelector('#toggle-audio-btn');
  const toggleVideoBtn = window.querySelector('#toggle-video-btn');
  const virtualBgBtn = window.querySelector('#virtual-bg-btn');
  const endCallBtn = window.querySelector('#end-call-btn');

  toggleAudioBtn.addEventListener('click', () => {
    isAudioMuted = !isAudioMuted;
    LiveKitCallClient.toggleAudio(!isAudioMuted);
    
    toggleAudioBtn.classList.toggle('muted', isAudioMuted);
    const icon = toggleAudioBtn.querySelector('ion-icon');
    if (icon) {
      icon.setAttribute('name', isAudioMuted ? 'mic-off' : 'mic');
    }
    
    const indicator = document.getElementById('local-mic-indicator');
    if (indicator) {
      indicator.setAttribute('name', isAudioMuted ? 'mic-off' : 'mic');
      indicator.classList.toggle('off', isAudioMuted);
    }
    
    console.log('🎤 Audio', isAudioMuted ? 'muted' : 'unmuted');
  });

  toggleVideoBtn.addEventListener('click', () => {
    isVideoOff = !isVideoOff;
    LiveKitCallClient.toggleVideo(!isVideoOff);
    
    toggleVideoBtn.classList.toggle('off', isVideoOff);
    const icon = toggleVideoBtn.querySelector('ion-icon');
    if (icon) {
      icon.setAttribute('name', isVideoOff ? 'videocam-off' : 'videocam');
    }

    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.style.display = isVideoOff ? 'none' : 'block';
    }
    
    const indicator = document.getElementById('local-video-indicator');
    if (indicator) {
      indicator.setAttribute('name', isVideoOff ? 'videocam-off' : 'videocam');
      indicator.classList.toggle('off', isVideoOff);
    }
    
    console.log('📹 Video', isVideoOff ? 'off' : 'on');
  });

  if (virtualBgBtn) {
    virtualBgBtn.addEventListener('click', () => {
      console.log('🎨 Opening virtual background selector');
      
      if (!document.getElementById('virtual-bg-modal')) {
        createBackgroundSelector(handleBackgroundChange);
      }
      
      showBackgroundSelector();
    });
  }

  endCallBtn.addEventListener('click', async () => {
    console.log('📞 End call button clicked');
    
    try {
      await API.endCall(currentCall.callId);
      console.log('✅ Call ended via API');
    } catch (error) {
      console.error('Failed to end call via API:', error);
    }
    
    cleanup();
  });
}

function startCallTimer() {
  callStartTime = Date.now();
  
  callTimer = setInterval(() => {
    const duration = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    const durationEl = document.getElementById('call-duration');
    if (durationEl) {
      durationEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }, 1000);
  
  console.log('⏱️ Call timer started');
}

function cleanup() {
  console.log('🧹 Cleaning up call window');
  
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }

  LiveKitCallClient.endCall();
  remoteParticipants.clear();

  if (virtualBgProcessor) {
    virtualBgProcessor.cleanup();
    virtualBgProcessor = null;
  }

  removeBackgroundSelector();

  const window = document.getElementById('active-call-window');
  if (window) {
    window.remove();
  }

  currentCall = null;
  isAudioMuted = false;
  isVideoOff = false;
  localParticipantId = null;
  originalStream = null;
  processedStream = null;
  
  console.log('✅ Call window cleanup complete');
}

function hide() {
  cleanup();
}

export default {
  show,
  hide,
};