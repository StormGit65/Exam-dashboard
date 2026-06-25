let masterKey = sessionStorage.getItem('vaultMasterKey');
let vaultData = [];
let currentEditingId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (masterKey) {
    document.getElementById('keyGateOverlay').style.display = 'none';
    document.getElementById('vaultContent').style.display = 'flex';
    loadVault();
  }
  
  // Enter key support for master key input
  const keyInput = document.getElementById('masterKeyInput');
  if (keyInput) {
    keyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') verifyKey();
    });
  }
});

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── VIEW SWITCHING ─────────────────────────────────────────
function switchView(view, fromLoad = false) {
  document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  document.getElementById(`view-${view}`).classList.add('active');
  const navItem = document.getElementById(`nav-${view}`);
  if (navItem) navItem.classList.add('active');
  
  if (view === 'generator' && !fromLoad) {
    currentEditingId = null;
    const btn = document.getElementById('generateBtn');
    if (btn) btn.textContent = 'Generate & Save';
    document.getElementById('resultCard').style.display = 'none';
  }
}

// ─── KEY VERIFICATION ───────────────────────────────────────
async function verifyKey() {
  const key = document.getElementById('masterKeyInput').value;
  const btn = document.getElementById('verifyKeyBtn');
  const err = document.getElementById('keyError');
  
  if (!key) return;
  
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  
  try {
    const res = await fetch('/api/vault/verify-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    
    if (res.ok) {
      masterKey = key;
      sessionStorage.setItem('vaultMasterKey', key);
      document.getElementById('keyGateOverlay').style.display = 'none';
      document.getElementById('vaultContent').style.display = 'flex';
      loadVault();
    } else {
      err.style.display = 'block';
    }
  } catch (e) {
    showToast('Error verifying key', 'error');
  }
  
  btn.disabled = false;
  btn.textContent = 'Unlock';
}

function toggleAppName() {
  const type = document.getElementById('accountType').value;
  const appGroup = document.getElementById('appNameGroup');
  const appLabel = document.getElementById('appNameLabel');
  
  if (type === 'email') {
    appGroup.style.display = 'none';
  } else {
    appGroup.style.display = 'block';
    appLabel.textContent = type === 'custom' ? 'Custom Account Name' : 'App Name';
  }
}

function toggleExtraInputs() {
  const extra = document.getElementById('extraInputs');
  const icon = document.getElementById('extraToggleIcon');
  if (extra.style.display === 'none') {
    extra.style.display = 'block';
    icon.textContent = '▲';
  } else {
    extra.style.display = 'none';
    icon.textContent = '▼';
  }
}

function toggleVis(id) {
  const el = document.getElementById(id);
  if (el.type === 'password') {
    el.type = 'text';
  } else {
    el.type = 'password';
  }
}

// ─── GENERATOR LOGIC ───────────────────────────────────────

function extractNumbersFromEmail(email) {
  if (!email) return '';
  const numbers = email.match(/\d/g);
  return numbers ? numbers.join('') : '';
}

function calculateStrength(password) {
  let score = 0;
  if (password.length > 8) score += 1;
  if (password.length > 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  
  if (score < 3) return 'Weak';
  if (score < 5) return 'Medium';
  return 'Strong';
}

function doGenerate() {
  const data = {
    accountType: document.getElementById('accountType').value,
    appName: document.getElementById('appName').value,
    email: document.getElementById('email').value,
    userQuote: document.getElementById('userQuote').value,
    preferredNumbers: document.getElementById('preferredNumbers').value,
    preferredSymbols: document.getElementById('preferredSymbols').value,
    extraFull: document.getElementById('extraFull').value,
    extraShort: document.getElementById('extraShort').value,
    extraShortest: document.getElementById('extraShortest').value
  };

  const words = data.userQuote.trim().split(/\s+/);
  const quoteAbbreviation = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join('').replace(/[^a-zA-Z]/g, '');

  let fullAppName = '';
  if ((data.accountType === 'app' || data.accountType === 'custom') && data.appName) {
    const app = data.appName.trim();
    if (app.length >= 4) {
      fullAppName = app.substring(0, 2) + app.substring(app.length - 2);
    } else {
      fullAppName = app;
    }
  }

  const emailName = data.email ? (data.email.split('@')[0] || '') : '';
  const emailNumbersFull = extractNumbersFromEmail(data.email);
  const fullPwd = (data.preferredNumbers || '') + quoteAbbreviation + (data.preferredSymbols || '') + 
                 (data.email || '') + fullAppName + emailName.replace(/\d/g, '') + emailNumbersFull + (data.extraFull || '');

  const firstPrefNum = (data.preferredNumbers || '').replace(/\D/g, '').charAt(0) || '';
  const shortQuoteLetter = words[0] ? words[0].charAt(0).toLowerCase() : '';
  const domain = data.email ? (data.email.split('@')[1] || 'email.com') : 'email.com';
  const firstDomainLetter = domain.charAt(0).toLowerCase();
  
  let shortAppName = '';
  if (fullAppName) shortAppName = fullAppName.toLowerCase();

  const shortEmailName = emailName.replace(/\d/g, '').substring(0, 3).toLowerCase();
  const firstEmailNum = extractNumbersFromEmail(data.email).charAt(0) || '';
  const shortPwd = 'SP' + firstPrefNum + shortQuoteLetter + (data.preferredSymbols || '') + 
                  firstDomainLetter + shortAppName + shortEmailName + firstEmailNum + (data.extraShort || '');

  const firstSymbol = (data.preferredSymbols || '').charAt(0);
  let shortestAppName = '';
  if ((data.accountType === 'app' || data.accountType === 'custom') && data.appName) {
    shortestAppName = data.appName.trim().charAt(0).toLowerCase();
  }
  const nameLetter = emailName.replace(/\d/g, '').charAt(0).toLowerCase();
  const shortestPwd = firstPrefNum + shortQuoteLetter + firstSymbol + firstDomainLetter + 
                     shortestAppName + nameLetter + firstEmailNum + (data.extraShortest || '');

  return { fullPwd, shortPwd, shortestPwd, data };
}

async function generatePassword() {
  const res = doGenerate();
  
  document.getElementById('resFull').value = res.fullPwd;
  document.getElementById('resShort').value = res.shortPwd;
  document.getElementById('resShortest').value = res.shortestPwd;
  
  document.getElementById('fullLen').textContent = `(${res.fullPwd.length})`;
  document.getElementById('shortLen').textContent = `(${res.shortPwd.length})`;
  document.getElementById('shortestLen').textContent = `(${res.shortestPwd.length})`;
  
  const strength = calculateStrength(res.fullPwd);
  const ind = document.getElementById('strengthIndicator');
  ind.textContent = `Strength: ${strength}`;
  
  // reset classes safely
  ind.className = 'strength-indicator';
  if(strength === 'Weak') ind.classList.add('strength-weak');
  if(strength === 'Medium') ind.classList.add('strength-medium');
  if(strength === 'Strong') ind.classList.add('strength-strong');
  
  document.getElementById('resultCard').style.display = 'block';

  try {
    const payload = {
      ...res.data,
      password: res.fullPwd,
      shortPassword: res.shortPwd,
      shortestPassword: res.shortestPwd
    };
    
    setSyncState('syncing');
    
    let url = '/api/vault/passwords';
    let method = 'POST';
    
    if (currentEditingId) {
      url += `/${currentEditingId}`;
      method = 'PUT';
    } else {
      const existing = vaultData.find(e => 
        e.accountType === payload.accountType && 
        e.email === payload.email && 
        e.appName === payload.appName
      );
      if (existing && existing._id) {
        url += `/${existing._id}`;
        method = 'PUT';
      }
    }
    
    const apiRes = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-vault-key': masterKey
      },
      body: JSON.stringify(payload)
    });
    
    if (apiRes.ok) {
      showToast('Saved to vault!');
      await loadVault();
      setSyncState('synced');
    } else {
      setSyncState('error');
    }
  } catch (err) {
    showToast('Failed to save to vault', 'error');
    setSyncState('error');
  }
}

