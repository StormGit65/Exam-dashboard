// ─── Dashboard Logic ───
let currentExam = null;
let currentMocks = [];
let clockIntervalId = null;

async function initDashboard() {
  const examId = getExamId();
  if (!examId) { window.location.href = '/'; return; }
  try {
    const res = await fetch(`/api/exams/${examId}`);
    if (!res.ok) { window.location.href = '/'; return; }
    currentExam = await res.json();
  } catch { window.location.href = '/'; return; }

  document.getElementById('sidebarExamName').textContent = currentExam.name;
  document.getElementById('badgeExamName').textContent = currentExam.name;
  document.getElementById('examBadge').style.setProperty('--exam-color', currentExam.color || '#f5c518');
  document.title = `Kaizen — ${currentExam.name}`;

  if (clockIntervalId) clearInterval(clockIntervalId);
  updateGreetingAndSunArc();
  clockIntervalId = setInterval(updateGreetingAndSunArc, 1000);

  if (currentExam.examDate) {
    const d = new Date(currentExam.examDate);
    document.getElementById('badgeDate').textContent = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    TimerModule.init(examId, currentExam.examDate);
  } else {
    TimerModule.destroy();
    document.getElementById('badgeDate').textContent = 'No date';
    document.getElementById('badgeCountdown').textContent = '—';
    document.getElementById('statDays').textContent = '—';
  }

  loadDashboardData();
  if (typeof loadDeskProfiles === 'function') await loadDeskProfiles(); // Preload for colors
  loadGoals();
  SunTime.init();
}

let hoursRendered = false;

