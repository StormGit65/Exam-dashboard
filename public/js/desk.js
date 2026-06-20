// ═══════════════════════════════════════════════════════════
//  MY DESK — Cross-Exam Workspace with Profiles
// ═══════════════════════════════════════════════════════════

let deskProfiles = [];
let deskCurrentProfile = null;
let deskTasks = [];
let deskEntries = [];
let deskEditingEntryId = null;
const DESK_DEFAULT_PAGE_COLOR = '#0b0b0f';
let deskCurrentPageColor = DESK_DEFAULT_PAGE_COLOR;
let deskJournalFullscreen = false;

let deskArchivePanelOpen = false;
let deskArchivedProfiles = [];

let deskConfirmMutedUntil = 0;
function deskConfirm(message) {
  return new Promise(resolve => {
    if (Date.now() < deskConfirmMutedUntil) {
      resolve(true);
      return;
    }
    let modal = document.getElementById('deskConfirmModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'deskConfirmModal';
      modal.className = 'modal-overlay';
      modal.style.zIndex = '9999';
      modal.innerHTML = `
        <div class="modal custom-confirm-modal">
          <h2 style="font-size: 1.1rem; margin-bottom: 12px;">Confirm Action</h2>
          <p id="deskConfirmMessage" style="font-size: .9rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;"></p>
          <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="deskConfirmMute" style="accent-color: var(--accent); cursor: pointer;">
            <label for="deskConfirmMute" style="font-size: .85rem; color: var(--text-muted); cursor: pointer;">Don't ask again for 5 minutes</label>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" id="deskConfirmCancelBtn">Cancel</button>
            <button class="btn btn-primary" id="deskConfirmOkBtn">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    document.getElementById('deskConfirmMessage').textContent = message;
    document.getElementById('deskConfirmMute').checked = false;
    modal.classList.add('active');

    const okBtn = document.getElementById('deskConfirmOkBtn');
    const cancelBtn = document.getElementById('deskConfirmCancelBtn');

    okBtn.replaceWith(okBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    const newOk = document.getElementById('deskConfirmOkBtn');
    const newCancel = document.getElementById('deskConfirmCancelBtn');

    const cleanup = () => { modal.classList.remove('active'); };

    newOk.onclick = () => {
      if (document.getElementById('deskConfirmMute').checked) {
        deskConfirmMutedUntil = Date.now() + 5 * 60 * 1000;
      }
      cleanup();
      resolve(true);
    };

    newCancel.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

const DESK_COLORS = ['#a78bfa','#f472b6','#34d399','#60a5fa','#fbbf24','#fb923c','#f87171','#a3e635','#2dd4bf','#c084fc'];

let deskSplitResizerInitialized = false;

function initDeskSplitResizer() {
  if (deskSplitResizerInitialized) return;
  deskSplitResizerInitialized = true;

  const divider = document.querySelector('.desk-split-divider');
  const splitContainer = document.querySelector('.desk-split');
  if (!divider || !splitContainer) return;
  
  let isResizing = false;
  
  divider.addEventListener('mousedown', (e) => {
    isResizing = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  });
  
  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const containerRect = splitContainer.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    const percentage = (newWidth / containerRect.width) * 100;
    
    if (percentage > 20 && percentage < 80) {
      splitContainer.style.gridTemplateColumns = `${percentage}% 5px 1fr`;
    }
  });
  
  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      divider.classList.remove('dragging');
      document.body.style.cursor = '';
    }
  });
}

// ─── Open / Close ───
function openMyDesk() {
  const overlay = document.getElementById('deskModalOverlay');
  if (!overlay) return;
  document.body.style.overflow = 'hidden';
  overlay.classList.add('active');
  setDeskJournalFullscreen(false);
  loadDeskProfiles();
  initDeskSplitResizer();
}

function closeMyDesk() {
  const overlay = document.getElementById('deskModalOverlay');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
  setDeskJournalFullscreen(false);
  if (deskTabMode === 'edit') {
    setDeskTabMode('scroll');
  }
  // Reset archive toggle if open
  if (deskArchivePanelOpen) {
    deskArchivePanelOpen = false;
    deskArchivedProfiles = [];
    const btn = document.getElementById('deskArchiveToggleBtn');
    if (btn) {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-muted)';
      btn.style.borderColor = 'var(--border)';
    }
    // Switch to first active tab and re-render
    if (deskProfiles.length > 0) {
      switchDeskProfile(deskProfiles[0]._id);
    } else {
      switchDeskProfile(null);
    }
    renderDeskTabBar();
  }
  // Refresh sidebar goals so archived profile tasks are excluded
  if (typeof loadGoals === 'function') loadGoals();
}

function setDeskJournalFullscreen(enabled) {
  deskJournalFullscreen = !!enabled;
  const split = document.querySelector('.desk-split');
  if (split) {
    split.classList.toggle('journal-fullscreen', deskJournalFullscreen);
  }
  const modal = document.querySelector('.desk-modal');
  if (modal) {
    modal.classList.toggle('journal-fullscreen-mode', deskJournalFullscreen);
  }
  const btn = document.getElementById('deskJournalFullscreenBtn');
  if (btn) {
    btn.classList.toggle('active', deskJournalFullscreen);
    btn.textContent = deskJournalFullscreen ? '⤡' : '⤢';
    btn.setAttribute('title', deskJournalFullscreen ? 'Exit journal fullscreen' : 'Journal fullscreen');
    btn.setAttribute('aria-label', deskJournalFullscreen ? 'Exit journal fullscreen' : 'Toggle journal fullscreen');
  }
}

function toggleDeskJournalFullscreen() {
  setDeskJournalFullscreen(!deskJournalFullscreen);
}

// ─── Profile CRUD ───
async function loadDeskProfiles() {
  try {
    const res = await fetch('/api/desk/profiles');
    deskProfiles = await res.json();
  } catch { deskProfiles = []; }

  // Ensure at least "General" profile exists
  if (deskProfiles.length === 0) {
    await createDeskProfile('General', DESK_COLORS[0]);
    return loadDeskProfiles();
  }

  renderDeskTabBar();
  if (!deskCurrentProfile || !deskProfiles.find(p => p._id === deskCurrentProfile)) {
    deskCurrentProfile = deskProfiles[0]._id;
  }
  switchDeskProfile(deskCurrentProfile);
}

let deskTabMode = 'scroll';
let deskTabIsDown = false;
let deskTabStartX;
let deskTabScrollLeft;
let draggedDeskProfile = null;

function setDeskTabMode(mode) {
  if (deskTabMode === mode && mode === 'edit') {
    mode = 'scroll';
  }
  deskTabMode = mode;
  document.getElementById('deskTabScrollBtn').classList.toggle('active', mode === 'scroll');
  document.getElementById('deskTabOrderBtn').classList.toggle('active', mode === 'order');
  const editBtn = document.getElementById('deskTabEditBtn');
  if (editBtn) editBtn.classList.toggle('active', mode === 'edit');
  
  if (mode === 'scroll') {
    document.getElementById('deskTabScrollBtn').style.background = 'var(--accent)';
    document.getElementById('deskTabScrollBtn').style.color = '#000';
    document.getElementById('deskTabOrderBtn').style.background = 'transparent';
    document.getElementById('deskTabOrderBtn').style.color = 'var(--text-muted)';
    if (editBtn) { editBtn.style.background = 'transparent'; editBtn.style.color = 'var(--text-muted)'; }
  } else if (mode === 'order') {
    document.getElementById('deskTabOrderBtn').style.background = 'var(--accent)';
    document.getElementById('deskTabOrderBtn').style.color = '#000';
    document.getElementById('deskTabScrollBtn').style.background = 'transparent';
    document.getElementById('deskTabScrollBtn').style.color = 'var(--text-muted)';
    if (editBtn) { editBtn.style.background = 'transparent'; editBtn.style.color = 'var(--text-muted)'; }
  } else if (mode === 'edit') {
    if (editBtn) { editBtn.style.background = 'var(--accent)'; editBtn.style.color = '#000'; }
    document.getElementById('deskTabScrollBtn').style.background = 'transparent';
    document.getElementById('deskTabScrollBtn').style.color = 'var(--text-muted)';
    document.getElementById('deskTabOrderBtn').style.background = 'transparent';
    document.getElementById('deskTabOrderBtn').style.color = 'var(--text-muted)';
  }
  
  renderDeskTabBar();
}

function initDeskTabScroll() {
  const bar = document.getElementById('deskTabBar');
  if (!bar) return;
  bar.onmousedown = (e) => {
    if (deskTabMode !== 'scroll') return;
    deskTabIsDown = true;
    bar.style.cursor = 'grabbing';
    deskTabStartX = e.pageX - bar.offsetLeft;
    deskTabScrollLeft = bar.scrollLeft;
  };
  bar.onmouseleave = () => {
    deskTabIsDown = false;
    bar.style.cursor = deskTabMode === 'scroll' ? 'grab' : '';
  };
  bar.onmouseup = () => {
    deskTabIsDown = false;
    bar.style.cursor = deskTabMode === 'scroll' ? 'grab' : '';
  };
  bar.onmousemove = (e) => {
    if (!deskTabIsDown || deskTabMode !== 'scroll') return;
    e.preventDefault();
    const x = e.pageX - bar.offsetLeft;
    const walk = (x - deskTabStartX) * 2;
    bar.scrollLeft = deskTabScrollLeft - walk;
  };
  if (deskTabMode === 'scroll') {
    bar.style.cursor = 'grab';
  } else {
    bar.style.cursor = '';
  }
}

function renderDeskTabBar() {
  const bar = document.getElementById('deskTabBar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.style.userSelect = 'none';

  const listToRender = deskArchivePanelOpen ? deskArchivedProfiles : deskProfiles;

  listToRender.forEach((p, index) => {
    const tab = document.createElement('button');
    const isActive = p._id === deskCurrentProfile;
    tab.className = `desk-tab${isActive ? ' active' : ''}`;
    tab.innerHTML = `<span>${p.name}</span>`;
    
    if (deskTabMode === 'order') {
      tab.draggable = true;
      tab.style.cursor = 'move';
      
      tab.ondragstart = (e) => {
        draggedDeskProfile = p;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => tab.style.opacity = '0.5', 0);
      };
      tab.ondragend = () => {
        draggedDeskProfile = null;
        tab.style.opacity = '1';
        listToRender.forEach(x => {
          const t = Array.from(bar.children).find(c => c.dataset && c.dataset.id === x._id);
          if (t) t.style.borderLeft = 'none';
        });
      };
      tab.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tab.style.borderLeft = '2px solid var(--accent)';
      };
      tab.ondragleave = () => {
        tab.style.borderLeft = 'none';
      };
      tab.ondrop = async (e) => {
        e.preventDefault();
        tab.style.borderLeft = 'none';
        if (!draggedDeskProfile || draggedDeskProfile._id === p._id) return;
        
        const oldIndex = listToRender.findIndex(x => x._id === draggedDeskProfile._id);
        const newIndex = listToRender.findIndex(x => x._id === p._id);
        
        listToRender.splice(oldIndex, 1);
        listToRender.splice(newIndex, 0, draggedDeskProfile);
        
        renderDeskTabBar();
        
        const updates = listToRender.map((profile, i) => ({ id: profile._id, order: i }));
        try {
          await fetch('/api/desk/profiles/action/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
          });
        } catch (err) { console.error(err); }
      };
    } else if (deskTabMode === 'edit') {
      tab.draggable = false;
      tab.style.cursor = 'pointer';
      tab.onclick = () => openEditDeskProfileModal(p);
    } else {
      tab.draggable = false;
      tab.style.cursor = 'pointer';
      tab.onclick = () => switchDeskProfile(p._id);
    }
    
    tab.dataset.id = p._id;

    // Removed archived styling so they look exactly like normal tabs

    if (isActive) {
      const bg = p.color || '#a78bfa';
      tab.style.backgroundColor = bg;
      const contrastColor = getDeskContrast(bg);
      tab.style.color = contrastColor;
      tab.style.borderBottomColor = 'transparent';
    }

    if (p.hasData) {
      const dot = document.createElement('div');
      dot.style.width = '6px';
      dot.style.height = '6px';
      dot.style.borderRadius = '50%';
      if (isActive) {
        const bg = p.color || '#a78bfa';
        const contrastColor = getDeskContrast(bg);
        dot.style.backgroundColor = contrastColor === '#000000' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
      } else {
        dot.style.backgroundColor = p.color || '#a78bfa';
      }
      dot.style.marginLeft = '2px';
      if (deskArchivePanelOpen && !isActive) {
        // No longer fade the dot
      }
      tab.appendChild(dot);
    }

    bar.appendChild(tab);
  });

  if (listToRender.length === 0) {
    bar.innerHTML = `<div style="padding: 6px 16px; color: var(--text-muted); font-size: .8rem;">${deskArchivePanelOpen ? 'No archived profiles.' : 'No active profiles.'}</div>`;
  }

  initDeskTabScroll();
}

function promptNewProfile() {
  const modal = document.getElementById('deskProfileModal');
  if (modal) {
    document.getElementById('deskProfileNameInput').value = '';
    const swatches = document.querySelectorAll('.desk-profile-color-swatch');
    swatches.forEach(s => s.classList.remove('selected'));
    if (swatches.length > 0) swatches[0].classList.add('selected');
    modal.classList.add('active');
    document.getElementById('deskProfileNameInput').focus();
  }
}

function closeDeskProfileModal() {
  const modal = document.getElementById('deskProfileModal');
  if (modal) modal.classList.remove('active');
}

async function confirmCreateDeskProfile() {
  const name = document.getElementById('deskProfileNameInput').value.trim();
  if (!name) return;
  const swatch = document.querySelector('.desk-profile-color-swatch.selected');
  const color = swatch ? swatch.dataset.color : DESK_COLORS[0];
  await createDeskProfile(name, color);
  closeDeskProfileModal();
}

function openEditDeskProfileModal(p) {
  const modal = document.getElementById('editDeskProfileModal');
  if (modal) {
    document.getElementById('editDeskProfileIdInput').value = p._id;
    document.getElementById('editDeskProfileNameInput').value = p.name;
    const swatches = document.querySelectorAll('.edit-desk-profile-color-swatch');
    swatches.forEach(s => {
      s.classList.remove('selected');
      if (s.dataset.color === p.color) s.classList.add('selected');
    });
    // If no color matches perfectly, just pick the first one
    if (!document.querySelector('.edit-desk-profile-color-swatch.selected') && swatches.length > 0) {
      swatches[0].classList.add('selected');
    }
    // Update archive button label
    const archiveBtn = document.getElementById('deskProfileArchiveBtn');
    if (archiveBtn) {
      const isArchived = deskArchivedProfiles.some(ap => ap._id === p._id);
      if (isArchived) {
        archiveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"></polyline><line x1="12" y1="6" x2="12" y2="18"></line></svg>Unarchive';
        archiveBtn.title = 'Unarchive this profile';
        archiveBtn.style.color = 'var(--success, #34d399)';
        archiveBtn.style.borderColor = 'rgba(52,211,153,0.3)';
        archiveBtn.style.background = 'rgba(52,211,153,0.1)';
        archiveBtn.style.display = 'flex';
        archiveBtn.style.alignItems = 'center';
        archiveBtn.style.justifyContent = 'center';
        archiveBtn.style.gap = '6px';
      } else {
        archiveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>Archive';
        archiveBtn.title = 'Archive this profile';
        archiveBtn.style.color = 'var(--text-muted)';
        archiveBtn.style.borderColor = 'var(--border)';
        archiveBtn.style.background = 'rgba(255,255,255,0.05)';
        archiveBtn.style.display = 'flex';
        archiveBtn.style.alignItems = 'center';
        archiveBtn.style.justifyContent = 'center';
        archiveBtn.style.gap = '6px';
      }
    }
    modal.classList.add('active');
    document.getElementById('editDeskProfileNameInput').focus();
  }
}

function closeEditDeskProfileModal() {
  const modal = document.getElementById('editDeskProfileModal');
  if (modal) modal.classList.remove('active');
}

async function confirmEditDeskProfile() {
  const id = document.getElementById('editDeskProfileIdInput').value;
  const name = document.getElementById('editDeskProfileNameInput').value.trim();
  if (!name || !id) return;
  const swatch = document.querySelector('.edit-desk-profile-color-swatch.selected');
  const color = swatch ? swatch.dataset.color : DESK_COLORS[0];
  
  try {
    await fetch(`/api/desk/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
    await loadDeskProfiles();
    closeEditDeskProfileModal();
  } catch (err) { console.error('Failed to update profile:', err); }
}

async function deleteDeskProfileFromEdit() {
  const id = document.getElementById('editDeskProfileIdInput').value;
  const name = document.getElementById('editDeskProfileNameInput').value.trim();
  if (!id) return;
  const confirmed = await deskConfirm(`Delete profile "${name}" and all its tasks/entries?`);
  if (confirmed) {
    await deleteDeskProfile(id);
    closeEditDeskProfileModal();
  }
}

async function createDeskProfile(name, color) {
  try {
    await fetch('/api/desk/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
    await loadDeskProfiles();
  } catch (e) { console.error('Create profile failed:', e); }
}

async function deleteDeskProfile(id) {
  try {
    await fetch(`/api/desk/profiles/${id}`, { method: 'DELETE' });
    if (deskCurrentProfile === id) deskCurrentProfile = null;
    await loadDeskProfiles();
    if (typeof loadGoals === 'function') loadGoals();
  } catch (e) { console.error('Delete profile failed:', e); }
}

// ─── Archive / Unarchive ───
async function archiveDeskProfile(id) {
  try {
    await fetch(`/api/desk/profiles/${id}/archive`, { method: 'PUT' });
    
    // Switch to another active tab if we're not in the archives view
    if (deskCurrentProfile === id && !deskArchivePanelOpen) {
      const remaining = deskProfiles.filter(p => p._id !== id);
      deskCurrentProfile = remaining.length > 0 ? remaining[0]._id : null;
    }
    
    await loadDeskProfiles();
    if (deskArchivePanelOpen) {
      await loadDeskArchivedProfiles();
      renderDeskTabBar();
    }
    // Refresh sidebar goals so archived profile tasks are excluded
    if (typeof loadGoals === 'function') loadGoals();
  } catch (e) { console.error('Archive profile failed:', e); }
}

async function unarchiveDeskProfile(id) {
  try {
    await fetch(`/api/desk/profiles/${id}/unarchive`, { method: 'PUT' });
    
    // Switch to another archived tab if we are in archives view
    if (deskCurrentProfile === id && deskArchivePanelOpen) {
      const remaining = deskArchivedProfiles.filter(p => p._id !== id);
      deskCurrentProfile = remaining.length > 0 ? remaining[0]._id : null;
    }

    await loadDeskProfiles();
    if (deskArchivePanelOpen) {
      await loadDeskArchivedProfiles();
    }
    renderDeskTabBar();
    // Refresh sidebar goals so unarchived profile tasks show up
    if (typeof loadGoals === 'function') loadGoals();
  } catch (e) { console.error('Unarchive profile failed:', e); }
}

async function archiveDeskProfileFromEdit() {
  const id = document.getElementById('editDeskProfileIdInput').value;
  const name = document.getElementById('editDeskProfileNameInput').value.trim();
  if (!id) return;
  const activeProfile = deskProfiles.find(p => p._id === id);
  const archivedProfile = deskArchivedProfiles.find(p => p._id === id);
  const isArchived = archivedProfile && !activeProfile;
  
  if (isArchived) {
    await unarchiveDeskProfile(id);
  } else {
    const confirmed = await deskConfirm(`Archive profile "${name}"? It will be moved to the Archives section.`);
    if (!confirmed) return;
    await archiveDeskProfile(id);
  }
  closeEditDeskProfileModal();
}

async function loadDeskArchivedProfiles() {
  try {
    const res = await fetch('/api/desk/profiles?archived=true');
    deskArchivedProfiles = await res.json();
  } catch { deskArchivedProfiles = []; }
}

function toggleDeskArchivePanel() {
  deskArchivePanelOpen = !deskArchivePanelOpen;
  const btn = document.getElementById('deskArchiveToggleBtn');
  
  if (deskArchivePanelOpen) {
    loadDeskArchivedProfiles().then(() => {
      // Auto-switch to first archived tab if available, else null
      if (deskArchivedProfiles.length > 0) {
        switchDeskProfile(deskArchivedProfiles[0]._id);
      } else {
        switchDeskProfile(null);
      }
      renderDeskTabBar();
    });
    if (btn) {
      btn.classList.add('active');
      btn.style.background = 'var(--accent)';
      btn.style.color = '#000';
      btn.style.borderColor = 'var(--accent)';
    }
  } else {
    deskArchivedProfiles = [];
    // Auto-switch to first active tab if available, else null
    if (deskProfiles.length > 0) {
      switchDeskProfile(deskProfiles[0]._id);
    } else {
      switchDeskProfile(null);
    }
    renderDeskTabBar();
    if (btn) {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-muted)';
      btn.style.borderColor = 'var(--border)';
    }
  }
}

function switchDeskProfile(profileId) {
  deskCurrentProfile = profileId;
  const listToRender = deskArchivePanelOpen ? deskArchivedProfiles : deskProfiles;
  
  // Update active tab
  document.querySelectorAll('#deskTabBar .desk-tab').forEach(t => {
    const id = t.dataset.id;
    const p = listToRender.find(x => x._id === id);
    if (!p) return;
    if (p._id === profileId) {
      t.classList.add('active');
      const bg = p.color || '#a78bfa';
      t.style.backgroundColor = bg;
      t.style.color = getDeskContrast(bg);
      t.style.borderBottomColor = 'transparent';
      
      const dot = t.querySelector('div');
      if (dot) {
        dot.style.opacity = '1';
        const contrastColor = getDeskContrast(bg);
        dot.style.backgroundColor = contrastColor === '#000000' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
      }
      
      // Removed archived styling from active tab if we are in archives view
    } else {
      t.classList.remove('active');
      t.style.backgroundColor = 'transparent';
      t.style.color = 'var(--text-muted)';
      t.style.borderBottomColor = 'transparent';
      
      const dot = t.querySelector('div');
      if (dot) {
        dot.style.backgroundColor = p.color || '#a78bfa';
        dot.style.opacity = '1';
      }
      
      // Removed re-adding archived styling to non-active tabs in archives view
    }
  });

  closeDeskEntryEditor();
  loadDeskData();
}

async function loadDeskData() {
  await Promise.all([loadDeskTasks(), loadDeskEntries()]);
  
  const listToRender = deskArchivePanelOpen ? deskArchivedProfiles : deskProfiles;
  const profile = listToRender.find(p => p._id === deskCurrentProfile);
  if (profile) {
    const hasData = deskTasks.length > 0 || deskEntries.length > 0;
    if (profile.hasData !== hasData) {
      profile.hasData = hasData;
      renderDeskTabBar();
    }
  }

  updateDeskProfileStats();
}

// ─── Profile Stats ───
function updateDeskProfileStats() {
  const el = document.getElementById('deskProfileStats');
  if (!el) return;
  const listToRender = deskArchivePanelOpen ? deskArchivedProfiles : deskProfiles;
  const profile = listToRender.find(p => p._id === deskCurrentProfile);
  const pName = profile ? profile.name : '';
  const total = deskTasks.length;
  const done = deskTasks.filter(t => t.completed).length;
  const pending = total - done;
  const entryCount = deskEntries.length;

  // Find next timed task
  let nextTask = '';
  const timedPending = deskTasks.filter(t => !t.completed && t.time).sort((a,b) => a.time.localeCompare(b.time));
  if (timedPending.length > 0) nextTask = timedPending[0].time;

  el.innerHTML = `
    <div class="desk-stat-chip"><strong>${pName}</strong></div>
    <div class="desk-stat-chip">Tasks: <strong>${total}</strong></div>
    <div class="desk-stat-chip" style="color:var(--success)">Done: <strong>${done}</strong></div>
    <div class="desk-stat-chip" style="color:var(--accent)">Pending: <strong>${pending}</strong></div>
    <div class="desk-stat-chip" style="color:var(--info)">Journal: <strong>${entryCount}</strong></div>
    ${nextTask ? `<div class="desk-stat-chip">Next: <strong>${nextTask}</strong></div>` : ''}
  `;
}

// ─── Tasks ───
async function loadDeskTasks() {
  try {
    const res = await fetch(`/api/desk/goals?profileId=${deskCurrentProfile}`);
    deskTasks = await res.json();
  } catch { deskTasks = []; }
  renderDeskTasks();
}

function renderDeskTasks() {
  const body = document.getElementById('deskTasksBody');
  if (!body) return;

  const pending = deskTasks.filter(t => !t.completed);
  const done = deskTasks.filter(t => t.completed);

  let html = '';
  if (pending.length === 0 && done.length === 0) {
    html = '<div class="desk-empty"><svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg><div>No tasks yet</div></div>';
  } else {
    if (pending.length > 0) {
      html += '<div style="padding:4px 0 2px;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Pending</div>';
      html += '<div class="desk-task-group" data-group="pending">';
      pending.forEach(t => { html += renderDeskTaskItem(t); });
      html += '</div>';
    }
    if (done.length > 0) {
      html += '<div style="padding:8px 0 2px;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;opacity:.6">Done</div>';
      html += '<div class="desk-task-group" data-group="done">';
      done.forEach(t => { html += renderDeskTaskItem(t); });
      html += '</div>';
    }
  }
  body.innerHTML = html;

  // Set up drag within each group separately
  body.querySelectorAll('.desk-task-group').forEach(group => {
    const taskItems = group.querySelectorAll('.desk-task-item');
    taskItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        item.dataset.sourceGroup = group.dataset.group;
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        delete item.dataset.sourceGroup;
      });
    });

    group.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = body.querySelector('.desk-task-item.dragging');
      if (!dragging) return;
      // Only allow reorder within the same group
      if (dragging.dataset.sourceGroup !== group.dataset.group) return;
      const afterElement = getDragAfterElementDeskTask(group, e.clientY);
      if (afterElement == null) {
        group.appendChild(dragging);
      } else {
        group.insertBefore(dragging, afterElement);
      }
    });

    group.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dragging = body.querySelector('.desk-task-item.dragging');
      if (!dragging || dragging.dataset.sourceGroup !== group.dataset.group) return;
      await handleDeskTaskReorder(body);
    });
  });
}

