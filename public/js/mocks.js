// ─── Mocks Page Logic ───
let scoreModalMockId = null;
let editMockTargetId = null;
let cachedPlatforms = [];
let sectionPerfExpanded = false;

// ─── Load & Render ───
async function loadMocks() {
  const examId = getExamId();
  try {
    const res = await fetch(`/api/exams/${examId}/mocks`);
    const mocks = await res.json();
    currentMocks = mocks;
    renderMockStats(mocks);
    renderMocks(mocks);
    renderSectionPerformance(mocks);
    showExamTimeRange();
  } catch {
    document.getElementById('mocksGrid').innerHTML = '<p style="color:var(--danger)">Failed to load mocks</p>';
  }
}

// ─── Exam Time Range Display ───
function showExamTimeRange() {
  const bar = document.getElementById('mockTimeRangeBar');
  if (!bar) return;
  if (currentExam && currentExam.examTimeRange) {
    bar.style.display = 'flex';
    document.getElementById('mockTimeRangeText').textContent = currentExam.examTimeRange;
  } else {
    bar.style.display = 'none';
  }
}

// ─── Stats (Revamped) ───
function renderMockStats(mocks) {
  const row = document.getElementById('mockStatsRow');
  if (!row) return;
  const total = mocks.length;
  const attempted = mocks.filter(m => m.attempted).length;

  // Full mocks = those with all sections attempted (or no sectionsAttempted array = all)
  const sections = (currentExam && currentExam.sections) || [];
  const isFullMock = m => !sections.length || !m.sectionsAttempted || m.sectionsAttempted.length === sections.length;

  const scored = mocks.filter(m => m.totalScore !== null && m.totalScore !== undefined);
  const fullScored = scored.filter(isFullMock);
  const best = fullScored.length > 0 ? Math.max(...fullScored.map(m => m.totalScore)) : null;
  const avg = fullScored.length > 0 ? Math.round(fullScored.reduce((s, m) => s + m.totalScore, 0) / fullScored.length * 10) / 10 : null;


  // Accuracy: only count attempted sections
  let totalCorrect = 0, totalWrong = 0;
  mocks.forEach(m => {
    if (m.sectionScores && m.sectionScores.length) {
      m.sectionScores.forEach(ss => {
        if (!ss._skipped) { totalCorrect += (ss.correct || 0); totalWrong += (ss.wrong || 0); }
      });
    } else {
      totalCorrect += (m.correct || 0);
      totalWrong += (m.wrong || 0);
    }
  });
  const accuracy = (totalCorrect + totalWrong) > 0 ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0;

  // Accuracy trend: compare recent vs previous (need at least 2 scored mocks)
  let trendHtml = '';
  if (scored.length >= 2) {
    const sorted = [...scored].sort((a, b) => a.mockNumber - b.mockNumber);
    const half = Math.floor(sorted.length / 2);
    const recent = sorted.slice(half);
    const prev = sorted.slice(0, half);
    if (prev.length >= 1) {
      const avgRecent = recent.reduce((s, m) => s + m.totalScore, 0) / recent.length;
      const avgPrev = prev.reduce((s, m) => s + m.totalScore, 0) / prev.length;
      const diff = avgRecent - avgPrev;
      const pct = avgPrev > 0 ? Math.round(Math.abs(diff) / avgPrev * 100) : 0;
      if (diff > 1) trendHtml = `<div class="stat-trend up">↑ ${pct}%</div>`;
      else if (diff < -1) trendHtml = `<div class="stat-trend down">↓ ${pct}%</div>`;
      else trendHtml = `<div class="stat-trend flat">— 0%</div>`;
    }
  }

  row.innerHTML = `
    <div class="mock-stat-pill"><div class="msp-val">${total}</div><div class="msp-lbl">Total Mocks</div></div>
    <div class="mock-stat-pill"><div class="msp-val">${attempted}</div><div class="msp-lbl">Attempted</div></div>
    <div class="mock-stat-pill"><div class="msp-val">${avg !== null ? avg : '—'}</div><div class="msp-lbl">Avg Score</div></div>
    <div class="mock-stat-pill"><div class="msp-val">${best !== null ? best : '—'}</div><div class="msp-lbl">Best Score</div></div>
    <div class="mock-stat-pill"><div class="msp-val">${accuracy}%</div><div class="msp-lbl">Accuracy</div></div>
    <div class="mock-stat-pill"><div class="msp-val">${trendHtml || '—'}</div><div class="msp-lbl">Trend</div></div>
  `;
}