function copyPwd(type) {
  let val = '';
  if (type === 'full') val = document.getElementById('resFull').value;
  if (type === 'short') val = document.getElementById('resShort').value;
  if (type === 'shortest') val = document.getElementById('resShortest').value;
  
  if (val) {
    navigator.clipboard.writeText(val).then(() => {
      showToast('Copied to clipboard!');
    });
  }
}

// ─── VAULT LIST ─────────────────────────────────────────────

function setSyncState(state) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  
  if (state === 'syncing') {
    dot.style.background = 'var(--dp-warning)';
    dot.style.boxShadow = '0 0 5px var(--dp-warning)';
    text.textContent = 'Syncing...';
  } else if (state === 'synced') {
    dot.style.background = 'var(--dp-success)';
    dot.style.boxShadow = '0 0 5px var(--dp-success)';
    text.textContent = 'Atlas Synced';
  } else {
    dot.style.background = 'var(--dp-danger)';
    dot.style.boxShadow = '0 0 5px var(--dp-danger)';
    text.textContent = 'Offline/Error';
  }
}

async function loadVault() {
  setSyncState('syncing');
  try {
    const res = await fetch('/api/vault/passwords', {
      headers: { 'x-vault-key': masterKey }
    });
    
    if (res.status === 401) {
      sessionStorage.removeItem('vaultMasterKey');
      masterKey = null;
      document.getElementById('keyGateOverlay').style.display = 'flex';
      document.getElementById('vaultContent').style.display = 'none';
      return;
    }
    
    vaultData = await res.json();
    filterList();
    setSyncState('synced');
  } catch (e) {
    showToast('Failed to load vault', 'error');
    setSyncState('error');
  }
}