function updateGreetingAndSunArc() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  document.getElementById('greeting').textContent = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}!`;
  if (currentExam) document.getElementById('examSubtitle').textContent = `${currentExam.name} Preparation Dashboard`;

  const totalMinutes = h * 60 + m;
  const pct = (totalMinutes / 1440) * 100; // % of 24hrs

  const isDaytime = SunTime.isDaytime();

  // Elapsed bar
  const elapsed = document.getElementById('dtElapsed');
  elapsed.style.width = pct + '%';
  const dim = document.getElementById('dtDim');
  if (dim) dim.style.width = pct + '%';
  // The underlying track (.dt-night-left, .dt-day, .dt-night-right) provides the correct background colors now.

  // Current dot position
  const dtNow = document.getElementById('dtNow');
  dtNow.style.left = pct + '%';

  // Dot day/night color
  const dot = dtNow.querySelector('.dt-now-dot');
  if (isDaytime) {
    dot.classList.remove('night');
  } else {
    dot.classList.add('night');
  }

  // Time label
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  document.getElementById('dtNowLabel').textContent = timeStr;

  // Render hour labels (once)
  if (!hoursRendered) {
    const hoursContainer = document.getElementById('dtHours');
    hoursContainer.innerHTML = '';
    for (let hr = 0; hr <= 24; hr++) {
      const label = document.createElement('span');
      label.className = 'dt-hour-label';
      label.style.left = (hr / 24) * 100 + '%';
      if (hr === 0) label.textContent = '12a';
      else if (hr === 12) label.textContent = '12p';
      else if (hr === 24) label.textContent = '12a';
      else if (hr < 12) label.textContent = hr + 'a';
      else label.textContent = (hr - 12) + 'p';
      hoursContainer.appendChild(label);
    }
    hoursRendered = true;
  }
}

// ─── Edit Exam ───
async function openEditExamModal() {
  if (!currentExam) return;
  document.getElementById('editExamName').value = currentExam.name || '';
  document.getElementById('editExamDate').value = currentExam.examDate ? currentExam.examDate.substring(0, 10) : '';
  document.getElementById('editExamColor').value = currentExam.color || '#f5c518';

  // Initialize time dropdowns if empty
  const startHourSel = document.getElementById('editExamStartHour');
  if (startHourSel && startHourSel.options.length <= 1) {
    ['editExamStartHour', 'editExamEndHour'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      for (let h = 1; h <= 12; h++) {
        const o = document.createElement('option');
        o.value = String(h).padStart(2, '0');
        o.textContent = String(h).padStart(2, '0');
        sel.appendChild(o);
      }
    });
  }

  // Parse existing time range if any (Format: HH:MM AM - HH:MM PM)
  document.getElementById('editExamStartHour').value = '';
  document.getElementById('editExamStartMin').value = '00';
  document.getElementById('editExamStartPeriod').value = 'AM';
  document.getElementById('editExamEndHour').value = '';
  document.getElementById('editExamEndMin').value = '00';
  document.getElementById('editExamEndPeriod').value = 'AM';
  
  if (currentExam.examTimeRange) {
    const parts = currentExam.examTimeRange.match(/(\d{2}):(\d{2})\s(AM|PM)\s-\s(\d{2}):(\d{2})\s(AM|PM)/);
    if (parts) {
      document.getElementById('editExamStartHour').value = parts[1];
      document.getElementById('editExamStartMin').value = parts[2];
      document.getElementById('editExamStartPeriod').value = parts[3];
      document.getElementById('editExamEndHour').value = parts[4];
      document.getElementById('editExamEndMin').value = parts[5];
      document.getElementById('editExamEndPeriod').value = parts[6];
    }
  }

  // Populate group dropdown
  const select = document.getElementById('editExamGroup');
  const customInput = document.getElementById('editExamGroupCustom');
  select.innerHTML = '<option value="">— Same as Exam Name —</option>';
  customInput.style.display = 'none';
  customInput.value = '';

  try {
    const res = await fetch('/api/archived-exam-names');
    const archived = await res.json();
    const groups = [...new Set(archived.map(a => a.baseName))];
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      select.appendChild(opt);
    });
  } catch {}

  // Add "Custom..." option
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '+ New Group...';
  select.appendChild(customOpt);

  // Set current value
  const currentBase = currentExam.baseName || currentExam.name;
  const hasOption = [...select.options].some(o => o.value === currentBase);
  if (hasOption) {
    select.value = currentBase;
  } else if (currentBase && currentBase !== currentExam.name) {
    // Add as option if not in list
    const opt = document.createElement('option');
    opt.value = currentBase;
    opt.textContent = currentBase;
    select.insertBefore(opt, select.lastElementChild);
    select.value = currentBase;
  }

  // Toggle custom input
  select.onchange = () => {
    if (select.value === '__custom__') {
      customInput.style.display = '';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
    }
  };

  document.getElementById('editExamModal').classList.add('active');
}
function closeEditExamModal() { document.getElementById('editExamModal').classList.remove('active'); }
async function saveEditExam() {
  const name = document.getElementById('editExamName').value.trim();
  if (!name) return;

  const select = document.getElementById('editExamGroup');
  const customInput = document.getElementById('editExamGroupCustom');
  let baseName;
  if (select.value === '__custom__') {
    baseName = customInput.value.trim().toUpperCase() || name.toUpperCase();
  } else if (select.value) {
    baseName = select.value;
  } else {
    baseName = name.toUpperCase();
  }

  let examTimeRange = '';
  const sh = document.getElementById('editExamStartHour').value;
  const sm = document.getElementById('editExamStartMin').value;
  const sp = document.getElementById('editExamStartPeriod').value;
  const eh = document.getElementById('editExamEndHour').value;
  const em = document.getElementById('editExamEndMin').value;
  const ep = document.getElementById('editExamEndPeriod').value;

  if (sh && eh) {
    examTimeRange = `${sh}:${sm} ${sp} - ${eh}:${em} ${ep}`;
  }

  const examDate = document.getElementById('editExamDate').value || null;

  // Overlap warning
  if (examDate && examTimeRange) {
    try {
      const res = await fetch('/api/exams');
      const allExams = await res.json();
      const sameDayExams = allExams.filter(ex => !ex.isArchived && ex._id !== currentExam._id && ex.examDate && new Date(ex.examDate).toISOString().split('T')[0] === examDate && ex.examTimeRange);
      const parseT = (str) => { const m = (str||'').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if(!m) return null; let h=parseInt(m[1]); if(m[3].toUpperCase()==='PM'&&h!==12)h+=12; if(m[3].toUpperCase()==='AM'&&h===12)h=0; return h*60+parseInt(m[2]); };
      const overlaps = sameDayExams.filter(ex => {
        const p1 = examTimeRange.split('-').map(s=>s.trim()), p2 = ex.examTimeRange.split('-').map(s=>s.trim());
        const s1=parseT(p1[0]),e1=parseT(p1[1]),s2=parseT(p2[0]),e2=parseT(p2[1]);
        return s1!==null && e1!==null && s2!==null && e2!==null && s1<e2 && s2<e1;
      });
      if (overlaps.length > 0) {
        const names = overlaps.map(e => e.name).join(', ');
        if (!confirm(`⚠ Timing overlap detected!\n\nThis exam's timing overlaps with: ${names}\non ${examDate}.\n\nProceed anyway?`)) return;
      }
    } catch {}
  }

  await fetch(`/api/exams/${currentExam._id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      examDate,
      color: document.getElementById('editExamColor').value,
      baseName,
      examTimeRange
    })
  });
  closeEditExamModal();
  initDashboard();
}

// ─── Section Panel ───
function openSectionPanel() {
  const body = document.getElementById('sectionPanelBody');
  body.innerHTML = '';
  const sections = (currentExam && currentExam.sections) || [];
  if (sections.length === 0) {
    addSectionRow();
  } else {
    sections.forEach(s => addSectionRow(s));
  }
  document.getElementById('sectionPanel').classList.add('open');
  document.getElementById('sectionPanelOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSectionPanel() {
  document.getElementById('sectionPanel').classList.remove('open');
  document.getElementById('sectionPanelOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
let sectionCounter = 0;
function addSectionRow(data) {
  sectionCounter++;
  const defaultName = data ? data.name : `Section ${sectionCounter}`;
  // Preserve existing sectionId; generate a new one for brand-new rows
  const sectionId = (data && data.sectionId) ? data.sectionId : ('s' + Date.now() + Math.random().toString(36).slice(2, 6));
  const body = document.getElementById('sectionPanelBody');
  const row = document.createElement('div');
  row.className = 'section-row';
  row.dataset.sectionId = sectionId;
  row.innerHTML = `
    <div class="sr-name">
      <input type="text" placeholder="Section name" value="${defaultName}" style="background:transparent;border:none;color:var(--text-primary);font-size:.85rem;font-weight:600;outline:none;font-family:inherit" class="sr-name-input">
      <button class="sr-delete" onclick="removeSectionRow(this)">✕</button>
    </div>
    <div class="sr-fields">
      <div><label>Total Questions</label><input type="number" class="sr-total-q" placeholder="40" value="${data ? (data.totalQuestions || '') : ''}" oninput="calcMaxMarks(this)"></div>
      <div><label>+Correct</label><input type="number" class="sr-correct" placeholder="3" value="${data ? data.perCorrect : ''}" oninput="calcMaxMarks(this)"></div>
      <div><label>-Wrong</label><input type="number" class="sr-wrong" placeholder="-1" value="${data ? data.perWrong : ''}"></div>
      <div><label>Max Marks (auto)</label><input type="number" class="sr-max" placeholder="auto" value="${data ? data.maxMarks : ''}" readonly style="opacity:.7"></div>
      <div><label>Cutoff</label><input type="number" class="sr-cutoff" placeholder="—" value="${data && data.cutoff ? data.cutoff : ''}"></div>
    </div>`;
  body.appendChild(row);
}
function removeSectionRow(btn) {
  const row = btn.closest('.section-row');
  const sectionName = row.querySelector('.sr-name-input').value || 'this section';
  if (confirm(`Delete "${sectionName}"? This cannot be undone.`)) {
    row.style.transition = 'opacity .2s ease, transform .2s ease';
    row.style.opacity = '0';
    row.style.transform = 'translateX(20px)';
    setTimeout(() => row.remove(), 200);
  }
}
function calcMaxMarks(el) {
  const row = el.closest('.section-row');
  const q = Number(row.querySelector('.sr-total-q').value) || 0;
  const c = Number(row.querySelector('.sr-correct').value) || 0;
  row.querySelector('.sr-max').value = q * c;
}
async function saveSections() {
  const rows = document.querySelectorAll('#sectionPanelBody .section-row');
  const sections = [];
  rows.forEach((r, i) => {
    const name = r.querySelector('.sr-name-input').value.trim() || `Section ${i + 1}`;
    const totalQ = Number(r.querySelector('.sr-total-q').value) || 0;
    const perC = Number(r.querySelector('.sr-correct').value);
    const perW = Number(r.querySelector('.sr-wrong').value);
    const cutoff = Number(r.querySelector('.sr-cutoff').value) || 0;
    // Always include the stable sectionId so the server can match by ID
    const sectionId = r.dataset.sectionId || ('s' + Date.now() + Math.random().toString(36).slice(2, 6));
    sections.push({
      sectionId,
      name,
      maxMarks: totalQ * (perC || 1),
      totalQuestions: totalQ,
      perCorrect: isNaN(perC) ? 1 : perC,
      perWrong: isNaN(perW) ? 0 : perW,
      cutoff
    });
  });
  const resp = await fetch(`/api/exams/${currentExam._id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections })
  });
  if (resp.ok) {
    currentExam.sections = sections;
    closeSectionPanel();
    loadDashboardData();
    if (typeof loadMocks === 'function') loadMocks();
  } else {
    alert('Failed to save sections');
  }
}

