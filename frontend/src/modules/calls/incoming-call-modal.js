// frontend/src/modules/calls/incoming-call-modal.js
import API from '../../api.js';

let currentCall = null;
let ringtone = null;

function show(call) {
  currentCall = call;

  console.log('📞 Incoming call:', call);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay incoming-call-modal';
  modal.id = 'incoming-call-modal';

  const callIcon = call.callType === 'video' 
    ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
    : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

  const callTypeText = call.isGroupCall ? 'Group' : '';

  modal.innerHTML = `
    <div class="modal incoming-call-modal-content">
      <div class="incoming-call-header">
        <div class="call-icon ${call.callType}">
          ${callIcon}
        </div>
        <h2>Incoming ${callTypeText} ${call.callType} call</h2>
        <p class="caller-name">${call.initiatorName || 'Unknown'}</p>
      </div>
      
      <div class="incoming-call-actions">
        <button class="btn btn-danger btn-round" id="reject-call-btn" title="Reject">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 1L1 23M1 1l22 22"/>
          </svg>
        </button>
        
        <button class="btn btn-success btn-round btn-large" id="answer-call-btn" title="Answer">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  setupEventListeners(modal);
  playRingtone();
}

function setupEventListeners(modal) {
  const answerBtn = modal.querySelector('#answer-call-btn');
  const rejectBtn = modal.querySelector('#reject-call-btn');

  answerBtn.addEventListener('click', async () => {
    stopRingtone();
    
    try {
      await API.answerCall(currentCall.callId);
      
      const { default: ActiveCallWindow } = await import('./active-call-window.js');
      
      // ✅ Для group call: targetUserId = null, для 1-1: targetUserId = initiatorId
      await ActiveCallWindow.show({
        callId: currentCall.callId,
        roomId: currentCall.roomId,
        roomName: currentCall.initiatorName || 'Call',
        callType: currentCall.callType,
        targetUserId: currentCall.isGroupCall ? null : currentCall.initiatorId, // ✅ КРИТИЧНО!
        isConference: currentCall.isGroupCall, // ✅ ДОБАВЛЕНО
      }, false); // isInitiator = false
      
      cleanup(modal);
    } catch (error) {
      console.error('Failed to answer call:', error);
      alert('Failed to answer call: ' + error.message);
    }
  });

  rejectBtn.addEventListener('click', async () => {
    stopRingtone();
    
    try {
      await API.rejectCall(currentCall.callId);
      cleanup(modal);
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  });
}

function playRingtone() {
  if (!ringtone) {
    ringtone = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGH0fPTgjMGHm7A7+OZUA0NTqno77RgGgg0jdLyy3coBSV7yPDck0IJFF647ueZTg0OUKzn8bllHAY3k9jx0IIyBSCB0PLBcSUDIXvK79mQPwoQYLnt6KJTEAY9nNvywHQrBSh/zfLaizsHHXLA7+Se');
  }
  ringtone.loop = true;
  ringtone.play().catch(console.error);
}

function stopRingtone() {
  if (ringtone) {
    ringtone.pause();
    ringtone.currentTime = 0;
  }
}

function cleanup(modal) {
  stopRingtone();
  currentCall = null;
  modal.remove();
}

function hide() {
  const modal = document.getElementById('incoming-call-modal');
  if (modal) {
    cleanup(modal);
  }
}

export default {
  show,
  hide,
};