function renderDeskTaskItem(t) {
  return `
    <div class="desk-task-item ${t.completed ? 'completed' : ''}" draggable="true" data-id="${t._id}">
      <label class="task-checkbox">
        <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleDeskTask('${t._id}')">
        <span class="checkmark"></span>
      </label>
      <span class="desk-task-text" data-tasktext="${encodeURIComponent(t.text)}" ondblclick="startEditDeskTask(this, '${t._id}')">${t.text}</span>
      <div class="desk-task-actions">
        <button class="task-edit-btn" onclick="startEditDeskTask(this.closest('.desk-task-item').querySelector('.desk-task-text'), '${t._id}')" title="Edit"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
        <button class="desk-delete-btn" onclick="deleteDeskTask('${t._id}', '${encodeURIComponent(t.text)}')" title="Delete"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>
    </div>`;
}

function getDragAfterElementDeskTask(container, y) {
  const draggableElements = [...container.querySelectorAll('.desk-task-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function handleDeskTaskReorder(container) {
  const orderedTaskIds = [...container.querySelectorAll('.desk-task-item')].map(item => item.dataset.id);
  if (orderedTaskIds.length === 0) return;

  const indexMap = new Map(orderedTaskIds.map((id, idx) => [id, idx]));
  deskTasks.sort((a, b) => {
    const ai = indexMap.has(a._id) ? indexMap.get(a._id) : Number.MAX_SAFE_INTEGER;
    const bi = indexMap.has(b._id) ? indexMap.get(b._id) : Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  const updates = deskTasks.map((task, idx) => ({ id: task._id, order: idx }));

  try {
    await fetch('/api/desk/goals/action/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
  } catch (err) {
    console.error('Failed to reorder desk tasks', err);
  }
}

function startEditDeskTask(span, id) {
  if (span.querySelector('input.task-edit-input')) return;
  
  const taskItem = span.closest('.desk-task-item');
  taskItem.classList.add('editing');
  taskItem.draggable = false;
  
  const rawText = span.dataset.tasktext ? decodeURIComponent(span.dataset.tasktext) : span.textContent.trim();

  span.innerHTML = `
    <div class="desk-task-edit-row" style="display: flex; gap: 6px; width: 100%; margin-top: 4px; align-items: center;">
      <input class="task-edit-input" value="${rawText}" style="flex:1; padding:4px 8px; border-radius:4px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-primary); font-size:.85rem;" onkeydown="if(event.key==='Enter')finishEditDeskTask(this.closest('.desk-task-edit-row'),'${id}');if(event.key==='Escape')cancelEditDeskTask()">
      <button class="btn btn-primary btn-sm" onclick="finishEditDeskTask(this.closest('.desk-task-edit-row'), '${id}')" style="padding:4px 8px; font-size:.8rem;">Save</button>
      <button class="btn btn-secondary btn-sm" onclick="cancelEditDeskTask()" style="padding:4px 8px; font-size:.8rem; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
    </div>
  `;
  span.querySelector('input').focus();
}

async function finishEditDeskTask(editRow, id) {
  const textInput = editRow.querySelector('.task-edit-input');
  const text = textInput ? textInput.value.trim() : '';
  if (!text) { cancelEditDeskTask(); return; }

  try {
    await fetch(`/api/goals/${id}/update`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, time: null, endTime: null })
    });
  } catch(e) {}
  
  await loadDeskData();
  if (typeof loadGoals === 'function') loadGoals();
}

function cancelEditDeskTask() {
  loadDeskData();
}

async function addDeskTask() {
  const input = document.getElementById('deskTaskInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  try {
    await fetch('/api/desk/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, date: today, profileId: deskCurrentProfile })
    });
    input.value = '';
    await loadDeskTasks();
    updateDeskProfileStats();
    if (typeof loadGoals === 'function') loadGoals();
  } catch (e) { console.error('Add desk task failed:', e); }
}

async function toggleDeskTask(id) {
  try {
    await fetch(`/api/desk/goals/${id}`, { method: 'PUT' });
    await loadDeskTasks();
    updateDeskProfileStats();
    if (typeof loadGoals === 'function') loadGoals();
  } catch (e) { console.error('Toggle desk task failed:', e); }
}

async function deleteDeskTask(id, encodedName) {
  const name = encodedName ? decodeURIComponent(encodedName) : 'this task';
  const confirmed = await deskConfirm(`Are you sure you want to delete the task "${name}"?`);
  if (!confirmed) return;
  
  try {
    await fetch(`/api/desk/goals/${id}`, { method: 'DELETE' });
    await loadDeskTasks();
    updateDeskProfileStats();
    if (typeof loadGoals === 'function') loadGoals();
  } catch (e) { console.error('Delete desk task failed:', e); }
}

// ─── Journal Entries ───
async function loadDeskEntries() {
  try {
    const res = await fetch(`/api/desk/entries?profileId=${deskCurrentProfile}`);
    const raw = await res.json();
    deskEntries = (raw || []).map(e => ({
      ...e,
      content: normalizeDeskHighlightTextColorsHtml(e.content || '')
    }));
  } catch { deskEntries = []; }
  renderDeskEntries();
}

function renderDeskEntries() {
  const list = document.getElementById('deskJournalList');
  if (!list) return;

  if (deskEntries.length === 0) {
    list.innerHTML = '<div class="desk-empty"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><div>No journal entries yet</div></div>';
    return;
  }

  // Remove old event listeners by cloning
  const newList = list.cloneNode(false);
  list.parentNode.replaceChild(newList, list);
  const listElement = document.getElementById('deskJournalList');

  deskEntries.forEach((e, index) => {
    const effectivePageColor = e.pageColor || DESK_DEFAULT_PAGE_COLOR;
    const pageTextColor = getDeskContrast(effectivePageColor) === '#000000' ? '#111111' : '#f5f5f5';
    const pageColorStyle = `background-color: ${effectivePageColor}; color: ${pageTextColor}; padding: 12px; border-radius: 10px;`;
    const accentColor = deskAccentFromPage(effectivePageColor);
    const cardStyle = `style="--entry-accent: ${accentColor};"`;
    const card = document.createElement('div');
    card.className = 'desk-entry-card collapsed';
    card.draggable = true;
    card.dataset.id = e._id;
    card.dataset.order = index;
    
    const normalizedContent = normalizeDeskHighlightTextColorsHtml(e.content || '');
    card.innerHTML = `
      <div class="desk-entry-header" onclick="toggleDeskEntryCard(this.parentElement)" ${cardStyle}>
        <div class="desk-entry-title">
          <svg class="desk-entry-chevron" viewBox="0 0 24 24" width="12" height="12"><path d="M9 18l6-6-6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${e.title || 'Untitled'}
        </div>
        <div class="desk-entry-actions">
          <button onclick="event.stopPropagation();editDeskEntry('${e._id}')" title="Edit"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button onclick="event.stopPropagation();deleteDeskEntry('${e._id}', '${encodeURIComponent(e.title || 'Untitled')}')" title="Delete" style="color:var(--danger); display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
      </div>
      <div class="desk-entry-body" style="${pageColorStyle}">${normalizedContent}</div>
    `;
    
    card.addEventListener('dragstart', (ev) => {
      card.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
    });
    
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
    
    listElement.appendChild(card);
  });
  
  listElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = listElement.querySelector('.dragging');
    if (!dragging) return;
    const afterElement = getDragAfterElementDesk(listElement, e.clientY);
    if (afterElement == null) {
      listElement.appendChild(dragging);
    } else {
      listElement.insertBefore(dragging, afterElement);
    }
  });
  
  listElement.addEventListener('drop', (e) => {
    e.preventDefault();
    handleDeskEntryReorder(listElement);
  });
}

