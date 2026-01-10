// frontend/src/modules/calls/virtual-background-ui.js
// UI Component for Virtual Background Selection

/**
 * Create virtual background selector modal
 */
export function createBackgroundSelector(onSelect) {
  const modal = document.createElement('div');
  modal.className = 'virtual-bg-modal';
  modal.id = 'virtual-bg-modal';

  // Preset backgrounds
  const presetBackgrounds = [
    { id: 'none', name: 'Нет эффекта', type: 'none', preview: null },
    { id: 'blur', name: 'Размытие', type: 'blur', preview: null },
    { id: 'office', name: 'Офис', type: 'image', url: '/assets/backgrounds/office.jpg' },
    { id: 'nature', name: 'Природа', type: 'image', url: '/assets/backgrounds/nature.jpg' },
    { id: 'abstract', name: 'Абстракция', type: 'image', url: '/assets/backgrounds/abstract.jpg' },
    { id: 'gradient', name: 'Градиент', type: 'image', url: '/assets/backgrounds/gradient.jpg' },
  ];

  modal.innerHTML = `
    <div class="virtual-bg-overlay" id="virtual-bg-overlay"></div>
    <div class="virtual-bg-content">
      <div class="virtual-bg-header">
        <h3>Виртуальный фон</h3>
        <button class="btn-close-modal" id="close-bg-modal">
          <ion-icon name="close"></ion-icon>
        </button>
      </div>
      
      <div class="virtual-bg-grid" id="virtual-bg-grid">
        ${presetBackgrounds.map(bg => `
          <div class="bg-option" data-bg-id="${bg.id}" data-bg-type="${bg.type}" ${bg.url ? `data-bg-url="${bg.url}"` : ''}>
            <div class="bg-preview">
              ${bg.type === 'none' ? '<ion-icon name="close-circle"></ion-icon>' : ''}
              ${bg.type === 'blur' ? '<ion-icon name="ellipse"></ion-icon>' : ''}
              ${bg.type === 'image' ? `<img src="${bg.url}" alt="${bg.name}" />` : ''}
            </div>
            <span class="bg-name">${bg.name}</span>
          </div>
        `).join('')}
        
        <!-- Upload custom background -->
        <div class="bg-option bg-option-upload" id="upload-bg-option">
          <div class="bg-preview">
            <ion-icon name="cloud-upload"></ion-icon>
          </div>
          <span class="bg-name">Загрузить</span>
          <input type="file" id="bg-file-input" accept="image/*" style="display: none;" />
        </div>
      </div>
      
      <!-- Blur slider (shown when blur selected) -->
      <div class="blur-settings" id="blur-settings" style="display: none;">
        <label>Уровень размытия:</label>
        <input type="range" id="blur-slider" min="5" max="30" value="15" />
        <span id="blur-value">15px</span>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  setupBackgroundSelectorEvents(modal, presetBackgrounds, onSelect);

  return modal;
}

/**
 * Setup event listeners for background selector
 */
function setupBackgroundSelectorEvents(modal, presetBackgrounds, onSelect) {
  // Close modal
  const closeBtn = modal.querySelector('#close-bg-modal');
  const overlay = modal.querySelector('#virtual-bg-overlay');
  
  const closeModal = () => {
    modal.style.display = 'none';
  };
  
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  // Background options
  const bgOptions = modal.querySelectorAll('.bg-option:not(.bg-option-upload)');
  bgOptions.forEach(option => {
    option.addEventListener('click', () => {
      const bgId = option.dataset.bgId;
      const bgType = option.dataset.bgType;
      const bgUrl = option.dataset.bgUrl;
      
      // Remove active class from all
      bgOptions.forEach(opt => opt.classList.remove('active'));
      
      // Add active to clicked
      option.classList.add('active');
      
      // Show/hide blur settings
      const blurSettings = modal.querySelector('#blur-settings');
      if (bgType === 'blur') {
        blurSettings.style.display = 'block';
      } else {
        blurSettings.style.display = 'none';
      }
      
      // Callback
      onSelect({ id: bgId, type: bgType, url: bgUrl });
      
      console.log('🎨 Background selected:', bgId, bgType);
    });
  });

  // Blur slider
  const blurSlider = modal.querySelector('#blur-slider');
  const blurValue = modal.querySelector('#blur-value');
  
  blurSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    blurValue.textContent = `${value}px`;
    
    // Callback with blur amount
    onSelect({ type: 'blur', amount: parseInt(value) });
  });

  // Upload custom background
  const uploadOption = modal.querySelector('#upload-bg-option');
  const fileInput = modal.querySelector('#bg-file-input');
  
  uploadOption.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('📤 Uploading custom background:', file.name);
    
    // Read file as data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target.result;
      
      // Remove active from all
      bgOptions.forEach(opt => opt.classList.remove('active'));
      uploadOption.classList.add('active');
      
      // Callback
      onSelect({ type: 'image', url: imageUrl, custom: true });
      
      console.log('✅ Custom background loaded');
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Show background selector modal
 */
export function showBackgroundSelector() {
  const modal = document.getElementById('virtual-bg-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

/**
 * Hide background selector modal
 */
export function hideBackgroundSelector() {
  const modal = document.getElementById('virtual-bg-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Remove background selector modal
 */
export function removeBackgroundSelector() {
  const modal = document.getElementById('virtual-bg-modal');
  if (modal) {
    modal.remove();
  }
}