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
}

// ─── Data ───
let deleteTargetId = null;
let batchEditTargetId = null;
let archiveTargetId = null;
let archiveMode = 'archive'; // 'archive' or 'unarchive'
let isProcessing = false;
let archivedSuggestions = [];
let selectedSuggestion = null;
let archivesVisible = false;
const expandedYears = new Set();

async function loadExams() {
  try {
    const res = await fetch('/api/exams');
    const exams = await res.json();
    renderExams(exams);
  } catch (err) {
    document.getElementById('examGrid').innerHTML = '<p style="color:var(--danger);">Failed to load exams. Is the server running?</p>';
  }
}

function renderExams(exams) {
  const grid = document.getElementById('examGrid');
  const archivesContainer = document.getElementById('archivesContainer');
  const archivesWrap = document.getElementById('archivedExamsWrap');
  
  grid.innerHTML = '';
  if (archivesWrap) archivesWrap.innerHTML = '';
  
  const activeExams = [];
  // Group archived by year → baseName → array of exams
  const archivedByYear = {};
  
  exams.forEach(exam => {
    if (exam.isArchived) {
      const year = exam.examYear || new Date().getFullYear().toString();
      const baseName = exam.baseName || exam.name;
      if (!archivedByYear[year]) archivedByYear[year] = {};
      if (!archivedByYear[year][baseName]) archivedByYear[year][baseName] = [];
      archivedByYear[year][baseName].push(exam);
    } else {
      activeExams.push(exam);
    }
  });

  // Sort active exams: by date ascending (nearest first), then time if same date, dateless at end
  activeExams.sort((a, b) => {
    if (!a.examDate && !b.examDate) return 0;
    if (!a.examDate) return 1;
    if (!b.examDate) return -1;
    const da = new Date(a.examDate).getTime(), db = new Date(b.examDate).getTime();
    if (da !== db) return da - db;
    // Same date — sort by start time
    const parseStart = (tr) => {
      const m = (tr || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!m) return 9999;
      let h = parseInt(m[1]);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return h * 60 + parseInt(m[2]);
    };
    return parseStart(a.examTimeRange) - parseStart(b.examTimeRange);
  });

  // Render active exam cards
  activeExams.forEach(exam => {
    grid.appendChild(createExamCard(exam, false));
  });

  // Add Exam card
  const addCard = document.createElement('div');
  addCard.className = 'add-exam-card';
  addCard.onclick = openModal;
  addCard.innerHTML = `<div class="plus">+</div><div>Add Exam</div>`;
  grid.appendChild(addCard);

  // Render archives section
  const years = Object.keys(archivedByYear).sort((a, b) => b.localeCompare(a));
  const hasArchives = years.length > 0;

  if (archivesContainer) {
    if (hasArchives) {
      // Always show the toggle button area
      archivesContainer.style.display = 'block';

      // Show/hide content based on archivesVisible state
      if (archivesVisible) {
        years.forEach(year => {
          const yearSection = document.createElement('div');
          yearSection.className = 'archive-year-section';

          const isExpanded = expandedYears.has(year);

          const yearHeader = document.createElement('div');
          yearHeader.className = `archive-year-header ${isExpanded ? 'expanded' : ''}`;
          yearHeader.innerHTML = `
            <span class="archive-year-badge">
              <svg class="archive-chevron" viewBox="0 0 24 24" width="14" height="14"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              ${year}
            </span>
            <span class="archive-year-count">${Object.values(archivedByYear[year]).flat().length} exams</span>`;
          yearHeader.onclick = () => toggleYear(year);
          yearSection.appendChild(yearHeader);

          const yearContent = document.createElement('div');
          yearContent.className = `archive-year-content ${isExpanded ? 'expanded' : ''}`;

          const baseNames = Object.keys(archivedByYear[year]).sort();
          baseNames.forEach(baseName => {
            const group = archivedByYear[year][baseName];

            // Sub-header for base name if multiple names exist
            if (baseNames.length > 1 || group.length > 1) {
              const nameHeader = document.createElement('div');
              nameHeader.className = 'archive-name-header';
              nameHeader.textContent = baseName;
              yearContent.appendChild(nameHeader);
            }

            const batchGrid = document.createElement('div');
            batchGrid.className = 'exam-grid';
            
            // Sort by batch label
            group.sort((a, b) => {
              const aNum = parseInt((a.batchLabel || '').replace(/\D/g, '')) || 0;
              const bNum = parseInt((b.batchLabel || '').replace(/\D/g, '')) || 0;
              return aNum - bNum;
            });

            group.forEach(exam => {
              batchGrid.appendChild(createExamCard(exam, true));
            });
            yearContent.appendChild(batchGrid);
          });

          yearSection.appendChild(yearContent);
          archivesWrap.appendChild(yearSection);
        });
      }
    } else {
      archivesContainer.style.display = 'none';
    }
  }

  // Update toggle button text
  const toggleBtn = document.getElementById('archivesToggleBtn');
  if (toggleBtn) {
    if (!hasArchives) {
      toggleBtn.style.display = 'none';
    } else {
      toggleBtn.style.display = '';
      const count = exams.filter(e => e.isArchived).length;
      toggleBtn.innerHTML = archivesVisible
        ? `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M19 9l-7 7-7-7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> Hide Archives (${count})`
        : `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> Show Archives (${count})`;
    }
  }
}