function toggleDeskEntryCard(card) {
  if (!card) return;
  const wasCollapsed = card.classList.contains('collapsed');
  card.classList.toggle('collapsed');
  card.draggable = card.classList.contains('collapsed');

  // When opening a long entry, bring its header into view inside the journal list.
  if (wasCollapsed) {
    const container = document.getElementById('deskJournalList');
    if (!container) return;
    requestAnimationFrame(() => {
      const top = card.offsetTop - 8;
      container.scrollTo({
        top: Math.max(0, top),
        behavior: 'smooth'
      });
    });
  }
}

function getDragAfterElementDesk(container, y) {
  const draggableElements = [...container.querySelectorAll('.desk-entry-card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function handleDeskEntryReorder(container) {
  const entryItems = [...container.querySelectorAll('.desk-entry-card')];
  const updates = entryItems.map((item, index) => ({ id: item.dataset.id, order: index }));
  
  try {
    await fetch('/api/desk/entries/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
  } catch (err) {
    console.error('Failed to reorder desk entries', err);
  }
}

function openDeskEntryEditor(editId) {
  const editor = document.getElementById('deskEntryEditor');
  const list = document.getElementById('deskJournalList');
  if (!editor || !list) return;

  list.classList.add('hidden');
  editor.classList.add('active');

  const titleInput = document.getElementById('deskEntryTitleInput');
  const body = document.getElementById('deskEntryBody');

  if (editId) {
    const entry = deskEntries.find(e => e._id === editId);
    if (entry) {
      titleInput.value = entry.title || '';
      body.innerHTML = normalizeDeskHighlightTextColorsHtml(entry.content || '');
      deskCurrentPageColor = entry.pageColor || DESK_DEFAULT_PAGE_COLOR;
      body.style.backgroundColor = deskCurrentPageColor;
      body.style.color = getDeskContrast(deskCurrentPageColor) === '#000000' ? '#111111' : '#f5f5f5';
      deskEditingEntryId = editId;
    }
  } else {
    titleInput.value = '';
    body.innerHTML = '';
    deskCurrentPageColor = DESK_DEFAULT_PAGE_COLOR;
    body.style.backgroundColor = '';
    body.style.backgroundColor = deskCurrentPageColor;
    body.style.color = getDeskContrast(deskCurrentPageColor) === '#000000' ? '#111111' : '#f5f5f5';
    deskEditingEntryId = null;
  }
  body.focus();
}

function closeDeskEntryEditor() {
  const editor = document.getElementById('deskEntryEditor');
  const list = document.getElementById('deskJournalList');
  if (editor) editor.classList.remove('active');
  if (list) list.classList.remove('hidden');
  deskEditingEntryId = null;
}

async function saveDeskEntry() {
  const title = (document.getElementById('deskEntryTitleInput')?.value || '').trim();
  const bodyEl = document.getElementById('deskEntryBody');
  applyDeskHighlightTextColors(bodyEl);
  const content = bodyEl?.innerHTML || '';
  const pageColor = deskCurrentPageColor || DESK_DEFAULT_PAGE_COLOR;
  if (!content.trim() && !title) return;

  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const payload = { title, content, date: today, profileId: deskCurrentProfile, pageColor };

  try {
    if (deskEditingEntryId) {
      await fetch(`/api/desk/entries/${deskEditingEntryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch('/api/desk/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    closeDeskEntryEditor();
    await loadDeskEntries();
    updateDeskProfileStats();
  } catch (e) { console.error('Save desk entry failed:', e); }
}

function editDeskEntry(id) {
  openDeskEntryEditor(id);
}

async function deleteDeskEntry(id, encodedName) {
  const name = encodedName ? decodeURIComponent(encodedName) : 'this journal entry';
  const confirmed = await deskConfirm(`Are you sure you want to delete the journal entry "${name}"?`);
  if (!confirmed) return;

  try {
    await fetch(`/api/desk/entries/${id}`, { method: 'DELETE' });
    await loadDeskEntries();
    updateDeskProfileStats();
  } catch (e) { console.error('Delete desk entry failed:', e); }
}

// ─── Desk Editor Formatting ───
function execDeskFormat(cmd) {
  document.getElementById('deskEntryBody')?.focus();
  document.execCommand(cmd, false, null);
}

function execDeskHeading(tag) {
  if (!tag) {
    document.execCommand('formatBlock', false, 'P');
  } else {
    document.execCommand('formatBlock', false, tag);
  }
  const sel = document.getElementById('deskHeadingSelect');
  if (sel) sel.value = '';
}

// ─── Image Viewer ───
let ivZoomLevel = 1;
let ivPanX = 0;
let ivPanY = 0;
let ivRotation = 0;
let isDraggingIv = false;
let startDragX = 0;
let startDragY = 0;
let startPanX = 0;
let startPanY = 0;

function openImageViewer(src) {
  const overlay = document.getElementById('imageViewerOverlay');
  const img = document.getElementById('imageViewerImg');
  if (!overlay || !img) return;
  img.src = src;
  ivZoomLevel = 1;
  ivPanX = 0;
  ivPanY = 0;
  ivRotation = 0;
  img.style.transform = '';
  overlay.classList.add('active');
}

function closeImageViewer(e, force) {
  if (force || e.target.id === 'imageViewerOverlay') {
    document.getElementById('imageViewerOverlay')?.classList.remove('active');
  }
}

function ivZoom(delta) {
  ivZoomLevel = Math.max(0.2, Math.min(5, ivZoomLevel + delta));
  applyIvTransform();
}

function ivZoomWheel(delta, mouseX, mouseY) {
  const oldScale = ivZoomLevel;
  ivZoomLevel = Math.max(0.2, Math.min(5, ivZoomLevel + delta));
  const ratio = ivZoomLevel / oldScale;

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const dx = mouseX - cx;
  const dy = mouseY - cy;
  
  ivPanX -= (dx - ivPanX) * (ratio - 1);
  ivPanY -= (dy - ivPanY) * (ratio - 1);

  applyIvTransform();
}

function ivFit() {
  ivZoomLevel = 1;
  ivPanX = 0;
  ivPanY = 0;
  ivRotation = 0;
  applyIvTransform();
}

function ivRotate(deg) {
  ivRotation += deg;
  applyIvTransform();
}

function applyIvTransform() {
  const img = document.getElementById('imageViewerImg');
  if (img) img.style.transform = `translate(${ivPanX}px, ${ivPanY}px) scale(${ivZoomLevel}) rotate(${ivRotation}deg)`;
}

function showDeskAlert(message, title = 'Notification') {
  let modal = document.getElementById('deskAlertModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'deskAlertModal';
    modal.style.zIndex = '3000'; // above image viewer
    modal.innerHTML = `
      <div class="modal custom-confirm-modal" style="max-width:320px; text-align:center;">
        <h2 style="font-size: 1.1rem; margin-bottom: 12px;" id="deskAlertTitle"></h2>
        <p id="deskAlertMessage" style="font-size: .9rem; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5;"></p>
        <div class="form-actions" style="justify-content:center;">
          <button class="btn btn-primary" onclick="document.getElementById('deskAlertModal').classList.remove('active')" style="min-width:100px;">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('deskAlertTitle').textContent = title;
  document.getElementById('deskAlertMessage').textContent = message;
  modal.classList.add('active');
}

async function ivCopy() {
  const img = document.getElementById('imageViewerImg');
  if (!img) return;
  try {
    const resp = await fetch(img.src);
    const blob = await resp.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showDeskAlert('Image copied to clipboard!', 'Success');
  } catch {
    // Fallback: draw to canvas
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob(async (blob) => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showDeskAlert('Image copied to clipboard!', 'Success');
      });
    } catch { showDeskAlert('Copy failed — try right-click → Copy Image', 'Error'); }
  }
}

function ivDownload() {
  const img = document.getElementById('imageViewerImg');
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = 'image_' + Date.now() + '.png';
  a.click();
}

// ─── Scroll wheel zoom on image viewer ───
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('imageViewerOverlay');
  if (overlay) {
    overlay.addEventListener('wheel', (e) => {
      if (!overlay.classList.contains('active')) return;
      e.preventDefault();
      ivZoomWheel(e.deltaY < 0 ? 0.15 : -0.15, e.clientX, e.clientY);
    }, { passive: false });

    const img = document.getElementById('imageViewerImg');
    if (img) {
      img.addEventListener('mousedown', (e) => {
        isDraggingIv = true;
        startDragX = e.clientX;
        startDragY = e.clientY;
        startPanX = ivPanX;
        startPanY = ivPanY;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!isDraggingIv) return;
        ivPanX = startPanX + (e.clientX - startDragX);
        ivPanY = startPanY + (e.clientY - startDragY);
        applyIvTransform();
      });
      window.addEventListener('mouseup', () => {
        isDraggingIv = false;
      });
    }
  }

  // Image click handlers on entry cards
  document.addEventListener('click', (e) => {
    const img = e.target.closest('.entry-card-body img, .desk-entry-body img');
    if (img) {
      e.preventDefault();
      openImageViewer(img.src);
    }
  });



  // Populate color grids
  const fcg = document.getElementById('deskFontColorGrid');
  const hlg = document.getElementById('deskHighlightGrid');
  const dpcg = document.getElementById('deskPageColorGrid');
  const COLOR_SWATCHES = ['#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#78716c','#ffffff','#000000'];
  const HIGHLIGHT_SWATCHES = ['#fde047','#bef264','#6ee7b7','#67e8f9','#a5b4fc','#c4b5fd','#f0abfc','#fda4af','#fed7aa','#fef08a','#d9f99d','#bbf7d0'];
  const PAGE_COLOR_SWATCHES = ['#0b0b0f', '#161a22', '#1d2433', '#1a2b26', '#2a1f1f', '#2c233a', '#f4f1ea', '#efe7dc', '#e7eef6', '#e7f2ec', '#f3e8f0', '#f6ecd9'];
  if (fcg && fcg.children.length === 0) fcg.innerHTML = COLOR_SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" onmousedown="event.preventDefault(); execDeskFontColor('${c}'); closeDeskColorPickers()"></div>`).join('');
  if (hlg && hlg.children.length === 0) hlg.innerHTML = HIGHLIGHT_SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" onmousedown="event.preventDefault(); execDeskHighlight('${c}'); closeDeskColorPickers()"></div>`).join('');
  if (dpcg && dpcg.children.length === 0) dpcg.innerHTML = PAGE_COLOR_SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" onmousedown="event.preventDefault(); execDeskPageColor('${c}'); closeDeskColorPickers()"></div>`).join('');

  // ─── Paste handler for clipboard images in Desk ───
  document.querySelectorAll('#deskEntryBody').forEach(body => {
    body.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          const fd = new FormData();
          fd.append('file', blob, `paste-${Date.now()}.png`);
          try {
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            const removeBtn = '<button class="entry-media-remove" onclick="if(confirm(\'Are you sure you want to remove this media?\')) this.parentElement.remove()" title="Remove">&times;</button>';
            document.execCommand('insertHTML', false, `<div class="entry-media resizable" contenteditable="false">${removeBtn}<img src="${data.url}" alt="pasted image" loading="lazy"><span class="media-caption">${data.name}</span></div><p><br></p>`);
          } catch (err) { console.error('Paste upload failed:', err); }
          break;
        }
      }
    });

    body.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const sel = window.getSelection();
        if (sel.anchorNode) {
          const block = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
          const prev = block?.previousElementSibling;
          if (e.key === 'Backspace' && prev && prev.getAttribute('contenteditable') === 'false') {
            const range = sel.getRangeAt(0);
            if (range.startOffset === 0) {
              e.preventDefault();
            }
          }
        }
      }
      
      // Stop highlight extending — handled by beforeinput below
    });

    body.addEventListener('beforeinput', (e) => {
      if (e.inputType !== 'insertText' && e.inputType !== 'insertParagraph') return;
      const sel = window.getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const editorRoot = body;

      // Find the outermost highlighted ancestor (not the editor root)
      let hlAncestor = null;
      let el = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      while (el && el !== editorRoot) {
        if (el.style && (el.style.backgroundColor || el.style.background)) {
          hlAncestor = el;
        }
        el = el.parentElement;
      }

      if (!hlAncestor) return;

      // Check if cursor is at the very end of the highlight
      const testRange = document.createRange();
      try {
        testRange.setStart(range.startContainer, range.startOffset);
        testRange.setEndAfter(hlAncestor.lastChild || hlAncestor);
      } catch { return; }
      if (testRange.toString().length > 0) return;

      e.preventDefault();

      if (e.inputType === 'insertParagraph') {
        const br = document.createElement('br');
        hlAncestor.parentNode.insertBefore(br, hlAncestor.nextSibling);
        const zws = document.createTextNode('\u200B');
        hlAncestor.parentNode.insertBefore(zws, br.nextSibling);
        const newRange = document.createRange();
        newRange.setStart(zws, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        const text = e.data || '';
        const textNode = document.createTextNode(text);
        hlAncestor.parentNode.insertBefore(textNode, hlAncestor.nextSibling);
        const newRange = document.createRange();
        newRange.setStart(textNode, text.length);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    });

    // Merge adjacent same-color highlights on input
    body.addEventListener('input', () => {
      deskMergeAdjacentHighlights(body);
    });
  });
});