// ─── Render Mock Cards ───
function renderMocks(mocks) {
  const grid = document.getElementById('mocksGrid');
  grid.innerHTML = '';
  if (!mocks.length) { grid.innerHTML = '<div style="color:var(--text-muted);padding:40px;text-align:center;">No mocks yet. Click "+ Add Mock" to create one.</div>'; return; }

  const sections = (currentExam && currentExam.sections) || [];

  mocks.forEach(mock => {
    const card = document.createElement('div');
    card.className = 'mock-card';

    const hasScores = mock.totalScore !== null && mock.totalScore !== undefined;
    let scoreHtml = '';
    if (hasScores) {
      const maxStr = mock.maxScore ? ` / ${mock.maxScore}` : '';
      scoreHtml = `<div class="mock-score-display">Score: <strong>${mock.totalScore}${maxStr}</strong></div>`;
    }

    // Platform tag (SVG icon instead of emoji)
    let platformHtml = '';
    if (mock.platform) {
      platformHtml = `<div class="mock-platform-tag"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h12"/></svg> ${mock.platform}</div>`;
    }

    // Sections tag (only if partial)
    let sectionsTagHtml = '';
    if (sections.length && mock.sectionsAttempted && mock.sectionsAttempted.length < sections.length) {
      const names = mock.sectionsAttempted.map(i => sections[i] ? sections[i].name : '').filter(Boolean);
      sectionsTagHtml = `<div class="mock-sections-tag">${names.join(', ')} only</div>`;
    }

    // Scheduled Date/Time tag
    let scheduleHtml = '';
    if (mock.scheduledDate) {
      let timeStr = mock.scheduledTime ? ` at ${mock.scheduledTime}` : '';
      scheduleHtml = `<div class="mock-platform-tag" style="background: rgba(59, 130, 246, 0.1); color: var(--info);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${mock.scheduledDate}${timeStr}</div>`;
    }

    const uid = mock._id;
    card.innerHTML = `
      <div class="mock-card-header">
        <div>
          <h3>${mock.mockName || 'Mock ' + mock.mockNumber}</h3>
          ${platformHtml}
          ${scheduleHtml}
          ${sectionsTagHtml}
        </div>
        <div style="display:flex;gap:4px;">
          <button class="mock-edit" onclick="openEditMockModal('${uid}')" title="Edit">✎</button>
          <button class="mock-delete" onclick="deleteMock('${uid}')" title="Delete">✕</button>
        </div>
      </div>
      <div class="mock-pills">
        <button class="mock-pill ${mock.attempted ? 'active' : ''}" onclick="updateMockStage('${uid}','attempted',${!mock.attempted})">
          <span>Attempted</span><div class="mp-check"></div>
        </button>
        <button class="mock-pill ${mock.analyzeDone ? 'active' : ''} ${!mock.attempted ? 'disabled' : ''}" onclick="updateMockStage('${uid}','analyzeDone',${!mock.analyzeDone})">
          <span>Analyzed</span><div class="mp-check"></div>
        </button>
        <button class="mock-pill ${mock.reattemptDone ? 'active' : ''} ${!mock.analyzeDone ? 'disabled' : ''}" onclick="updateMockStage('${uid}','reattemptDone',${!mock.reattemptDone})">
          <span>Reattempted</span><div class="mp-check"></div>
        </button>
      </div>
      <div class="mock-scores">
        ${scoreHtml}
        <button class="log-score-btn" onclick="openScoreModal('${uid}')">${hasScores ? 'Edit Score' : '+ Log Score'}</button>
      </div>`;
    grid.appendChild(card);
  });
}

// ─── Section Performance Panel ───
function toggleSectionPerf() {
  const panel = document.getElementById('sectionPerfPanel');
  sectionPerfExpanded = !sectionPerfExpanded;
  panel.classList.toggle('expanded', sectionPerfExpanded);
}