// ─── Dashboard Data ───
async function loadDashboardData() {
  const examId = getExamId();
  try { const res = await fetch(`/api/exams/${examId}/mocks`); currentMocks = await res.json(); } catch { currentMocks = []; }
  updateStats();
  drawScoreChart();
  renderMockProgress();
  drawSectionAccuracyChart();
  renderChartOverlayButtons();
}

function updateStats() {
  const total = currentMocks.length;
  const attempted = currentMocks.filter(m => m.attempted).length;
  const fullyDone = currentMocks.filter(m => m.attempted && m.analyzeDone && m.reattemptDone).length;
  const sections = (currentExam && currentExam.sections) || [];
  const isFullMock = m => !sections.length || !m.sectionsAttempted || m.sectionsAttempted.length === sections.length;
  const scored = currentMocks.filter(m => m.totalScore !== null && m.totalScore !== undefined);
  const fullScored = scored.filter(isFullMock);
  const avg = fullScored.length > 0 ? Math.round(fullScored.reduce((s, m) => s + m.totalScore, 0) / fullScored.length) : null;
  const best = fullScored.length > 0 ? Math.max(...fullScored.map(m => m.totalScore)) : null;
  document.getElementById('statAttempted').textContent = `${attempted}/${total}`;
  document.getElementById('statFullyDone').textContent = `${fullyDone}/${total}`;
  document.getElementById('statAvg').textContent = avg !== null ? avg : '—';
  document.getElementById('statBest').textContent = best !== null ? best : '—';
}

// ─── Mock Progress ───
function renderMockProgress() {
  const container = document.getElementById('progressBars');
  const total = currentMocks.length || 1;
  const attempted = currentMocks.filter(m => m.attempted).length;
  const analyzed = currentMocks.filter(m => m.analyzeDone).length;
  const reattempted = currentMocks.filter(m => m.reattemptDone).length;
  const fullyDone = currentMocks.filter(m => m.attempted && m.analyzeDone && m.reattemptDone).length;

  const bars = [
    { label: 'Attempted', val: attempted, total: currentMocks.length, cls: 'pb-accent' },
    { label: 'Analyzed', val: analyzed, total: currentMocks.length, cls: 'pb-info' },
    { label: 'Reattempted', val: reattempted, total: currentMocks.length, cls: 'pb-success' },
    { label: 'Fully Complete', val: fullyDone, total: currentMocks.length, cls: 'pb-accent' }
  ];

  container.innerHTML = bars.map(b => `
    <div class="progress-bar-row">
      <div class="pb-label"><span>${b.label}</span><span>${b.val}/${b.total}</span></div>
      <div class="progress-bar-track"><div class="progress-bar-fill ${b.cls}" style="width:${(b.val / total * 100).toFixed(1)}%"></div></div>
    </div>`).join('');
}