// ─── Extra Desk Toolbar Actions ───

function toggleDeskColorPicker(type) {
  const panels = { fontColor: 'deskFontColorPanel', highlight: 'deskHighlightPanel', pageColor: 'deskPageColorPanel' };
  Object.keys(panels).forEach(k => {
    const p = document.getElementById(panels[k]);
    if (p) p.classList.toggle('active', k === type && !p.classList.contains('active'));
  });
}

function closeDeskColorPickers() {
  document.querySelectorAll('#deskEntryToolbar .color-picker-panel').forEach(p => p.classList.remove('active'));
}

function execDeskFontColor(color) {
  if (!color) { document.execCommand('removeFormat', false, null); return; }
  const sel = window.getSelection();
  const editor = document.getElementById('deskEntryBody');
  // If no text is selected (collapsed cursor), insert a colored zero-width space
  // so subsequent typing inherits the color
  if (sel && sel.isCollapsed && editor && editor.contains(sel.anchorNode)) {
    const span = document.createElement('span');
    span.style.color = color;
    span.textContent = '\u200B'; // zero-width space
    const range = sel.getRangeAt(0);
    range.insertNode(span);
    // Move cursor inside the span, after the zero-width space
    range.setStart(span.firstChild, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    document.execCommand('foreColor', false, color);
  }
  // Refresh to ensure custom colors are preserved
  setTimeout(() => {
    refreshDeskHighlightColors(document.getElementById('deskEntryBody'));
  }, 10);
}

function execDeskHighlight(color) {
  if (!color) { document.execCommand('removeFormat', false, null); return; }
  if (!document.execCommand('hiliteColor', false, color)) {
    document.execCommand('backColor', false, color);
  }
  const editor = document.getElementById('deskEntryBody');
  setTimeout(() => {
    applyDeskHighlightTextColors(editor);
    deskMergeAdjacentHighlights(editor);
    deskMoveCursorOutOfHighlight(editor);
  }, 10);
}

// Move cursor/caret out of any highlight span to prevent extending
function deskMoveCursorOutOfHighlight(root) {
  if (!root) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  if (!sel.isCollapsed) sel.collapseToEnd();
  const range = sel.getRangeAt(0);
  let hlAncestor = null;
  let el = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
  while (el && el !== root) {
    if (el.style && (el.style.backgroundColor || el.style.background)) {
      hlAncestor = el;
    }
    el = el.parentElement;
  }
  if (!hlAncestor) return;
  const testRange = document.createRange();
  try {
    testRange.setStart(range.startContainer, range.startOffset);
    testRange.setEndAfter(hlAncestor.lastChild || hlAncestor);
  } catch { return; }
  if (testRange.toString().length > 0) return;
  const zws = document.createTextNode('\u200B');
  hlAncestor.parentNode.insertBefore(zws, hlAncestor.nextSibling);
  const newRange = document.createRange();
  newRange.setStart(zws, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

// ─── Desk Highlight Management System ───

const _deskColorCache = {};
function deskNormColor(c) {
  if (!c) return '';
  if (_deskColorCache[c]) return _deskColorCache[c];
  let norm = c.trim().toLowerCase();
  if (norm.startsWith('#')) {
    const div = document.createElement('div');
    div.style.color = norm;
    document.body.appendChild(div);
    norm = getComputedStyle(div).color;
    div.remove();
  }
  const m = norm.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) norm = `rgb(${m[1]},${m[2]},${m[3]})`;
  _deskColorCache[c] = norm;
  return norm;
}

function deskGetBg(el) {
  if (!el || !el.style) return '';
  return el.style.backgroundColor || el.style.background || '';
}

function _deskIsWhitespaceNode(node) {
  if (node.nodeType === 3) return node.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '') === '';
  if (node.nodeType === 1) return node.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '') === '';
  return false;
}