function renderSectionPerformance(mocks) {
  const sections = (currentExam && currentExam.sections) || [];
  const panel = document.getElementById('sectionPerfPanel');
  const body = document.getElementById('sectionPerfBody');
  if (!panel || !body) return;

  const scored = mocks.filter(m => m.sectionScores && m.sectionScores.length && m.totalScore !== null);
  if (!sections.length || scored.length < 1) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const sectionColors = ['#f5c518', '#58a6ff', '#3fb950', '#f06292', '#ce93d8', '#ff9a3c', '#64b5f6'];

  let html = `<div class="section-perf-labels"><span>Section</span><span>Avg Score Bar</span><span>Avg</span><span>Best</span><span>Trend</span></div>`;

  sections.forEach((sec, i) => {
    const scores = [];
    scored.forEach(m => {
      if (m.sectionScores[i] && !m.sectionScores[i]._skipped) {
        const ss = m.sectionScores[i];
        scores.push((ss.correct * (ss.perCorrect || 1)) + (ss.wrong * (ss.perWrong || 0)));
      }
    });
    if (!scores.length) return;

    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const best = Math.max(...scores);
    const maxMarks = sec.maxMarks || 1;
    const pct = Math.min(100, Math.max(0, (avg / maxMarks) * 100));

    // Trend: last vs second-to-last
    let trendCls = 'flat', trendIcon = '—';
    if (scores.length >= 2) {
      const last = scores[scores.length - 1], prev = scores[scores.length - 2];
      if (last > prev) { trendCls = 'up'; trendIcon = '↑'; }
      else if (last < prev) { trendCls = 'down'; trendIcon = '↓'; }
    }

    const color = sectionColors[i % sectionColors.length];
    html += `<div class="section-perf-row">
      <div class="section-perf-name" title="${sec.name}">${sec.name}</div>
      <div class="section-perf-bar-wrap"><div class="section-perf-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
      <div class="section-perf-stat">${avg}/${maxMarks}</div>
      <div class="section-perf-stat">${best}</div>
      <div class="section-perf-trend ${trendCls}">${trendIcon}</div>
    </div>`;
  });

  body.innerHTML = html;
}

// ─── Add Mock Modal ───
async function openAddMockModal() {
  // Pre-fill mock name
  const nextNum = currentMocks.length > 0 ? Math.max(...currentMocks.map(m => m.mockNumber)) + 1 : 1;
  document.getElementById('addMockName').value = `Mock ${nextNum}`;
  document.getElementById('addMockPlatform').value = '';
  document.getElementById('addMockDate').value = '';
  document.getElementById('addMockTime').value = '';

  // Load platforms for autocomplete
  try {
    const res = await fetch(`/api/exams/${getExamId()}/mock-platforms`);
    cachedPlatforms = await res.json();
  } catch { cachedPlatforms = []; }

  // Sections checkboxes
  const sections = (currentExam && currentExam.sections) || [];
  const group = document.getElementById('addMockSectionsGroup');
  const checks = document.getElementById('addMockSectionChecks');
  if (sections.length) {
    group.style.display = '';
    checks.innerHTML = sections.map((s, i) => `
      <label class="mock-section-check">
        <input type="checkbox" data-idx="${i}" checked>
        <span>${s.name}</span>
      </label>`).join('');
  } else {
    group.style.display = 'none';
  }

  document.getElementById('addMockModal').classList.add('active');
  document.getElementById('addMockName').focus();
}

function closeAddMockModal() {
  document.getElementById('addMockModal').classList.remove('active');
  hidePlatformDropdown('add');
}

