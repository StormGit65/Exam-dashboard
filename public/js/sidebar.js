// ─── Theme ───
function initTheme() {
  const saved = localStorage.getItem('examprep-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeLabel(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('examprep-theme', next);
  updateThemeLabel(next);
  // Redraw canvas-based charts so they pick up new CSS variable colors
  setTimeout(() => {
    if (typeof drawScoreChart === 'function') drawScoreChart();
    if (typeof drawSectionAccuracyChart === 'function') drawSectionAccuracyChart();
    if (typeof renderMockProgress === 'function') renderMockProgress();
    if (typeof updateDayTimeline === 'function') updateDayTimeline();
  }, 50);
}

function updateThemeLabel(theme) {
  const el = document.getElementById('themeIcon');
  if (el) el.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  const svg = document.getElementById('themeIconSvg');
  if (svg) {
    svg.innerHTML = theme === 'dark'
      ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'
      : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
  }
}

// ─── View Switching ───
function switchView(view) {
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (nav) nav.classList.add('active');
  if (view === 'mocks') loadMocks();
  if (view === 'dashboard') loadDashboardData();
  if (view === 'goals') { loadGoals(); if (typeof initGoalsPage === 'function') initGoalsPage(); }
  // Show docs FAB only on goals view
  const fab = document.getElementById('goalsDocsPanelToggle');
  if (fab) fab.style.display = (view === 'goals') ? '' : 'none';
}

// ─── Sidebar Toggle ───
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('examprep-sidebar', sidebar.classList.contains('collapsed') ? 'true' : 'false');
}

function initSidebar() {
  if (localStorage.getItem('examprep-sidebar') === 'true') {
    document.getElementById('sidebar').classList.add('collapsed');
  }
}

// ─── Get exam ID from URL ───
function getExamId() {
  return new URLSearchParams(window.location.search).get('exam');
}

initTheme();
initSidebar();

// ─── Marquee overflow detection ───
function detectOverflow() {
  document.querySelectorAll('.nav-item span, .goal-item span').forEach(span => {
    if (span.scrollWidth > span.clientWidth + 2) {
      span.classList.add('is-overflowing');
      const overflow = span.clientWidth - span.scrollWidth;
      span.style.setProperty('--overflow', `${overflow}px`);
    } else {
      span.classList.remove('is-overflowing');
    }
  });
}

// Run on load, resize, and whenever sidebar/goals content changes
window.addEventListener('resize', detectOverflow);
const overflowObserver = new MutationObserver(detectOverflow);
overflowObserver.observe(document.body, { childList: true, subtree: true });
setTimeout(detectOverflow, 500);

// ─── Sidebar Split Divider (resize nav / goals) ───
(function initSidebarSplitDivider() {
  const divider = document.getElementById('sidebarSplitDivider');
  if (!divider) return;

  const sidebar = document.getElementById('sidebar');
  const nav = sidebar.querySelector('.sidebar-nav');
  const goals = document.getElementById('sidebarGoals');
  if (!nav || !goals) return;

  let isDragging = false;
  let startY = 0;
  let startNavHeight = 0;

  // Restore saved split
  const savedNavHeight = localStorage.getItem('examprep-sidebar-split');
  if (savedNavHeight) {
    nav.style.flex = `0 1 ${savedNavHeight}px`;
    nav.style.height = 'auto';
  }

  divider.addEventListener('mousedown', onStart);
  divider.addEventListener('touchstart', onStart, { passive: false });

  function onStart(e) {
    e.preventDefault();
    isDragging = true;
    startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    startNavHeight = nav.getBoundingClientRect().height;
    divider.classList.add('active');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    const delta = clientY - startY;
    const sidebarRect = sidebar.getBoundingClientRect();
    const headerHeight = sidebar.querySelector('.sidebar-header')?.getBoundingClientRect().height || 0;
    const bottomActions = sidebar.querySelector('.sidebar-bottom-actions')?.getBoundingClientRect().height || 0;
    const dividerH = divider.getBoundingClientRect().height;
    const available = sidebarRect.height - headerHeight - bottomActions - dividerH;
    const minNav = 60;
    const minGoals = 60;
    const maxNav = available - minGoals;

    let newNavHeight = Math.max(minNav, Math.min(maxNav, startNavHeight + delta));
    nav.style.flex = `0 1 ${newNavHeight}px`;
    nav.style.height = 'auto';
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    divider.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);

    // Save to localStorage
    const navHeight = nav.getBoundingClientRect().height;
    localStorage.setItem('examprep-sidebar-split', Math.round(navHeight));
  }
})();