// ─── Section Accuracy Bar Chart ───
function drawSectionAccuracyChart() {
  const sections = (currentExam && currentExam.sections) || [];
  const wrap = document.getElementById('sectionAccuracyChart');
  const canvas = document.getElementById('sectionAccuracyCanvas');
  if (!wrap || !canvas) return;
  const scored = currentMocks.filter(m => m.sectionScores && m.sectionScores.length && m.totalScore !== null);
  if (!sections.length || !scored.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth * 2;
  canvas.height = 240;
  ctx.scale(2, 2);
  const W = canvas.parentElement.clientWidth, H = 120;
  ctx.clearRect(0, 0, W, H);

  const sectionColors = ['#f5c518', '#58a6ff', '#3fb950', '#f06292', '#ce93d8', '#ff9a3c'];
  const barW = Math.min(30, (W - 40) / sections.length - 8);
  const gap = (W - 40 - barW * sections.length) / (sections.length + 1);

  sections.forEach((sec, i) => {
    let totalC = 0, totalW = 0;
    scored.forEach(m => {
      if (m.sectionScores[i] && !m.sectionScores[i]._skipped) {
        totalC += m.sectionScores[i].correct || 0;
        totalW += m.sectionScores[i].wrong || 0;
      }
    });
    const acc = (totalC + totalW) > 0 ? totalC / (totalC + totalW) : 0;
    const x = 20 + gap + i * (barW + gap);
    const barH = acc * (H - 30);

    ctx.fillStyle = sectionColors[i % sectionColors.length];
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.roundRect(x, H - 14 - barH, barW, barH, 3);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
    ctx.font = '8px Outfit,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sec.name.substring(0, 5), x + barW / 2, H - 4);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    ctx.font = '9px Outfit,sans-serif';
    ctx.fillText(Math.round(acc * 100) + '%', x + barW / 2, H - 18 - barH);
  });
}

// ─── Score Chart (Enhanced) ───
let chartMode = 'total'; // 'total' | 'percent' | 'sections'
// Overlay toggles for reference lines
let chartOverlays = { max: true, cutoff: true };
// Per-section visibility for Sections chart
let sectionVisibility = {};

function setChartMode(mode) {
  chartMode = mode;
  document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  renderChartOverlayButtons();
  drawScoreChart();
}

// Render dynamic toggle buttons below chart header
function renderChartOverlayButtons() {
  const wrap = document.getElementById('chartOverlayBtns');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (chartMode === 'total' || chartMode === 'percent') {
    const sections = (currentExam && currentExam.sections) || [];
    const maxMarksTotal = sections.reduce((s, sec) => s + (sec.maxMarks || 0), 0);
    const cutoff = sections.reduce((s, sec) => s + (sec.cutoff || 0), 0);
    if (maxMarksTotal > 0) {
      const b = document.createElement('button');
      b.className = 'chart-overlay-btn' + (chartOverlays.max ? ' active' : '');
      b.style.borderColor = 'rgba(180,180,180,0.4)';
      b.innerHTML = `<span style="display:inline-block;width:10px;height:2px;border-top:2px dashed rgba(160,160,160,0.7);margin-right:4px;vertical-align:middle;"></span>Max`;
      b.onclick = () => { chartOverlays.max = !chartOverlays.max; renderChartOverlayButtons(); drawScoreChart(); };
      if (!chartOverlays.max) b.style.opacity = '0.4';
      wrap.appendChild(b);
    }
    if (cutoff > 0) {
      const b = document.createElement('button');
      b.className = 'chart-overlay-btn' + (chartOverlays.cutoff ? ' active' : '');
      b.style.borderColor = 'rgba(63,185,80,0.4)';
      b.innerHTML = `<span style="display:inline-block;width:10px;height:2px;border-top:2px dashed rgba(63,185,80,0.7);margin-right:4px;vertical-align:middle;"></span>Cutoff`;
      b.onclick = () => { chartOverlays.cutoff = !chartOverlays.cutoff; renderChartOverlayButtons(); drawScoreChart(); };
      if (!chartOverlays.cutoff) b.style.opacity = '0.4';
      wrap.appendChild(b);
    }
  } else if (chartMode === 'sections') {
    const sections = (currentExam && currentExam.sections) || [];
    const sectionColors = ['#f5c518', '#58a6ff', '#3fb950', '#f06292', '#ce93d8', '#ff9a3c'];
    sections.forEach((sec, i) => {
      if (!(sec.name in sectionVisibility)) sectionVisibility[sec.name] = true;
      const color = sectionColors[i % sectionColors.length];
      const b = document.createElement('button');
      b.className = 'chart-overlay-btn' + (sectionVisibility[sec.name] ? ' active' : '');
      b.style.borderColor = color + '66';
      b.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px;vertical-align:middle;"></span>${sec.name}`;
      b.onclick = () => { sectionVisibility[sec.name] = !sectionVisibility[sec.name]; renderChartOverlayButtons(); drawScoreChart(); };
      if (!sectionVisibility[sec.name]) b.style.opacity = '0.4';
      wrap.appendChild(b);
    });
  }
}

function drawScoreChart() {
  const canvas = document.getElementById('scoreChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth * 2;
  canvas.height = wrap.clientHeight * 2;
  ctx.scale(2, 2);
  const W = wrap.clientWidth, H = wrap.clientHeight;
  ctx.clearRect(0, 0, W, H);

  const style = getComputedStyle(document.documentElement);
  const borderColor = style.getPropertyValue('--border').trim();
  const textColor = style.getPropertyValue('--text-muted').trim();
  const accentColor = style.getPropertyValue('--accent').trim();
  const pad = { top: 24, right: 20, bottom: 40, left: 50 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;

  const allMocks = [...currentMocks].sort((a, b) => a.mockNumber - b.mockNumber);
  const scored = allMocks.filter(m => m.totalScore !== null && m.totalScore !== undefined);
  const sections = (currentExam && currentExam.sections) || [];
  const isFullMock = m => !sections.length || !m.sectionsAttempted || m.sectionsAttempted.length === sections.length;
  const getMockCutoff = (mock) => {
    const attempted = mock.sectionsAttempted || sections.map((_, i) => i);
    return attempted.reduce((sum, idx) => sum + (sections[idx] ? (sections[idx].cutoff || 0) : 0), 0);
  };

  ctx.strokeStyle = borderColor; ctx.lineWidth = 0.5;
  ctx.font = '11px Outfit,sans-serif'; ctx.fillStyle = textColor;

  if (chartMode === 'sections') {
    drawSectionChart(ctx, W, H, pad, cw, ch, scored, allMocks, borderColor, textColor);
    return;
  }

  if (chartMode === 'total') {
    drawBarChart(ctx, canvas, W, H, pad, cw, ch, allMocks, style, textColor, borderColor, accentColor, sections, isFullMock, getMockCutoff);
    return;
  }

  // ── % mode: line chart, per-mock cutoff ticks (not connected) ──────────────
  const getVal = (m) => {
    const mx = m.maxScore || 0;
    return mx > 0 ? (m.totalScore / mx) * 100 : 0;
  };
  const maxScore = 100;

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.fillText(Math.round(100 - 25 * i) + '%', pad.left - 36, y + 4);
  }
  // X labels
  allMocks.forEach((m, i) => {
    const x = pad.left + (cw / Math.max(allMocks.length - 1, 1)) * i;
    ctx.fillStyle = textColor; ctx.font = '11px Outfit,sans-serif';
    ctx.fillText(`M${m.mockNumber}`, x - 8, H - pad.bottom + 20);
  });

  if (scored.length < 2) {
    ctx.fillStyle = textColor; ctx.font = '12px Outfit,sans-serif';
    ctx.fillText('Log scores to see progression', W / 2 - 90, H / 2);
    return;
  }

  const points = scored.map(m => {
    const mockIdx = allMocks.findIndex(am => am._id === m._id);
    const x = pad.left + (cw / Math.max(allMocks.length - 1, 1)) * mockIdx;
    const y = pad.top + ch - (getVal(m) / maxScore) * ch;
    return { x, y, mock: m, isPartial: !isFullMock(m) };
  });

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
  grad.addColorStop(0, accentColor + '40');
  grad.addColorStop(1, accentColor + '05');
  ctx.beginPath();
  ctx.moveTo(points[0].x, pad.top + ch);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, pad.top + ch);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.strokeStyle = accentColor; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.stroke();

  // Dots
  const bgColor = style.getPropertyValue('--bg-primary').trim();
  points.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    if (p.isPartial) {
      ctx.fillStyle = bgColor; ctx.fill();
      ctx.strokeStyle = accentColor; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.fillStyle = accentColor; ctx.fill();
      ctx.strokeStyle = bgColor; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.fillStyle = textColor; ctx.font = '11px Outfit,sans-serif';
    ctx.fillText(Math.round(getVal(p.mock)) + '%' + (p.isPartial ? '◦' : ''), p.x - 12, p.y - 12);
  });

  // Per-mock cutoff ticks: isolated horizontal dashes at each mock's cutoff% — NO connecting line
  if (chartOverlays.cutoff) {
    const successColor = style.getPropertyValue('--success').trim();
    const tickW = Math.min(cw / Math.max(allMocks.length, 1) * 0.5, 32);
    allMocks.forEach((m, i) => {
      const cutoff = getMockCutoff(m);
      const mockMax = m.maxScore || 0;
      if (!cutoff || !mockMax) return;
      const cutPct = (cutoff / mockMax) * 100;
      const x = pad.left + (cw / Math.max(allMocks.length - 1, 1)) * i;
      const y = pad.top + ch - (cutPct / maxScore) * ch;
      ctx.beginPath();
      ctx.strokeStyle = successColor;
      ctx.lineWidth = 2.5;
      ctx.moveTo(x - tickW / 2, y); ctx.lineTo(x + tickW / 2, y);
      ctx.stroke();
    });
  }

  setupChartTooltip(canvas, wrap, points, []);
}