function deskIsFormattingTag(el) {
  return el && /^(B|I|U|EM|STRONG|S|STRIKE|SUB|SUP|SPAN|FONT)$/i.test(el.tagName);
}

function _deskCleanZWS(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const toRemove = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/^[\u200B\u200C\u200D\uFEFF]+$/.test(node.textContent)) {
      toRemove.push(node);
    } else if (node.textContent.includes('\u200B')) {
      node.textContent = node.textContent.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    }
  }
  toRemove.forEach(n => n.remove());
  root.normalize();
}

function deskFlattenNestedHighlights(root) {
  if (!root) return;
  let changed = true, passes = 0;
  while (changed && passes < 30) {
    changed = false; passes++;
    const els = root.querySelectorAll('span[style], font[style]');
    for (const el of els) {
      if (!el.parentNode || !root.contains(el)) continue;
      const bg = deskGetBg(el);
      if (!bg) continue;
      const norm = deskNormColor(bg);
      const descs = [...el.querySelectorAll('span[style], font[style]')];
      for (const child of descs) {
        if (!child.parentNode || !root.contains(child)) continue;
        const childBg = deskGetBg(child);
        if (childBg && deskNormColor(childBg) === norm) {
          const frag = document.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.parentNode.replaceChild(frag, child);
          changed = true;
        }
      }
      el.normalize();
    }
  }
}