function createExamCard(exam, isArchived) {
  const card = document.createElement('div');
  card.className = `exam-card${isArchived ? ' archived' : ''}`;
  card.style.setProperty('--exam-color', exam.color);
  card.onclick = () => window.location.href = `/dashboard?exam=${exam._id}`;
  const dateStr = exam.examDate ? new Date(exam.examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set';
  
  const batchLabel = isArchived && exam.batchLabel ? exam.batchLabel : '';
  
  card.innerHTML = `
    <div class="exam-card-actions">
      ${!isArchived ? `<button class="archive-btn" onclick="event.stopPropagation(); openArchiveModal('${exam._id}', 'archive')" title="Archive Exam">⚑</button>` : ''}
      ${isArchived ? `<button class="unarchive-btn" onclick="event.stopPropagation(); openArchiveModal('${exam._id}', 'unarchive')" title="Restore to Active">↩</button>` : ''}
      ${isArchived ? `<button class="batch-edit-btn" onclick="event.stopPropagation(); openBatchNameModal('${exam._id}', '${(exam.batchLabel || '').replace(/'/g, "\\'")}')" title="Edit Batch Label">✎</button>` : ''}
      <button class="delete-btn" onclick="event.stopPropagation(); openDeleteModal('${exam._id}')" title="Delete Exam">✕</button>
    </div>
    <div class="exam-name">${exam.name}</div>
    ${batchLabel ? `<div class="exam-batch-label">${batchLabel}</div>` : ''}
    <div class="exam-date">${dateStr}</div>
  `;
  return card;
}

// ─── Archives Toggle ───
function toggleArchives() {
  archivesVisible = !archivesVisible;
  loadExams();
}

function toggleYear(year) {
  if (expandedYears.has(year)) {
    expandedYears.delete(year);
  } else {
    expandedYears.add(year);
  }
  loadExams();
}

// ─── Modals ───
async function openModal() {
  // Set min date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('examDate').setAttribute('min', today);

  // Load archived exam suggestions
  try {
    const res = await fetch('/api/archived-exam-names');
    archivedSuggestions = await res.json();
  } catch { archivedSuggestions = []; }

  const suggestionsContainer = document.getElementById('examSuggestions');
  const chipsContainer = document.getElementById('suggestionsChips');
  
  if (archivedSuggestions.length > 0) {
    suggestionsContainer.style.display = '';
    chipsContainer.innerHTML = '';
    archivedSuggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      chip.style.setProperty('--chip-color', s.color);
      chip.innerHTML = `<span class="chip-dot" style="background:${s.color}"></span>${s.baseName}`;
      chip.onclick = () => selectSuggestion(s);
      chipsContainer.appendChild(chip);
    });
  } else {
    suggestionsContainer.style.display = 'none';
  }

  selectedSuggestion = null;
  document.getElementById('examBaseName').value = '';
  document.getElementById('addModal').classList.add('active');
  document.getElementById('examName').focus();
}

function selectSuggestion(s) {
  selectedSuggestion = s;
  document.getElementById('examName').value = s.baseName;
  document.getElementById('examColor').value = s.color;
  document.getElementById('examBaseName').value = s.baseName;

  // Highlight the selected chip
  document.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
}

function closeModal() {
  document.getElementById('addModal').classList.remove('active');
  document.getElementById('examName').value = '';
  document.getElementById('examDate').value = '';
  document.getElementById('examColor').value = '#f5c518';
  document.getElementById('examBaseName').value = '';
  selectedSuggestion = null;
  // Remove chip selection
  document.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('selected'));
}

function openDeleteModal(id) {
  deleteTargetId = id;
  // Find the exam name to display
  const cards = document.querySelectorAll('.exam-card');
  let examName = 'this exam';
  cards.forEach(card => {
    const nameEl = card.querySelector('.exam-name');
    if (nameEl && card.querySelector(`.delete-btn[onclick*="'${id}'"]`)) examName = nameEl.textContent;
  });
  document.getElementById('deleteExamName').textContent = examName;
  document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
  deleteTargetId = null;
  document.getElementById('deleteModal').classList.remove('active');
}

function openBatchNameModal(id, currentLabel) {
  batchEditTargetId = id;
  document.getElementById('batchNameInput').value = currentLabel || '';
  document.getElementById('batchNameModal').classList.add('active');
  document.getElementById('batchNameInput').focus();
}

function closeBatchNameModal() {
  batchEditTargetId = null;
  document.getElementById('batchNameModal').classList.remove('active');
}

async function saveBatchName() {
  if (!batchEditTargetId) return;
  const batchLabel = document.getElementById('batchNameInput').value.trim();
  if (!batchLabel) return;
  await fetch(`/api/exams/${batchEditTargetId}/batch-name`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchLabel })
  });
  closeBatchNameModal();
  loadExams();
}

// ─── CRUD ───
async function createExam() {
  const name = document.getElementById('examName').value.trim();
  if (!name) return;

  const examDate = document.getElementById('examDate').value || null;
  const color = document.getElementById('examColor').value;
  const baseName = document.getElementById('examBaseName').value || name;

  // Read time range
  let examTimeRange = '';
  const sh = document.getElementById('examStartHour').value;
  const sm = document.getElementById('examStartMin').value;
  const sp = document.getElementById('examStartPeriod').value;
  const eh = document.getElementById('examEndHour').value;
  const em = document.getElementById('examEndMin').value;
  const ep = document.getElementById('examEndPeriod').value;

  if (sh && eh) {
    examTimeRange = `${sh}:${sm} ${sp} - ${eh}:${em} ${ep}`;
  }

  // Client-side past-date check
  if (examDate) {
    const selected = new Date(examDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selected.setHours(0, 0, 0, 0);
    if (selected < today) {
      alert('Exam date cannot be in the past.');
      return;
    }
  }

  // Overlap warning — check if another exam is on the same date & time overlaps
  if (examDate && examTimeRange) {
    try {
      const res = await fetch('/api/exams');
      const allExams = await res.json();
      const sameDayExams = allExams.filter(ex => !ex.isArchived && ex.examDate && new Date(ex.examDate).toISOString().split('T')[0] === examDate && ex.examTimeRange);
      const overlaps = sameDayExams.filter(ex => checkTimeOverlap(examTimeRange, ex.examTimeRange));
      if (overlaps.length > 0) {
        const names = overlaps.map(e => e.name).join(', ');
        if (!confirm(`⚠ Timing overlap detected!\n\nThis exam's timing overlaps with: ${names}\non ${examDate}.\n\nProceed anyway?`)) return;
      }
    } catch {}
  }

  // If from suggestion, pass sections along
  const payload = { name, examDate, color, baseName, examTimeRange, sections: [] };
  if (selectedSuggestion && selectedSuggestion.sections) {
    payload.sections = selectedSuggestion.sections;
  }

  const res = await fetch('/api/exams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || 'Failed to create exam');
    return;
  }

  closeModal();
  loadExams();
}