// ── Bar chart for Total mode ─────────────────────────────────────────────────
function drawBarChart(ctx, canvas, W, H, pad, cw, ch, allMocks, style, textColor, borderColor, accentColor, sections, isFullMock, getMockCutoff) {
  const successColor = style.getPropertyValue('--success').trim();
  const bgPrimary = style.getPropertyValue('--bg-primary').trim();

  // Y axis scale: max of all mock maxScores
  const allMaxScores = allMocks.map(m => m.maxScore || 0).filter(v => v > 0);
  const allScores = allMocks.filter(m => m.totalScore != null).map(m => m.totalScore);
  const topVal = Math.max(...allMaxScores, ...allScores, 10) * 1.08;

  // Y axis grid + labels
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath(); ctx.strokeStyle = borderColor; ctx.lineWidth = 0.5;
    ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = '11px Outfit,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(topVal - (topVal / 4) * i), pad.left - 6, y + 4);
  }
  ctx.textAlign = 'left';

  const n = allMocks.length;
  const slotW = n > 0 ? cw / n : cw;
  const barW = Math.min(slotW * 0.55, 44);

  const hoverZones = []; // for tooltip hit detection

  allMocks.forEach((m, i) => {
    const cx = pad.left + slotW * i + slotW / 2;
    const barX = cx - barW / 2;
    const mockMax = m.maxScore || 0;
    const score = m.totalScore != null ? m.totalScore : null;
    const cutoff = getMockCutoff(m);
    const isPartial = !isFullMock(m);

    // X label
    ctx.fillStyle = textColor; ctx.font = '11px Outfit,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`M${m.mockNumber}`, cx, H - pad.bottom + 18);

    // ── Max ceiling bar (background) ──────────────────────────────────────
    if (mockMax > 0 && chartOverlays.max) {
      const maxH = (mockMax / topVal) * ch;
      const maxY = pad.top + ch - maxH;
      // Very faint gradient for max ghost bar
      const maxGrad = ctx.createLinearGradient(0, maxY, 0, maxY + maxH);
      maxGrad.addColorStop(0, 'rgba(150,150,150,0.08)');
      maxGrad.addColorStop(1, 'rgba(150,150,150,0.01)');
      ctx.fillStyle = maxGrad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(barX, maxY, barW, maxH, [6, 6, 2, 2]);
      else ctx.rect(barX, maxY, barW, maxH);
      ctx.fill();
      // Dashed top edge = max mark
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(180,180,180,0.6)';
      ctx.lineWidth = 1.5;
      ctx.moveTo(barX + 2, maxY); ctx.lineTo(barX + barW - 2, maxY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Score bar ─────────────────────────────────────────────────────────
    if (score !== null) {
      const scoreH = Math.max((score / topVal) * ch, score > 0 ? 3 : 1);
      const scoreY = pad.top + ch - scoreH;

      // Rich Gradient fill
      const grad = ctx.createLinearGradient(0, scoreY, 0, scoreY + scoreH);
      if (isPartial) {
        grad.addColorStop(0, accentColor + 'd0');
        grad.addColorStop(1, accentColor + '50');
      } else {
        grad.addColorStop(0, accentColor);
        grad.addColorStop(1, accentColor + '90');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(barX, scoreY, barW, scoreH, [6, 6, 2, 2]);
      else ctx.rect(barX, scoreY, barW, scoreH);
      ctx.fill();

      // Border
      ctx.beginPath();
      if (isPartial) {
        ctx.setLineDash([4, 2]);
        ctx.strokeStyle = accentColor;
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; // Subtle dark border for full mock
      }
      ctx.lineWidth = 1.5;
      if (ctx.roundRect) ctx.roundRect(barX, scoreY, barW, scoreH, [6, 6, 2, 2]);
      else ctx.rect(barX, scoreY, barW, scoreH);
      ctx.stroke();
      if (isPartial) ctx.setLineDash([]);

      // Highlight top edge
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.moveTo(barX + 2, scoreY + 1); ctx.lineTo(barX + barW - 2, scoreY + 1);
      ctx.stroke();

      // Score label above bar
      ctx.fillStyle = textColor; ctx.font = 'bold 11px Outfit,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(score, cx, scoreY - 6);

      hoverZones.push({ barX, barW, cx, mock: m, mockMax, cutoff, isPartial, scoreY });
    }

    // ── Cutoff tick ───────────────────────────────────────────────────────
    if (cutoff > 0 && chartOverlays.cutoff) {
      const cutY = pad.top + ch - (cutoff / topVal) * ch;
      // Extended tick with small caps, slightly glowing
      ctx.beginPath();
      ctx.strokeStyle = successColor;
      ctx.lineWidth = 2.5;
      ctx.moveTo(barX - 6, cutY); ctx.lineTo(barX + barW + 6, cutY);
      ctx.stroke();
      
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.moveTo(barX - 6, cutY + 1.5); ctx.lineTo(barX + barW + 6, cutY + 1.5);
      ctx.stroke();

      // Left cap
      ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = successColor;
      ctx.moveTo(barX - 5, cutY - 4); ctx.lineTo(barX - 5, cutY + 4);
      ctx.stroke();
      // Right cap
      ctx.beginPath();
      ctx.moveTo(barX + barW + 5, cutY - 4); ctx.lineTo(barX + barW + 5, cutY + 4);
      ctx.stroke();
    }
  });

  ctx.textAlign = 'left';

  // Tooltip
  const tooltip = document.getElementById('chartTooltip');
  if (!tooltip) return;

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width / 2);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height / 2);
    const wRect = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : rect;

    // Use hit detection logic
    const hit = hoverZones.find(z => mx >= z.barX - 10 && mx <= z.barX + z.barW + 10);
    if (hit) {
      const m = hit.mock;
      const attempted = m.sectionsAttempted || sections.map((_, i) => i);
      const sectionNames = attempted.map(idx => sections[idx] ? sections[idx].name : '').filter(Boolean);
      let html = `<strong>${m.mockName || 'Mock ' + m.mockNumber}</strong>`;
      html += `<div style="margin-top:4px;">Score: <strong style="color:${accentColor}">${m.totalScore}</strong>${hit.mockMax ? ' / ' + hit.mockMax : ''}</div>`;
      if (hit.cutoff) html += `<div style="color:${successColor};">Cutoff: ${hit.cutoff}</div>`;
      if (hit.isPartial && sectionNames.length) html += `<div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;">${sectionNames.join(' + ')} only</div>`;
      if (m.platform) html += `<div class="ct-platform">${m.platform}</div>`;
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - wRect.left + 14) + 'px';
      tooltip.style.top = (e.clientY - wRect.top - 10) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}

