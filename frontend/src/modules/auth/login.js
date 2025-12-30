import API from '../../api.js';

let isLoginMode = true;

export async function init() {
  console.log('Initializing auth...');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1 class="auth-title">ChatApp</h1>
          <p class="auth-subtitle">Real-time messaging and task management</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab active" data-mode="login">Login</button>
          <button class="auth-tab" data-mode="register">Sign Up</button>
        </div>

        <form id="auth-form" class="auth-form">
          <div id="register-fields" class="hidden">
            <div class="form-group">
              <label for="username">Username</label>
              <input 
                type="text" 
                id="username" 
                name="username" 
                class="input" 
                placeholder="Enter your username"
                autocomplete="username"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              class="input" 
              placeholder="Enter your email"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              class="input" 
              placeholder="Enter your password"
              required
              autocomplete="current-password"
            />
          </div>

          <div id="error-message" class="error-message hidden"></div>

          <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
            Login
          </button>
        </form>

        <div class="auth-footer">
          <p class="text-secondary">Made with ❤️ for productivity</p>
        </div>
      </div>
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const form = document.getElementById('auth-form');
  const tabs = document.querySelectorAll('.auth-tab');
  const registerFields = document.getElementById('register-fields');
  const submitBtn = document.getElementById('submit-btn');
  const usernameInput = document.getElementById('username');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      isLoginMode = tab.dataset.mode === 'login';

      if (isLoginMode) {
        registerFields.classList.add('hidden');
        submitBtn.textContent = 'Login';
        usernameInput.removeAttribute('required');
      } else {
        registerFields.classList.remove('hidden');
        submitBtn.textContent = 'Sign Up';
        usernameInput.setAttribute('required', '');
      }

      hideError();
    });
  });

  form.addEventListener('submit', handleSubmit);
}

async function handleSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  const formData = new FormData(e.target);
  
  const email = formData.get('email');
  const password = formData.get('password');
  const username = formData.get('username');

  submitBtn.disabled = true;
  submitBtn.textContent = isLoginMode ? 'Logging in...' : 'Signing up...';

  hideError();

  try {
    let response;

    if (isLoginMode) {
      response = await API.login(email, password);
    } else {
      if (!username) {
        throw { error: 'Username is required' };
      }
      response = await API.register(email, username, password);
    }

    // Save token
    API.setToken(response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);

    // Set user
    window.app.user = response.user;

    console.log('Authentication successful:', response.user);

    // Initialize WebSocket
    const { WebSocketManager } = await import('../../websocket.js');
    const ws = new WebSocketManager();
    window.app.ws = ws;
    await ws.connect();

    // Navigate to chat using window.app.router
    window.app.router.navigate('/chat');

  } catch (error) {
    console.error('Auth error:', error);
    showError(error.error || error.details || 'Authentication failed. Please try again.');

    submitBtn.disabled = false;
    submitBtn.textContent = isLoginMode ? 'Login' : 'Sign Up';
  }
}

function showError(message) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  const errorEl = document.getElementById('error-message');
  errorEl.classList.add('hidden');
}