function filterList() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const type = document.getElementById('filterType').value;
  
  let filtered = vaultData.filter(p => {
    if (type !== 'all' && p.accountType !== type) return false;
    
    const matchStr = `${p.appName || ''} ${p.email || ''}`.toLowerCase();
    if (search && !matchStr.includes(search)) return false;
    
    return true;
  });
  
  filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  renderVaultList(filtered);
}

function renderVaultList(list) {
  const container = document.getElementById('savedList');
  if (list.length === 0) {
    container.innerHTML = '<div style="color:var(--dp-text-muted); padding:20px; text-align: center; grid-column: 1 / -1;">No saved passwords found</div>';
    return;
  }
  
  container.innerHTML = list.map(p => {
    let icon = '🔑';
    if (p.accountType === 'email') icon = '📧';
    if (p.accountType === 'app') icon = '📱';
    
    return `
      <div class="pwd-card" onclick="openEditModal('${p._id}')">
        <div class="pwd-icon">${icon}</div>
        <h3>${p.accountType !== 'email' ? (p.appName || 'No Name') : (p.email || 'No Email')}</h3>
        <p>${p.accountType !== 'email' ? (p.email || 'No Email associated') : 'Email Account'}</p>
        <div class="pwd-date">${p.updatedAt || p.createdAt ? new Date(p.updatedAt || p.createdAt).toLocaleString() : 'Legacy Entry'}</div>
      </div>
    `;
  }).join('');
}