async function confirmCreateMock() {
  const name = document.getElementById('addMockName').value.trim();
  const platform = document.getElementById('addMockPlatform').value.trim();
  const scheduledDate = document.getElementById('addMockDate').value || null;
  const scheduledTime = document.getElementById('addMockTime').value || '';
  const sections = (currentExam && currentExam.sections) || [];

  let sectionsAttempted = null;
  if (sections.length) {
    const checked = [...document.querySelectorAll('#addMockSectionChecks input:checked')].map(el => Number(el.dataset.idx));
    if (checked.length < sections.length) sectionsAttempted = checked;
  }

  await fetch(`/api/exams/${getExamId()}/mocks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mockName: name || undefined, platform, scheduledDate, scheduledTime, sectionsAttempted })
  });
  closeAddMockModal();
  loadMocks();
  loadDashboardData();
}

// ─── Edit Mock Modal ───
async function openEditMockModal(id) {
  editMockTargetId = id;
  const mock = currentMocks.find(m => m._id === id);
  if (!mock) return;

  document.getElementById('editMockName').value = mock.mockName || '';
  document.getElementById('editMockPlatform').value = mock.platform || '';
  document.getElementById('editMockDate').value = mock.scheduledDate || '';
  document.getElementById('editMockTime').value = mock.scheduledTime || '';

  // Load platforms for autocomplete
  try {
    const res = await fetch(`/api/exams/${getExamId()}/mock-platforms`);
    cachedPlatforms = await res.json();
  } catch { cachedPlatforms = []; }

  const sections = (currentExam && currentExam.sections) || [];
  const group = document.getElementById('editMockSectionsGroup');
  const checks = document.getElementById('editMockSectionChecks');
  if (sections.length) {
    group.style.display = '';
    const attempted = mock.sectionsAttempted || sections.map((_, i) => i);
    checks.innerHTML = sections.map((s, i) => `
      <label class="mock-section-check${attempted.includes(i) ? '' : ' unchecked'}">
        <input type="checkbox" data-idx="${i}" ${attempted.includes(i) ? 'checked' : ''}>
        <span>${s.name}</span>
      </label>`).join('');
  } else {
    group.style.display = 'none';
  }

  document.getElementById('editMockModal').classList.add('active');
}

function closeEditMockModal() {
  editMockTargetId = null;
  document.getElementById('editMockModal').classList.remove('active');
  hidePlatformDropdown('edit');
}

async function saveEditMock() {
  if (!editMockTargetId) return;
  const name = document.getElementById('editMockName').value.trim();
  const platform = document.getElementById('editMockPlatform').value.trim();
  const scheduledDate = document.getElementById('editMockDate').value || null;
  const scheduledTime = document.getElementById('editMockTime').value || '';
  const sections = (currentExam && currentExam.sections) || [];

  let sectionsAttempted = null;
  if (sections.length) {
    const checked = [...document.querySelectorAll('#editMockSectionChecks input:checked')].map(el => Number(el.dataset.idx));
    if (checked.length < sections.length) sectionsAttempted = checked;
  }

  await fetch(`/api/mocks/${editMockTargetId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mockName: name, platform, scheduledDate, scheduledTime, sectionsAttempted })
  });
  closeEditMockModal();
  loadMocks();
  loadDashboardData();
}

// ─── Platform Dropdown (autocomplete) ───
function showPlatformDropdown(prefix) {
  const dd = document.getElementById(`${prefix}PlatformDropdown`);
  if (!cachedPlatforms.length) return;
  renderPlatformItems(prefix, cachedPlatforms);
  dd.classList.add('visible');
}

function hidePlatformDropdown(prefix) {
  const dd = document.getElementById(`${prefix}PlatformDropdown`);
  if (dd) dd.classList.remove('visible');
}

function filterPlatformDropdown(prefix) {
  const val = document.getElementById(`${prefix}MockPlatform`).value.toLowerCase();
  const filtered = cachedPlatforms.filter(p => p.toLowerCase().includes(val));
  if (filtered.length && val) {
    renderPlatformItems(prefix, filtered);
    document.getElementById(`${prefix}PlatformDropdown`).classList.add('visible');
  } else {
    hidePlatformDropdown(prefix);
  }
}

function renderPlatformItems(prefix, items) {
  const dd = document.getElementById(`${prefix}PlatformDropdown`);
  dd.innerHTML = items.map(p => `<div class="platform-dropdown-item" onmousedown="selectPlatform('${prefix}','${p.replace(/'/g, "\\'")}')">${p}</div>`).join('');
}

function selectPlatform(prefix, value) {
  document.getElementById(`${prefix}MockPlatform`).value = value;
  hidePlatformDropdown(prefix);
}

// Close dropdowns on blur
document.addEventListener('click', e => {
  if (!e.target.closest('.platform-combo')) {
    hidePlatformDropdown('add');
    hidePlatformDropdown('edit');
  }
});

