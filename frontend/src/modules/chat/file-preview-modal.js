export function show(fileUrl, fileName, fileType) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'file-preview-modal';
  
  let content = '';
  
  if (fileType.startsWith('image/')) {
    content = `<img src="${fileUrl}" alt="${fileName}" style="max-width: 100%; max-height: 80vh; object-fit: contain;">`;
  } else if (fileType.startsWith('video/')) {
    content = `
      <video controls style="max-width: 100%; max-height: 80vh;">
        <source src="${fileUrl}" type="${fileType}">
        Your browser does not support video playback.
      </video>
    `;
  } else {
    content = `
      <div class="file-info">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
        <h3>${fileName}</h3>
        <a href="${fileUrl}" download="${fileName}" class="btn btn-primary" style="margin-top: 20px;">
          Download File
        </a>
      </div>
    `;
  }
  
  modal.innerHTML = `
    <div class="modal modal-large">
      <div class="modal-header">
        <h2>${fileName}</h2>
        <button class="btn-icon" id="close-preview">×</button>
      </div>
      <div class="modal-body" style="text-align: center; padding: 20px;">
        ${content}
      </div>
      <div class="modal-footer">
        <a href="${fileUrl}" download="${fileName}" class="btn btn-secondary">
          Download
        </a>
        <button class="btn btn-primary" id="close-preview-btn">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#close-preview');
  const closeBtn2 = modal.querySelector('#close-preview-btn');

  closeBtn.addEventListener('click', () => modal.remove());
  closeBtn2.addEventListener('click', () => modal.remove());
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}
