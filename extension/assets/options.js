// Cross-browser compatibility: alias chrome to browser in Chrome
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Storage key for PAT
const PAT_KEY = 'github_pat';

// DOM elements
const patInput = document.getElementById('pat-input');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const clearBtn = document.getElementById('clear-btn');
const messageEl = document.getElementById('message');
const statusConfigured = document.getElementById('status-configured');
const statusNotConfigured = document.getElementById('status-not-configured');

// Show message to user
function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message message--${type}`;
  messageEl.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 5000);
}

// Update UI based on whether token is configured
function updateStatus(hasToken) {
  if (hasToken) {
    statusConfigured.style.display = 'inline-flex';
    statusNotConfigured.style.display = 'none';
    clearBtn.style.display = 'inline-block';
    patInput.placeholder = '••••••••••••••••••••••••••••••••••••••••';
  } else {
    statusConfigured.style.display = 'none';
    statusNotConfigured.style.display = 'inline-flex';
    clearBtn.style.display = 'none';
    patInput.placeholder = 'github_pat_xxxxxxxxxxxxxxxxxxxx';
  }
}

// Validate PAT format (fine-grained tokens only)
function isValidPatFormat(pat) {
  return /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/.test(pat);
}

// Test PAT against GitHub API
async function testPat(pat) {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${pat}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      return { valid: true, user: data.login };
    } else if (response.status === 401) {
      return { valid: false, error: 'Invalid or expired token' };
    } else {
      return { valid: false, error: `API error: ${response.status}` };
    }
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// Load existing PAT on page load
async function loadExistingPat() {
  try {
    const result = await browser.storage.sync.get(PAT_KEY);
    const hasToken = !!result[PAT_KEY];
    updateStatus(hasToken);
  } catch (e) {
    console.error('[Options] Error loading PAT:', e);
  }
}

// Save PAT
async function savePat() {
  const pat = patInput.value.trim();

  if (!pat) {
    showMessage('Enter a token', 'error');
    return;
  }

  if (!isValidPatFormat(pat)) {
    showMessage('Invalid token format. Use a fine-grained token (github_pat_...)', 'error');
    return;
  }

  // Test the token first
  saveBtn.disabled = true;
  saveBtn.textContent = 'Validating...';

  const result = await testPat(pat);

  if (!result.valid) {
    showMessage(`Token validation failed: ${result.error}`, 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Token';
    return;
  }

  // Save to storage
  try {
    await browser.storage.sync.set({ [PAT_KEY]: pat });
    showMessage(`Token saved successfully! Authenticated as @${result.user}`, 'success');
    patInput.value = '';
    updateStatus(true);
  } catch (e) {
    showMessage(`Error saving token: ${e.message}`, 'error');
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Token';
}

// Test token (from input field or stored)
async function testToken() {
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  try {
    // Prefer input field, fall back to stored token
    let pat = patInput.value.trim();
    if (!pat) {
      const stored = await browser.storage.sync.get(PAT_KEY);
      pat = stored[PAT_KEY];
    }

    if (!pat) {
      showMessage('Enter a token to test', 'error');
      testBtn.disabled = false;
      testBtn.textContent = 'Test';
      return;
    }

    if (!isValidPatFormat(pat)) {
      showMessage('Invalid token format. Use a fine-grained token (github_pat_...)', 'error');
      testBtn.disabled = false;
      testBtn.textContent = 'Test';
      return;
    }

    const result = await testPat(pat);

    if (result.valid) {
      showMessage(`Token is valid! Authenticated as @${result.user}`, 'success');
    } else {
      showMessage(`Token test failed: ${result.error}`, 'error');
    }
  } catch (e) {
    showMessage(`Error testing token: ${e.message}`, 'error');
  }

  testBtn.disabled = false;
  testBtn.textContent = 'Test';
}

// Clear PAT
async function clearPat() {
  if (!confirm('Are you sure you want to remove your GitHub token?')) {
    return;
  }

  try {
    await browser.storage.sync.remove(PAT_KEY);
    showMessage('Token removed', 'success');
    patInput.value = '';
    updateStatus(false);
  } catch (e) {
    showMessage(`Error removing token: ${e.message}`, 'error');
  }
}

// Toggle password visibility
function toggleVisibility() {
  const isPassword = patInput.type === 'password';
  patInput.type = isPassword ? 'text' : 'password';
  toggleBtn.setAttribute('aria-pressed', isPassword);
  toggleBtn.title = isPassword ? 'Hide' : 'Show';
}

// Event listeners
const toggleBtn = document.getElementById('toggle-visibility-btn');
saveBtn.addEventListener('click', savePat);
testBtn.addEventListener('click', testToken);
clearBtn.addEventListener('click', clearPat);
toggleBtn.addEventListener('click', toggleVisibility);

// Allow Enter key to save
patInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    savePat();
  }
});

// Initialize
loadExistingPat();