function drawSectionChart(ctx, W, H, pad, cw, ch, scored, allMocks, borderColor, textColor) {
  const sections = (currentExam && currentExam.sections) || [];
  if (!sections.length) return;
  const sectionColors = ['#f5c518', '#58a6ff', '#3fb950', '#f06292', '#ce93d8', '#ff9a3c'];

  // Init visibility for new sections
  sections.forEach(sec => { if (!(sec.name in sectionVisibility)) sectionVisibility[sec.name] = true; });

  // Skip legend on canvas — buttons below handle it now
  const chartPad = { ...pad, top: pad.top + 4 };
  const chartH = H - chartPad.top - chartPad.bottom;

  // Y axis: percentage of max marks
  for (let i = 0; i <= 4; i++) {
    const y = chartPad.top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(chartPad.left, y); ctx.lineTo(W - chartPad.right, y); ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '11px Outfit,sans-serif';
    ctx.fillText(Math.round(100 - 25 * i) + '%', chartPad.left - 36, y + 4);
  }

  allMocks.forEach((m, i) => {
    const x = chartPad.left + (cw / Math.max(allMocks.length - 1, 1)) * i;
    ctx.fillStyle = textColor;
    ctx.font = '11px Outfit,sans-serif';
    ctx.fillText(`M${m.mockNumber}`, x - 8, H - chartPad.bottom + 20);
  });

  if (scored.length < 2) {
    ctx.fillStyle = textColor; ctx.font = '12px Outfit,sans-serif';
    ctx.fillText('Need 2+ scored mocks', W / 2 - 70, H / 2);
    return;
  }

  // Cutoff lines as hover-able refLines (only for visible sections)
  const refLines = [];
  sections.forEach((sec, si) => {
    if (!sectionVisibility[sec.name]) return;
    if (!sec.cutoff || !sec.maxMarks) return;
    const cutPct = (sec.cutoff / sec.maxMarks) * 100;
    const cutY = chartPad.top + chartH - (cutPct / 100) * chartH;
    const color = sectionColors[si % sectionColors.length];
    ctx.beginPath();
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.moveTo(chartPad.left, cutY);
    ctx.lineTo(W - chartPad.right, cutY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    refLines.push({ y: cutY, label: `${sec.name} cutoff: ${sec.cutoff}/${sec.maxMarks}`, color });
  });

  // Collect all section point data for tooltip
  const allSectionPoints = [];

  sections.forEach((sec, si) => {
    if (!sectionVisibility[sec.name]) return;  // skip hidden
    const color = sectionColors[si % sectionColors.length];
    const points = [];
    scored.forEach(m => {
      if (m.sectionScores && m.sectionScores[si] && !m.sectionScores[si]._skipped) {
        const ss = m.sectionScores[si];
        const score = (ss.correct * (ss.perCorrect || 1)) + (ss.wrong * (ss.perWrong || 0));
        const pct = sec.maxMarks ? (score / sec.maxMarks) * 100 : 0;
        const mockIdx = allMocks.findIndex(am => am._id === m._id);
        const x = chartPad.left + (cw / Math.max(allMocks.length - 1, 1)) * mockIdx;
        const y = chartPad.top + chartH - (pct / 100) * chartH;
        points.push({ x, y, pct });
        allSectionPoints.push({ x, y, pct: Math.round(pct), secName: sec.name, secColor: color, mockNum: m.mockNumber, score: Math.round(score), maxMarks: sec.maxMarks });
      }
    });

    if (points.length >= 2) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.9;
      points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    points.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    });
  });

  // Section chart tooltip on hover (shows all sections at that mock + ref lines)
  setupSectionChartTooltip(document.getElementById('scoreChart'), document.querySelector('.chart-canvas-wrap'), allSectionPoints, refLines);
}