// ─── Score Modal (Section-Aware with partial support) ───
function openScoreModal(mockId) {
  scoreModalMockId = mockId;
  const mock = currentMocks.find(m => m._id === mockId);
  const sections = (currentExam && currentExam.sections && currentExam.sections.length) ? currentExam.sections : null;
  const body = document.getElementById('scoreModalBody');
  const totalRow = document.getElementById('scoreTotalRow');
  body.innerHTML = '';

  if (sections) {
    // Determine which sections this mock attempted
    const attempted = mock.sectionsAttempted || sections.map((_, i) => i);

    sections.forEach((sec, i) => {
      const existing = (mock && mock.sectionScores && mock.sectionScores[i]) ? mock.sectionScores[i] : {};
      const isAttempted = attempted.includes(i);
      const maxQ = sec.totalQuestions || 999;
      const div = document.createElement('div');
      div.className = 'score-section-group';
      if (!isAttempted) div.style.opacity = '0.35';
      div.innerHTML = `
        <h4>${sec.name}${!isAttempted ? ' <span style="font-weight:400;font-size:.7rem;color:var(--text-muted)">(not attempted)</span>' : ''}</h4>
        <div class="ssg-meta">Max: ${sec.maxMarks} · +${sec.perCorrect} / ${sec.perWrong} · Q: ${maxQ}</div>
        <div class="ssg-fields">
          <div class="form-group"><label>Correct</label><input type="number" class="ssg-c" data-idx="${i}" data-maxq="${maxQ}" value="${isAttempted ? (existing.correct || '') : ''}" placeholder="0" min="0" max="${maxQ}" ${!isAttempted ? 'disabled' : ''} oninput="clampScoreInput(this);updateScoreCalc()"></div>
          <div class="form-group"><label>Wrong</label><input type="number" class="ssg-w" data-idx="${i}" data-maxq="${maxQ}" value="${isAttempted ? (existing.wrong || '') : ''}" placeholder="0" min="0" max="${maxQ}" ${!isAttempted ? 'disabled' : ''} oninput="clampScoreInput(this);updateScoreCalc()"></div>
        </div>
        <div class="ssg-calc">Score: <strong class="ssg-score-val">0</strong></div>`;
      body.appendChild(div);
    });
    totalRow.style.display = '';
    updateScoreCalc();
  } else {
    // No sections — simple overall scoring
    body.innerHTML = `
      <div class="form-group"><label>Max Score</label><input type="number" id="smMaxScore" placeholder="300" value="${mock && mock.maxScore ? mock.maxScore : ''}"></div>
      <div class="form-group"><label>Correct Questions</label><input type="number" id="smCorrect" placeholder="0" value="${mock && mock.correct ? mock.correct : ''}" min="0"></div>
      <div class="form-group"><label>Wrong Questions</label><input type="number" id="smWrong" placeholder="0" value="${mock && mock.wrong ? mock.wrong : ''}" min="0"></div>
      <div class="form-group"><label>+Per Correct</label><input type="number" id="smPerC" placeholder="1" value="1"></div>
      <div class="form-group"><label>-Per Wrong</label><input type="number" id="smPerW" placeholder="0" value="0"></div>`;
    totalRow.style.display = 'none';
  }

  document.getElementById('scoreModal').classList.add('active');
}

function updateScoreCalc() {
  const sections = currentExam.sections;
  const mock = currentMocks.find(m => m._id === scoreModalMockId);
  const attempted = (mock && mock.sectionsAttempted) || sections.map((_, i) => i);
  let total = 0;
  document.querySelectorAll('.score-section-group').forEach((group, i) => {
    if (!attempted.includes(i)) {
      group.querySelector('.ssg-score-val').textContent = '—';
      return;
    }
    const cInput = group.querySelector('.ssg-c');
    const wInput = group.querySelector('.ssg-w');
    const c = Number(cInput.value) || 0;
    const w = Number(wInput.value) || 0;
    const maxQ = sections[i].totalQuestions || 999;
    // Clamp wrong to remaining questions
    if (c + w > maxQ) {
      wInput.value = Math.max(0, maxQ - c);
    }
    const sec = sections[i];
    const score = (c * (sec.perCorrect || 1)) + (Number(wInput.value) || 0) * (sec.perWrong || 0);
    group.querySelector('.ssg-score-val').textContent = score;
    total += score;
  });
  document.getElementById('scoreTotalVal').textContent = total;
}

