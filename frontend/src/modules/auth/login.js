import API from '../../api.js';

export async function init() {
  console.log('🟢 Initializing login page');
  
  // Hide sidebar for login page
  document.body.classList.add('login-page');
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.style.display = 'none';
  }

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <h1>ChatApp</h1>
        <p class="login-subtitle">Войдите в свой аккаунт</p>
        
        <form id="login-form" class="login-form">
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
          
          <div id="error-message" class="error-message" style="display: none;"></div>
          
          <button type="submit" class="btn btn-primary btn-block" id="login-btn">
            Войти
          </button>
        </form>
        
        <p class="login-footer">
          Еще нет аккаунта? <a href="/register" data-link>Создать аккаунт</a>
        </p>
      </div>
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const form = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  const loginBtn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    errorMessage.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';

    try {
      await window.app.login({ email, password });
    } catch (error) {
      console.error('Login failed:', error);
      
      errorMessage.textContent = error.message || 'Invalid email or password';
      errorMessage.style.display = 'block';
      
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  });
}

export function cleanup() {
  console.log('🧹 Cleaning up login page');
  
  // Show sidebar again
  document.body.classList.remove('login-page');
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.style.display = '';
  }
}