// Utility: parse "HH:MM AM/PM" to minutes since midnight
function parseTimeToMin(str) {
  const m = (str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + parseInt(m[2]);
}

function checkTimeOverlap(range1, range2) {
  const parts1 = range1.split('-').map(s => s.trim());
  const parts2 = range2.split('-').map(s => s.trim());
  const s1 = parseTimeToMin(parts1[0]), e1 = parseTimeToMin(parts1[1]);
  const s2 = parseTimeToMin(parts2[0]), e2 = parseTimeToMin(parts2[1]);
  if (s1 === null || e1 === null || s2 === null || e2 === null) return false;
  return s1 < e2 && s2 < e1;
}

// ─── Archive / Unarchive Modal ───
function openArchiveModal(id, mode) {
  archiveTargetId = id;
  archiveMode = mode;
  const title = document.getElementById('archiveModalTitle');
  const msg = document.getElementById('archiveModalMsg');
  const btn = document.getElementById('confirmArchiveBtn');
  // Find exam name
  let examName = 'this exam';
  const cards = document.querySelectorAll('.exam-card');
  cards.forEach(card => {
    const nameEl = card.querySelector('.exam-name');
    if (nameEl && (card.querySelector(`.archive-btn[onclick*="'${id}'"]`) || card.querySelector(`.unarchive-btn[onclick*="'${id}'"]`))) examName = nameEl.textContent;
  });
  if (mode === 'unarchive') {
    title.textContent = 'Restore Exam';
    msg.innerHTML = `Move <strong>${examName}</strong> back to Active Exams?`;
    btn.textContent = 'Restore';
    btn.className = 'btn btn-primary';
  } else {
    title.textContent = 'Archive Exam';
    msg.innerHTML = `Archive <strong>${examName}</strong>? It will be moved to the Archives section and grouped by year.`;
    btn.textContent = 'Archive';
    btn.className = 'btn btn-primary';
  }
  document.getElementById('archiveModal').classList.add('active');
}

function closeArchiveModal() {
  archiveTargetId = null;
  document.getElementById('archiveModal').classList.remove('active');
}

document.getElementById('confirmArchiveBtn').onclick = async () => {
  if (!archiveTargetId || isProcessing) return;
  isProcessing = true;
  try {
    const endpoint = archiveMode === 'unarchive' ? 'unarchive' : 'archive';
    await fetch(`/api/exams/${archiveTargetId}/${endpoint}`, { method: 'PUT' });
    closeArchiveModal();
    await loadExams();
  } catch (err) {
    console.error('Archive/unarchive failed:', err);
  } finally {
    isProcessing = false;
  }
};

document.getElementById('confirmDeleteBtn').onclick = async () => {
  if (!deleteTargetId) return;
  await fetch(`/api/exams/${deleteTargetId}`, { method: 'DELETE' });
  closeDeleteModal();
  loadExams();
};

document.getElementById('examName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createExam();
});

document.getElementById('batchNameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBatchName();
});

// ─── Init ───
function initTimeDropdowns() {
  ['examStartHour', 'examEndHour'].forEach(id => {
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

initTheme();
initTimeDropdowns();
loadExams();