function clampScoreInput(input) {
  const maxQ = Number(input.dataset.maxq) || 999;
  let val = Number(input.value);
  if (val < 0) input.value = 0;
  if (val > maxQ) input.value = maxQ;
}

function closeScoreModal() {
  scoreModalMockId = null;
  document.getElementById('scoreModal').classList.remove('active');
}

async function saveScoreModal() {
  if (!scoreModalMockId) return;
  const sections = (currentExam && currentExam.sections && currentExam.sections.length) ? currentExam.sections : null;
  let payload = {};

  if (sections) {
    const mock = currentMocks.find(m => m._id === scoreModalMockId);
    const attempted = (mock && mock.sectionsAttempted) || sections.map((_, i) => i);
    const sectionScores = [];
    document.querySelectorAll('.score-section-group').forEach((group, i) => {
      const sec = sections[i];
      const isAttempted = attempted.includes(i);
      sectionScores.push({
        section: sec.name,
        sectionId: sec.sectionId || null,   // stable ID — survives renames
        correct: isAttempted ? (Number(group.querySelector('.ssg-c').value) || 0) : 0,
        wrong: isAttempted ? (Number(group.querySelector('.ssg-w').value) || 0) : 0,
        perCorrect: sec.perCorrect || 1,
        perWrong: sec.perWrong || 0,
        maxMarks: sec.maxMarks || 0,
        _skipped: !isAttempted
      });
    });
    payload = { sectionScores };
  } else {
    const c = Number(document.getElementById('smCorrect').value) || 0;
    const w = Number(document.getElementById('smWrong').value) || 0;
    const perC = Number(document.getElementById('smPerC').value) || 1;
    const perW = Number(document.getElementById('smPerW').value) || 0;
    const maxScore = Number(document.getElementById('smMaxScore').value) || null;
    payload = { correct: c, wrong: w, perCorrect: perC, perWrong: perW, maxScore };
  }

  await fetch(`/api/mocks/${scoreModalMockId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  closeScoreModal();
  loadMocks();
  loadDashboardData();
}

// ─── Mock Stage Updates ───
async function updateMockStage(id, stage, value) {
  const mock = currentMocks.find(m => m._id === id);
  if (!mock) return;
  const payload = { [stage]: value };
  if (stage === 'analyzeDone' && value === true && !mock.attempted) { alert('Please mark as Attempted before analyzing.'); return; }
  if (stage === 'reattemptDone' && value === true && !mock.analyzeDone) { alert('Please mark as Analyzed before reattempting.'); return; }
  if (stage === 'attempted' && value === false) { payload.analyzeDone = false; payload.reattemptDone = false; }
  if (stage === 'analyzeDone' && value === false) { payload.reattemptDone = false; }
  await fetch(`/api/mocks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  loadMocks();
  loadDashboardData();
}

// ─── Delete Mock ───
let pendingDeleteMockId = null;

async function deleteMock(id) {
  pendingDeleteMockId = id;
  const mock = currentMocks.find(m => m._id === id);
  document.getElementById('deleteMockName').textContent = mock ? (mock.mockName || 'Mock ' + mock.mockNumber) : 'this mock';
  document.getElementById('deleteMockModal').classList.add('active');
}

function closeDeleteMockModal() {
  pendingDeleteMockId = null;
  document.getElementById('deleteMockModal').classList.remove('active');
}

async function confirmDeleteMock() {
  if (!pendingDeleteMockId) return;
  await fetch(`/api/mocks/${pendingDeleteMockId}`, { method: 'DELETE' });
  closeDeleteMockModal();
  loadMocks();
  loadDashboardData();
}

function openClearMocksModal() {
  document.getElementById('clearMocksModal').classList.add('active');
}

function closeClearMocksModal() {
  document.getElementById('clearMocksModal').classList.remove('active');
}

async function clearAllMocks() {
  await fetch(`/api/exams/${getExamId()}/mocks/all`, { method: 'DELETE' });
  closeClearMocksModal();
  loadMocks();
  loadDashboardData();
}
