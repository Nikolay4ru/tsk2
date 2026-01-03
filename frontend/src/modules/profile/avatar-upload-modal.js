import API from '../../api.js';

let currentFile = null;
let previewUrl = null;

export function show() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'avatar-upload-modal';
  
  modal.innerHTML = `
    <div class="modal modal-small">
      <div class="modal-header">
        <h2>Upload Avatar</h2>
        <button class="btn-icon" id="close-modal">×</button>
      </div>
      <div class="modal-body">
        <div class="avatar-upload-container">
          <div class="avatar-preview" id="avatar-preview">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          
          <input 
            type="file" 
            id="avatar-input" 
            accept="image/*" 
            style="display: none;"
          />
          
          <button class="btn btn-secondary" id="select-file-btn">
            Select Image
          </button>
          
          <p class="text-small text-muted">
            Max size: 5MB. Formats: JPG, PNG, GIF, WEBP
          </p>
        </div>
        
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="upload-btn" disabled>Upload</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setupEventListeners(modal);
}

function setupEventListeners(modal) {
  const closeBtn = modal.querySelector('#close-modal');
  const cancelBtn = modal.querySelector('#cancel-btn');
  const selectFileBtn = modal.querySelector('#select-file-btn');
  const avatarInput = modal.querySelector('#avatar-input');
  const uploadBtn = modal.querySelector('#upload-btn');
  const preview = modal.querySelector('#avatar-preview');

  closeBtn.addEventListener('click', () => cleanup(modal));
  cancelBtn.addEventListener('click', () => cleanup(modal));
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cleanup(modal);
  });

  selectFileBtn.addEventListener('click', () => {
    avatarInput.click();
  });

  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Max size is 5MB');
      return;
    }

    currentFile = file;

    // Show preview
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${previewUrl}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    
    uploadBtn.disabled = false;
  });

  uploadBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
      const result = await API.uploadAvatar(currentFile);
      
      console.log('Avatar uploaded:', result);

      // Update user avatar in app
      if (window.app && window.app.user) {
        window.app.user.avatar_url = result.avatar_url;
      }

      // Trigger global event for avatar update
      window.dispatchEvent(new CustomEvent('avatar-updated', {
        detail: { avatarUrl: result.avatar_url }
      }));

      cleanup(modal);
      
      alert('Avatar updated successfully!');
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Failed to upload avatar: ' + error.message);
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload';
    }
  });
}

function cleanup(modal) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  currentFile = null;
  modal.remove();
}