function deskMergeAdjacentHighlights(root) {
  if (!root) return;
  _deskCleanZWS(root);
  deskFlattenNestedHighlights(root);
  _deskMergeLevelRecursive(root, root);
}

function _deskMergeLevelRecursive(container, root) {
  const childElements = [...container.querySelectorAll(':scope > *')];
  for (const child of childElements) {
    if (child.nodeType === 1 && root.contains(child)) {
      _deskMergeLevelRecursive(child, root);
    }
  }
  _deskMergeSiblingsAtLevel(container, root);
}

function _deskMergeSiblingsAtLevel(container, root) {
  let changed = true, passes = 0;
  while (changed && passes < 30) {
    changed = false; passes++;
    const children = [...container.childNodes];

    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.nodeType !== 1 || !root.contains(node)) continue;
      const bg = deskGetBg(node);
      if (!bg) continue;
      const norm = deskNormColor(bg);

      let j = i + 1;
      let runEnd = i;
      let foundMerge = false;

      while (j < children.length) {
        const sib = children[j];

        if (_deskIsWhitespaceNode(sib)) {
          j++;
          continue;
        }

        if (sib.nodeType === 1 && deskGetBg(sib) && deskNormColor(deskGetBg(sib)) === norm) {
          runEnd = j;
          foundMerge = true;
          j++;
          continue;
        }

        if (sib.nodeType === 1 && deskIsFormattingTag(sib) && !deskGetBg(sib)) {
          const innerBg = _deskGetEffectiveSoleBg(sib);
          if (innerBg && deskNormColor(innerBg) === norm) {
            runEnd = j;
            foundMerge = true;
            j++;
            continue;
          }
        }

        break;
      }

      if (!foundMerge) continue;

      const target = children[i];
      for (let k = i + 1; k <= runEnd; k++) {
        const sib = children[k];
        if (!sib || !sib.parentNode) continue;

        if (sib.nodeType === 3) {
          if (sib.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '') === '') {
            const spaceText = document.createTextNode(' ');
            target.appendChild(spaceText);
            sib.remove();
          } else {
            target.appendChild(sib);
          }
        } else if (sib.nodeType === 1) {
          const sibBg = deskGetBg(sib);
          if (sibBg && deskNormColor(sibBg) === norm) {
            if (_deskIsWhitespaceNode(sib)) {
              const sp = document.createTextNode(' ');
              target.appendChild(sp);
              sib.remove();
            } else if (sib.tagName === 'SPAN' || sib.tagName === 'FONT') {
              while (sib.firstChild) target.appendChild(sib.firstChild);
              sib.remove();
            } else {
              sib.style.backgroundColor = '';
              sib.style.background = '';
              sib.querySelectorAll('*').forEach(c => {
                if (c.style && deskNormColor(deskGetBg(c)) === norm) {
                  c.style.backgroundColor = '';
                  c.style.background = '';
                }
              });
              target.appendChild(sib);
            }
          } else if (!sibBg && deskIsFormattingTag(sib)) {
            sib.querySelectorAll('span[style], font[style]').forEach(inner => {
              if (deskNormColor(deskGetBg(inner)) === norm) {
                inner.style.backgroundColor = '';
                inner.style.background = '';
              }
            });
            target.appendChild(sib);
          } else if (_deskIsWhitespaceNode(sib)) {
            const sp = document.createTextNode(' ');
            target.appendChild(sp);
            sib.remove();
          } else {
            target.appendChild(sib);
          }
        }
      }
      target.normalize();
      changed = true;
      break;
    }
  }
}