function setupSectionChartTooltip(canvas, wrap, allPoints, refLines) {
  refLines = refLines || [];
  const tooltip = document.getElementById('chartTooltip');
  if (!tooltip) return;

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width / 2);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height / 2);
    const wRect = wrap.getBoundingClientRect();

    // Check reference lines first (hover within 10px of line)
    const nearLine = refLines.find(rl => Math.abs(rl.y - my) < 10);
    if (nearLine) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - wRect.left + 14) + 'px';
      tooltip.style.top = (e.clientY - wRect.top - 10) + 'px';
      tooltip.innerHTML = `<span style="color:${nearLine.color};font-weight:600;">${nearLine.label}</span>`;
      return;
    }

    // Find all points near mouse X (same mock column)
    let closestX = null, minDistX = 40;
    allPoints.forEach(p => {
      const dx = Math.abs(p.x - mx);
      if (dx < minDistX) { minDistX = dx; closestX = p.x; }
    });

    if (closestX !== null) {
      const nearPoints = allPoints.filter(p => Math.abs(p.x - closestX) < 10);
      if (nearPoints.length) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX - wRect.left + 14) + 'px';
        tooltip.style.top = (e.clientY - wRect.top - 10) + 'px';
        tooltip.innerHTML = `<strong>Mock ${nearPoints[0].mockNum}</strong>` +
          nearPoints.map(p => `<div style="display:flex;align-items:center;gap:6px;margin-top:3px;"><span style="width:8px;height:8px;border-radius:50%;background:${p.secColor};flex-shrink:0;"></span><span>${p.secName}: ${p.score}/${p.maxMarks} (${p.pct}%)</span></div>`).join('');
        return;
      }
    }
    tooltip.style.display = 'none';
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}

function setupChartTooltip(canvas, wrap, points, refPolylines) {
  refPolylines = refPolylines || [];
  const tooltip = document.getElementById('chartTooltip');
  if (!tooltip) return;

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width / 2);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height / 2);
    const wRect = wrap.getBoundingClientRect();

    // Check each reference polyline: find nearest point in polyline by x-column proximity
    // then check if cursor y is within ~10px of that point's y
    for (const rl of refPolylines) {
      // Find the point in this polyline whose x is closest to cursor
      let nearPt = null, minDx = 40;
      rl.pts.forEach(p => {
        const dx = Math.abs(p.x - mx);
        if (dx < minDx) { minDx = dx; nearPt = p; }
      });
      if (nearPt && Math.abs(nearPt.y - my) < 12) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX - wRect.left + 12) + 'px';
        tooltip.style.top = (e.clientY - wRect.top - 10) + 'px';
        tooltip.innerHTML = `<span style="color:${rl.color};font-weight:600;">${rl.getLabel(nearPt)}</span>`;
        return;
      }
    }

    let closest = null, minDist = 30;
    points.forEach(p => {
      const d = Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2);
      if (d < minDist) { minDist = d; closest = p; }
    });

    if (closest) {
      const m = closest.mock;
      const isPartial = closest.isPartial;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - wRect.left + 12) + 'px';
      tooltip.style.top = (e.clientY - wRect.top - 10) + 'px';
      const partialTag = isPartial ? `<div style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">Partial mock (${m.sectionsAttempted ? m.sectionsAttempted.length : '?'} sections)</div>` : '';
      tooltip.innerHTML = `<strong>${m.mockName || 'Mock ' + m.mockNumber}</strong>
        Score: ${m.totalScore}${m.maxScore ? ' / ' + m.maxScore : ''}
        ${partialTag}
        ${m.platform ? `<div class="ct-platform">${m.platform}</div>` : ''}`;
    } else {
      tooltip.style.display = 'none';
    }
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}

function getTargetDateStr() {
  const now = new Date();
  let targetDate = new Date(now);
  // Only roll over to next day very late at night (11 PM+)
  if (now.getHours() >= 23) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  return targetDate.getFullYear() + '-' + String(targetDate.getMonth() + 1).padStart(2, '0') + '-' + String(targetDate.getDate()).padStart(2, '0');
}