function openEditModal(id) {
  const p = vaultData.find(e => e._id === id);
  if (!p) return;
  
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h4 style="color: var(--dp-text); font-size: 1.2rem; margin-bottom: 4px;">${p.accountType !== 'email' ? p.appName : p.email}</h4>
      <p style="color: var(--dp-text-dim); font-size: 0.9rem;">${p.email || ''}</p>
      <span style="display:inline-block; margin-top:8px; font-size:0.7rem; padding: 2px 8px; border-radius: 10px; text-transform:uppercase; font-weight:700; background: var(--dp-red-dim); color: var(--dp-red-bright);">${p.accountType}</span>
    </div>

    <div class="pwd-result">
      <div class="pwd-header">
        <span>Full Password</span>
        <button class="dp-btn dp-btn-secondary copy-btn" onclick="copyFromModal('mFull')">Copy</button>
      </div>
      <div style="display:flex; gap:8px;">
        <input type="password" id="mFull" class="dp-input" readonly value="${p.password || ''}">
        <button class="dp-btn dp-btn-secondary" onclick="toggleVis('mFull')">👁</button>
      </div>
    </div>

    <div class="pwd-result">
      <div class="pwd-header">
        <span>Short Password</span>
        <button class="dp-btn dp-btn-secondary copy-btn" onclick="copyFromModal('mShort')">Copy</button>
      </div>
      <div style="display:flex; gap:8px;">
        <input type="password" id="mShort" class="dp-input" readonly value="${p.shortPassword || ''}">
        <button class="dp-btn dp-btn-secondary" onclick="toggleVis('mShort')">👁</button>
      </div>
    </div>

    <div class="pwd-result">
      <div class="pwd-header">
        <span>Shortest Password</span>
        <button class="dp-btn dp-btn-secondary copy-btn" onclick="copyFromModal('mShortest')">Copy</button>
      </div>
      <div style="display:flex; gap:8px;">
        <input type="password" id="mShortest" class="dp-input" readonly value="${p.shortestPassword || ''}">
        <button class="dp-btn dp-btn-secondary" onclick="toggleVis('mShortest')">👁</button>
      </div>
    </div>

    <div style="display: flex; gap: 12px; margin-top: 32px;">
      <button class="dp-btn dp-btn-secondary" onclick="loadIntoGenerator('${p._id}')" style="flex:1; justify-content: center;">Load to Generator</button>
      <button class="dp-btn dp-btn-danger" onclick="deleteEntry('${p._id}')" style="flex:1; justify-content: center;">Delete</button>
    </div>
  `;
  
  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
}

function copyFromModal(id) {
  const val = document.getElementById(id).value;
  if (val) {
    navigator.clipboard.writeText(val).then(() => {
      showToast('Copied to clipboard!');
    });
  }
}

function loadIntoGenerator(id) {
  closeEditModal();
  switchView('generator', true);
  currentEditingId = id;
  const btn = document.getElementById('generateBtn');
  if (btn) btn.textContent = 'Update Password';
  
  const p = vaultData.find(e => e._id === id);
  if (!p) return;
  
  document.getElementById('accountType').value = p.accountType || 'email';
  toggleAppName();
  document.getElementById('appName').value = p.appName || '';
  document.getElementById('email').value = p.email || '';
  document.getElementById('userQuote').value = p.userQuote || '';
  document.getElementById('preferredNumbers').value = p.preferredNumbers || '';
  document.getElementById('preferredSymbols').value = p.preferredSymbols || '';
  document.getElementById('extraFull').value = p.extraFull || '';
  document.getElementById('extraShort').value = p.extraShort || '';
  document.getElementById('extraShortest').value = p.extraShortest || '';
  
  document.getElementById('resFull').value = p.password || '';
  document.getElementById('resShort').value = p.shortPassword || '';
  document.getElementById('resShortest').value = p.shortestPassword || '';
  
  document.getElementById('fullLen').textContent = `(${p.password?.length || 0})`;
  document.getElementById('shortLen').textContent = `(${p.shortPassword?.length || 0})`;
  document.getElementById('shortestLen').textContent = `(${p.shortestPassword?.length || 0})`;
  
  document.getElementById('resultCard').style.display = 'block';
}

async function deleteEntry(id) {
  if (!confirm('Are you sure you want to delete this password?')) return;
  try {
    setSyncState('syncing');
    const res = await fetch(`/api/vault/passwords/${id}`, {
      method: 'DELETE',
      headers: { 'x-vault-key': masterKey }
    });
    if (res.ok) {
      showToast('Deleted');
      closeEditModal();
      await loadVault();
      setSyncState('synced');
    } else {
      setSyncState('error');
    }
  } catch (e) {
    showToast('Failed to delete', 'error');
    setSyncState('error');
  }
}

// ─── IMPORT / EXPORT ────────────────────────────────────────

async function exportVault() {
  try {
    const res = await fetch('/api/vault/export', {
      headers: { 'x-vault-key': masterKey }
    });
    const data = await res.json();
    
    if (data.passwords) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaizen-vault-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Vault exported successfully');
    }
  } catch (e) {
    showToast('Export failed', 'error');
  }
}

async function importVault() {
  const fileInput = document.getElementById('importFile');
  const oldKeyInput = document.getElementById('oldMasterKey');
  const btn = document.getElementById('importBtn');
  
  if (!fileInput.files[0]) {
    showToast('Please select a .json file', 'error');
    return;
  }
  if (!oldKeyInput.value) {
    showToast('Please enter the old master password', 'error');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Importing...';
  setSyncState('syncing');
  
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('oldMasterPassword', oldKeyInput.value);
  formData.append('newMasterPassword', masterKey);
  
  try {
    const res = await fetch('/api/vault/import', {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    if (res.ok) {
      showToast(`Imported ${data.importedCount} passwords!`);
      fileInput.value = '';
      oldKeyInput.value = '';
      await loadVault();
      setSyncState('synced');
    } else {
      showToast(data.error || 'Import failed', 'error');
      setSyncState('error');
    }
  } catch (e) {
    showToast('Network error during import', 'error');
    setSyncState('error');
  }
  
  btn.disabled = false;
  btn.textContent = '📤 Import';
}