function _deskGetEffectiveSoleBg(el) {
  const hlChildren = el.querySelectorAll('span[style], font[style]');
  if (hlChildren.length === 0) return '';
  const textContent = el.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '');
  let highlightedText = '';
  let commonBg = null;
  for (const child of hlChildren) {
    const bg = deskGetBg(child);
    if (!bg) continue;
    const norm = deskNormColor(bg);
    if (commonBg === null) commonBg = norm;
    else if (norm !== commonBg) return '';
    highlightedText += child.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '');
  }
  if (textContent.length > 0 && textContent !== highlightedText) return '';
  return commonBg || '';
}

function execDeskPageColor(color) {
  deskCurrentPageColor = color || DESK_DEFAULT_PAGE_COLOR;
  const editor = document.getElementById('deskEntryBody');
  if (editor) {
    editor.style.backgroundColor = deskCurrentPageColor;
    editor.style.color = getDeskContrast(deskCurrentPageColor) === '#000000' ? '#111111' : '#f5f5f5';
  }
}

function isDarkDeskCssColor(color) {
  if (!color) return false;
  if (color.startsWith('#')) return getDeskContrast(color) !== '#000000';
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return false;
  const r = parseInt(rgb[1], 10);
  const g = parseInt(rgb[2], 10);
  const b = parseInt(rgb[3], 10);
  return ((r * 299) + (g * 587) + (b * 114)) / 1000 < 140;
}

function applyDeskHighlightTextColors(root) {
  if (!root) return;
  const candidates = root.querySelectorAll('span, font, mark, b, i, u, em, strong, div');
  candidates.forEach(el => {
    const inlineBg = (el.style && (el.style.backgroundColor || el.style.background)) || '';
    if (!inlineBg) return;
    const bgTrim = inlineBg.trim().toLowerCase();
    if (!bgTrim || bgTrim === 'transparent' || bgTrim === 'initial' || bgTrim === 'inherit' || bgTrim === 'unset') return;
    if (/^\s*none\b/i.test(inlineBg)) return;
    
    // Only apply auto-color if no explicit color is already set
    if (!el.style.color || el.style.color === '' || el.style.color === 'inherit') {
      el.style.color = isDarkDeskCssColor(inlineBg) ? '#f8fafc' : '#111111';
    }
  });
}

function normalizeDeskHighlightTextColorsHtml(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';
  applyDeskHighlightTextColors(wrapper);
  return wrapper.innerHTML;
}

function refreshDeskHighlightColors(root) {
  if (!root) return;
  const candidates = root.querySelectorAll('span[style*="background"], font[style*="background"], mark, b[style*="background"], i[style*="background"], u[style*="background"], em[style*="background"], strong[style*="background"], div[style*="background"]');
  candidates.forEach(el => {
    const inlineBg = (el.style && (el.style.backgroundColor || el.style.background)) || '';
    if (!inlineBg) return;
    const bgTrim = inlineBg.trim().toLowerCase();
    if (!bgTrim || bgTrim === 'transparent' || bgTrim === 'initial' || bgTrim === 'inherit' || bgTrim === 'unset') return;
    if (/^\s*none\b/i.test(inlineBg)) return;
    
    // Force update color based on current background
    if (!el.style.color || el.style.color === '' || el.style.color === 'inherit') {
      el.style.color = isDarkDeskCssColor(inlineBg) ? '#f8fafc' : '#111111';
    }
  });
}

function deskAccentFromPage(color) {
  // Derive a pleasant accent from the page color so it contrasts the header
  // background (var(--bg-input)) without looking like a flat slab.
  if (!color) return 'var(--accent)';
  if (isDarkDeskCssColor(color)) {
    return `color-mix(in srgb, ${color} 35%, #e6edf7 65%)`;
  }
  return `color-mix(in srgb, ${color} 55%, #0f172a 45%)`;
}

let deskSavedSelection = null;

function getDeskContrast(c) {
  if (c.startsWith('var')) return '#ffffff';
  const hex = c.replace('#', '');
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
  return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128) ? '#000000' : '#ffffff';
}

function getDeskLinkContrast(c) {
  if (c.startsWith('var')) return '#ffffff';
  const hex = c.replace('#', '');
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
  const lum = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  if (lum >= 180) return '#1a1a2e';
  if (lum >= 128) return '#0f172a';
  if (lum >= 60) return '#fefefe';
  return '#ffffff';
}

// ─── Desk Divider Line Insert ───
const _DESK_DIVIDER_STYLES = [
  { name: 'Solid', style: 'solid', weight: '2px' },
  { name: 'Dashed', style: 'dashed', weight: '2px' },
  { name: 'Dotted', style: 'dotted', weight: '2px' },
  { name: 'Double', style: 'double', weight: '4px' },
  { name: 'Thick', style: 'solid', weight: '4px' },
];
const _DESK_DIVIDER_COLORS = [
  '', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#78716c', '#ffffff', '#000000'
];

function _isDarkForDivider(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((r * 299) + (g * 587) + (b * 114)) / 1000 < 140;
}

let deskDividerSavedSelection = null;
function toggleDeskDividerPicker() {
  const panel = document.getElementById('deskDividerPickerPanel');
  if (!panel) return;
  const isActive = panel.classList.contains('active');
  closeDeskColorPickers();
  if (isActive) {
    panel.classList.remove('active');
    return;
  }
  const s = window.getSelection();
  deskDividerSavedSelection = s.rangeCount > 0 ? s.getRangeAt(0).cloneRange() : null;

  // Use shared init if available (dashboard page), else build inline
  if (typeof _initDividerPicker === 'function') {
    _initDividerPicker(panel, 'desk');
  } else {
    _initDeskDividerPickerInline(panel);
  }
  panel.classList.add('active');



  // Close when clicking outside the panel
  setTimeout(() => {
    function outsideClick(e) {
      if (!panel.contains(e.target) && !e.target.closest('.divider-picker-wrapper')) {
        panel.classList.remove('active');
        document.removeEventListener('mousedown', outsideClick);
      }
    }
    document.addEventListener('mousedown', outsideClick);
  }, 0);
}

function _initDeskDividerPickerInline(panel) {
  const pageBg = deskCurrentPageColor || DESK_DEFAULT_PAGE_COLOR;
  const dark = _isDarkForDivider(pageBg);
  const autoColor = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  const previewColor = dark ? '#aaa' : '#555';

  let styleHtml = '<div class="divider-picker-label">Style</div><div class="divider-style-grid">';
  _DESK_DIVIDER_STYLES.forEach((s, i) => {
    styleHtml += `<div class="divider-style-option${i === 0 ? ' selected' : ''}" data-style="${s.style}" data-weight="${s.weight}" onclick="this.closest('.divider-style-grid').querySelectorAll('.divider-style-option').forEach(o=>o.classList.remove('selected'));this.classList.add('selected')">
      <span class="divider-style-name">${s.name}</span>
      <div class="divider-style-preview" style="border-top: ${s.weight} ${s.style} ${previewColor};"></div>
    </div>`;
  });
  styleHtml += '</div>';

  let colorHtml = '<div class="divider-picker-label">Color</div><div class="divider-color-grid">';
  colorHtml += `<div class="divider-color-swatch selected" data-color="" style="background: ${autoColor}; position:relative;" onclick="this.closest('.divider-color-grid').querySelectorAll('.divider-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected')" title="Auto (contrast)"><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${dark ? '#fff' : '#000'}">A</span></div>`;
  _DESK_DIVIDER_COLORS.slice(1).forEach(c => {
    colorHtml += `<div class="divider-color-swatch" data-color="${c}" style="background:${c};" onclick="this.closest('.divider-color-grid').querySelectorAll('.divider-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected')"></div>`;
  });
  colorHtml += '</div>';

  panel.innerHTML = styleHtml + colorHtml + `<button class="divider-picker-insert" onclick="_doInsertDeskDivider()">Insert Divider</button>`;
}