async function addGoal() {
  const input = document.getElementById('goalInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  
  try {
    await fetch(`/api/exams/${getExamId()}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, date: getTargetDateStr() })
    });
    input.value = '';
    loadGoals();
  } catch {}
}

// ─── Goals ───
async function loadGoals() {
  try {
    const now = new Date();
    const dk = getTargetDateStr();
    const isNextDay = now.getHours() >= 23;
    
    const res = await fetch(`/api/exams/${getExamId()}/goals?date=${dk}`);
    const examGoals = await res.json();
    
    // Also fetch all pending desk goals
    let deskGoals = [];
    try {
      const dRes = await fetch('/api/desk/goals?excludeArchived=true');
      deskGoals = (await dRes.json()).map(g => ({ ...g, _isDesk: true }));
    } catch {}
    
    renderGoals([...examGoals, ...deskGoals], isNextDay);
  } catch { renderGoals([], false); }
}

function renderGoals(goals, isNextDay) {
  const sidebarList = document.getElementById('goalList');
  const pageList = document.getElementById('pageGoalList');
  const examGoals = goals.filter(g => !g._isDesk);
  const completed = examGoals.filter(g => g.completed).length;
  
  // Update sidebar heading
  const sidebarHeading = document.querySelector('.sidebar-goals h3');
  if (sidebarHeading) {
    sidebarHeading.innerHTML = `${isNextDay ? "TOMORROW'S" : "TODAY'S"} GOALS <span id="goalCount">${completed}/${examGoals.length}</span>`;
  }

  const render = (el, sidebar) => {
    if (!el) return;
    el.innerHTML = '';
    // Show all uncompleted goals (exam + desk) in both views
    const displayGoals = sidebar ? goals.filter(g => !g.completed) : goals.filter(g => !g.completed);
    if (!displayGoals.length) { 
      el.innerHTML = `<div style="font-size:.82rem;color:var(--text-muted);padding:10px 0;">${sidebar && goals.length ? 'All caught up!' : 'No goals yet'}</div>`; 
      return; 
    }
    displayGoals.forEach((g, idx) => {
      const d = document.createElement('div');
      d.className = `goal-item${g.completed ? ' completed' : ''}`;
      d.dataset.goalId = g._id;
      d.dataset.isDesk = g._isDesk ? '1' : '0';
      let deskBadge = '';
      let tipParts = [g.text];
      if (g._isDesk) {
        const deskProfile = (typeof deskProfiles !== 'undefined' && deskProfiles.find(p => p._id === g.profileId));
        const deskColor = deskProfile?.color || '#a78bfa';
        const deskName = deskProfile?.name || 'Desk';
        deskBadge = `<span class="desk-badge" style="background-color: ${deskColor}26; color: ${deskColor}; border: 1px solid ${deskColor}40;">Desk</span>`;
        tipParts.unshift(`[${deskName}]`);
      }
      if (g.time) {
        const timePart = g.endTime ? `${g.time} – ${g.endTime}` : g.time;
        tipParts.unshift(timePart);
      }
      const tooltip = tipParts.join(' ');
      const toggleFn = g._isDesk ? `toggleDeskGoalFromSidebar('${g._id}')` : `toggleGoal('${g._id}')`;

      if (sidebar) {
        d.draggable = true;
        d.dataset.order = idx;
        d.innerHTML = `<input type="checkbox" ${g.completed ? 'checked' : ''} onchange="${toggleFn}"><span class="goal-text" title="${tooltip.replace(/"/g, '&quot;')}">${deskBadge}${g.text}</span>`;
      } else {
        d.innerHTML = `<input type="checkbox" ${g.completed ? 'checked' : ''} onchange="${toggleFn}"><span class="goal-text" title="${tooltip.replace(/"/g, '&quot;')}">${deskBadge}${g.text}</span><button class="goal-delete" onclick="deleteGoal('${g._id}')">✕</button>`;
      }
      el.appendChild(d);
    });

    // Set up drag-to-reorder on sidebar
    if (sidebar && displayGoals.length > 1) {
      el.querySelectorAll('.goal-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          item.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.dataset.goalId);
        });
        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
        });
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = el.querySelector('.goal-item.dragging');
        if (!dragging) return;
        const afterElement = _getSidebarDragAfter(el, e.clientY);
        if (afterElement == null) {
          el.appendChild(dragging);
        } else {
          el.insertBefore(dragging, afterElement);
        }
      });

      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        // Collect new order, separate exam and desk goals
        const items = [...el.querySelectorAll('.goal-item')];
        const examUpdates = [];
        const deskUpdates = [];
        items.forEach((item, i) => {
          if (item.dataset.isDesk === '1') {
            deskUpdates.push({ id: item.dataset.goalId, order: i });
          } else {
            examUpdates.push({ id: item.dataset.goalId, order: i });
          }
        });
        try {
          if (examUpdates.length) {
            await fetch(`/api/exams/${getExamId()}/goals/reorder`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: examUpdates })
            });
          }
          if (deskUpdates.length) {
            await fetch('/api/desk/goals/action/reorder', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: deskUpdates })
            });
          }
        } catch (err) { console.error('Failed to reorder sidebar goals', err); }
      });
    }
  };
  render(sidebarList, true);
  render(pageList, false);
}

function _getSidebarDragAfter(container, y) {
  const items = [...container.querySelectorAll('.goal-item:not(.dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}
// Toggle desk goal from sidebar
async function toggleDeskGoalFromSidebar(id) {
  try { await fetch(`/api/desk/goals/${id}`, { method: 'PUT' }); } catch {}
  loadGoals();
}
async function addGoalPage() {
  const input = document.getElementById('pageGoalInput');
  const text = input.value.trim();
  if (!text) return;
  await fetch(`/api/exams/${getExamId()}/goals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  input.value = '';
  loadGoals();
}
async function addGoal() { addGoalPage(); }
async function toggleGoal(id) { await fetch(`/api/goals/${id}`, { method: 'PUT' }); loadGoals(); }
async function deleteGoal(id) { await fetch(`/api/goals/${id}`, { method: 'DELETE' }); loadGoals(); }

window.addEventListener('resize', () => { drawScoreChart(); });
initDashboard();