function _doInsertDeskDivider() {
  const panel = document.getElementById('deskDividerPickerPanel');
  let style = 'solid', weight = '2px', color = '';
  if (panel) {
    const styleEl = panel.querySelector('.divider-style-option.selected');
    const colorEl = panel.querySelector('.divider-color-swatch.selected');
    if (styleEl) { style = styleEl.dataset.style; weight = styleEl.dataset.weight; }
    if (colorEl) color = colorEl.dataset.color;
  }

  const pageBg = deskCurrentPageColor || DESK_DEFAULT_PAGE_COLOR;
  const isDark = getDeskContrast(pageBg) !== '#000000';
  const hr = document.createElement('hr');
  const hrColor = color || (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)');
  hr.style.border = 'none';
  hr.style.borderTop = `${weight} ${style} ${hrColor}`;
  hr.style.margin = '16px 0';
  hr.style.width = '100%';
  hr.style.opacity = '1';
  hr.contentEditable = 'false';

  const editor = document.getElementById('deskEntryBody');
  if (!editor) return;

  editor.focus({ preventScroll: true });
  if (deskDividerSavedSelection) {
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(deskDividerSavedSelection);
  }

  const sel = window.getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.collapse(false);

    // Find the nearest block-level ancestor or create a split point
    let currentBlock = range.startContainer;
    if (currentBlock.nodeType === 3) currentBlock = currentBlock.parentElement;
    while (currentBlock && currentBlock !== editor && !['P','DIV','H1','H2','H3','LI','BLOCKQUOTE'].includes(currentBlock.tagName)) {
      currentBlock = currentBlock.parentElement;
    }

    const p = document.createElement('p');
    p.innerHTML = '<br>';

    if (currentBlock && currentBlock !== editor) {
      // Insert HR and a new paragraph after the current block
      currentBlock.parentNode.insertBefore(hr, currentBlock.nextSibling);
      hr.parentNode.insertBefore(p, hr.nextSibling);
    } else {
      // Fallback: append at the end
      editor.appendChild(hr);
      editor.appendChild(p);
    }

    const newRange = document.createRange();
    newRange.setStart(p, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    editor.appendChild(hr);
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    editor.appendChild(p);
  }

  if (panel) panel.classList.remove('active');
  editor.focus({ preventScroll: true });
}

function insertDeskLink() {
  const sel = window.getSelection();
  deskSavedSelection = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

  let modal = document.getElementById('deskLinkModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'deskLinkModal';
    modal.style.zIndex = '1400';
    modal.innerHTML = `
      <div class="modal" style="max-width:380px;">
        <h2>Insert Link</h2>
        <div class="form-group"><label>URL</label><input type="url" id="deskLinkUrlInput" placeholder="https://example.com"></div>
        <div class="form-group"><label>Display Text (optional)</label><input type="text" id="deskLinkTextInput" placeholder="Click here"></div>
        <div class="form-group">
          <label>Box Color</label>
          <div id="deskLinkBoxColorGrid" style="display:flex; gap: 6px; margin-top: 5px; flex-wrap: wrap;"></div>
          <input type="hidden" id="deskLinkBoxColorInput" value="var(--info)">
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px;">
          <label class="task-checkbox" style="margin:0;">
            <input type="checkbox" id="deskLinkEmbedCheck">
            <span class="checkmark"></span>
          </label>
          <label for="deskLinkEmbedCheck" style="margin:0;text-transform:none;letter-spacing:0;font-size:.88rem;cursor:pointer;color:var(--text-secondary);transition:color 0.2s;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-secondary)'">Show as embedded preview</label>
        </div>
        <div class="form-actions"><button class="btn btn-secondary" onclick="closeDeskLinkModal()">Cancel</button><button class="btn btn-primary" onclick="confirmInsertDeskLink()">Insert</button></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('deskLinkUrlInput').value = '';
  document.getElementById('deskLinkTextInput').value = '';
  document.getElementById('deskLinkEmbedCheck').checked = false;

  const grid = document.getElementById('deskLinkBoxColorGrid');
  const COLOR_SWATCHES = ['#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#78716c','#ffffff','#000000'];
  const swatches = ['var(--info)', ...COLOR_SWATCHES.slice(0, 11)];
  grid.innerHTML = swatches.map(c => `<div class="color-swatch" style="background:${c}; width: 24px; height: 24px; cursor: pointer;" onclick="document.getElementById('deskLinkBoxColorInput').value='${c}'; document.querySelectorAll('#deskLinkBoxColorGrid .color-swatch').forEach(el=>el.style.border='none'); this.style.border='2px solid white';"></div>`).join('');
  grid.firstChild.style.border = '2px solid white';
  document.getElementById('deskLinkBoxColorInput').value = swatches[0];

  modal.classList.add('active');
}

function closeDeskLinkModal() { document.getElementById('deskLinkModal').classList.remove('active'); }

function confirmInsertDeskLink() {
  let url = document.getElementById('deskLinkUrlInput').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  const text = document.getElementById('deskLinkTextInput').value.trim() || url;
  const embed = document.getElementById('deskLinkEmbedCheck').checked;
  const bgColor = document.getElementById('deskLinkBoxColorInput') ? document.getElementById('deskLinkBoxColorInput').value : 'var(--info)';
  const fgColor = getDeskLinkContrast(bgColor);

  closeDeskLinkModal();
  document.getElementById('deskEntryBody').focus();
  if (deskSavedSelection) {
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(deskSavedSelection);
  }

  if (embed) {
    let embedUrl = url;
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]+)/);
    if (ytMatch) {
      embedUrl = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;
    }
    document.execCommand('insertHTML', false, `<div class="entry-embed resizable" contenteditable="false"><button class="entry-media-remove" onclick="if(confirm('Are you sure you want to remove this media?')) this.parentElement.remove()" title="Remove">&times;</button><iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe><a href="${url}" target="_blank" class="embed-link">${text}</a></div><p><br></p>`);
  } else {
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" class="entry-link" style="background-color: ${bgColor}; color: ${fgColor};">${text}</a>`);
  }
}

function getOrCreateDeskInput(id, accept, handler) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('input');
    el.type = 'file';
    el.id = id;
    el.accept = accept;
    el.style.display = 'none';
    el.onchange = () => handler(el);
    document.body.appendChild(el);
  }
  return el;
}

function insertDeskImage() { getOrCreateDeskInput('deskImageInput', 'image/*', el => handleDeskFileUpload(el, 'image')).click(); }
function insertDeskAudio() { getOrCreateDeskInput('deskAudioInput', 'audio/*', el => handleDeskFileUpload(el, 'audio')).click(); }
function insertDeskDocument() { getOrCreateDeskInput('deskDocInput', '.pdf,.doc,.docx,.txt,.xlsx,.csv,.pptx', el => handleDeskFileUpload(el, 'document')).click(); }

async function handleDeskFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    document.getElementById('deskEntryBody').focus();
    let html = '';
    const removeBtn = '<button class="entry-media-remove" onclick="if(confirm(\'Are you sure you want to remove this media?\')) this.parentElement.remove()" title="Remove">&times;</button>';
    if (type === 'image') html = `<div class="entry-media resizable" contenteditable="false">${removeBtn}<img src="${data.url}" alt="${data.name}" loading="lazy"><span class="media-caption">${data.name}</span></div><p><br></p>`;
    else if (type === 'audio') html = `<div class="entry-media entry-audio resizable" contenteditable="false">${removeBtn}<audio controls src="${data.url}"></audio><span class="media-caption">${data.name}</span></div><p><br></p>`;
    else html = `<div class="entry-media entry-doc" contenteditable="false">${removeBtn}<a href="${data.url}" target="_blank" class="doc-link"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${data.name}</a></div><p><br></p>`;
    document.execCommand('insertHTML', false, html);
  } catch (err) { console.error('Upload failed:', err); }
  input.value = '';
}

function _deskHandleDividerBackspace(e) {
  if (e.key !== 'Backspace') return;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  
  let node = sel.anchorNode;
  let offset = sel.anchorOffset;

  if (node === e.currentTarget) {
    if (offset > 0) {
      let prev = node.childNodes[offset - 1];
      if (prev && prev.nodeName === 'HR') {
        prev.remove();
        e.preventDefault();
      }
    }
    return;
  }

  if (offset === 0 || (offset === 1 && node.childNodes && node.childNodes[0] && node.childNodes[0].nodeName === 'BR')) {
    let isAtStart = true;
    let curr = node;
    while (curr && curr !== e.currentTarget) {
      if (curr.previousSibling) {
        let sibling = curr.previousSibling;
        while (sibling) {
          if (sibling.nodeType !== Node.TEXT_NODE || sibling.textContent.trim().length > 0) {
             isAtStart = false;
             break;
          }
          sibling = sibling.previousSibling;
        }
        if (!isAtStart) break;
      }
      curr = curr.parentNode;
    }

    if (isAtStart) {
      curr = node;
      while (curr && curr.parentNode !== e.currentTarget) {
        curr = curr.parentNode;
      }
      if (curr) {
        let prev = curr.previousSibling;
        while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
          prev = prev.previousSibling;
        }
        if (prev && prev.nodeName === 'HR') {
          prev.remove();
          e.preventDefault();
        }
      }
    }
  }
}

// Init backspace handling
if (document.readyState === 'loading') { 
  document.addEventListener('DOMContentLoaded', () => { 
    const de = document.getElementById('deskEntryBody');
    if (de) de.addEventListener('keydown', _deskHandleDividerBackspace);
  }); 
} else { 
  const de = document.getElementById('deskEntryBody');
  if (de) de.addEventListener('keydown', _deskHandleDividerBackspace);
}
