// ─── Goals Page Logic ───
let calViewMode = 'week';
let calCurrentDate = new Date();
let calSelectedDate = new Date();
let goalsCache = {};
let goalsTimelineInterval = null;
let goalsHoursRendered = false;
let currentEditingEntryId = null;
let editorAttachments = [];
let goalsInitialized = false;
let calRenderLock = false;
let pendingDeleteEntryId = null;
let timelineTaskMarkers = [];
let firstEntryDateStr = null;
let firstEntryFetched = false;
let allExamsData = [];
const _calTipRegistry = {};
let _calTipEl = null;

function _getCalTip() {
  if (!_calTipEl) {
    _calTipEl = document.createElement('div');
    _calTipEl.className = 'cal-global-tip';
    document.body.appendChild(_calTipEl);
  }
  return _calTipEl;
}

function showCalTip(e, dk) {
  const data = _calTipRegistry[dk];
  if (!data || (!data.mocks.length && !data.tasks && !data.journals)) return;
  const tip = _getCalTip();
  let html = '';
  if (data.mocks.length) {
    html += '<div class="cgt-section">Mocks</div>';
    data.mocks.forEach(m => {
      const t = m.scheduledTime ? ` <span class="cgt-time">${m.scheduledTime}</span>` : '';
      html += `<div class="cgt-row">${m.mockName || 'Mock'}${t}</div>`;
    });
  }
  if (data.taskList && data.taskList.length) {
    html += `<div class="cgt-section">Tasks (${data.tasks})</div>`;
    data.taskList.slice(0, 4).forEach(t => { html += `<div class="cgt-row">${t}</div>`; });
    if (data.tasks > 4) html += `<div class="cgt-row cgt-muted">+${data.tasks - 4} more</div>`;
  }
  if (data.journals) {
    html += `<div class="cgt-section">Journal</div><div class="cgt-row">${data.journals} entr${data.journals > 1 ? 'ies' : 'y'}</div>`;
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  positionTip(e, tip);
}

function moveCalTip(e) {
  if (_calTipEl && _calTipEl.style.display === 'block') positionTip(e, _calTipEl);
}

function positionTip(e, tip) {
  const tH = tip.offsetHeight, tW = tip.offsetWidth;
  let left = e.clientX + 15;
  let top = e.clientY + 15;
  if (left + tW > window.innerWidth - 8) left = e.clientX - tW - 15;
  if (top + tH > window.innerHeight - 8) top = e.clientY - tH - 15;
  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
}

function hideCalTip() {
  if (_calTipEl) _calTipEl.style.display = 'none';
}


async function initGoalsPage() {
  if (goalsInitialized) {
    // Always refresh calendar & jump buttons so newly added mocks appear
    await refreshAllExamsData();
    renderCalendar();
    selectDate(calSelectedDate);
    renderExamJumpButtons();
    return;
  }
  goalsInitialized = true;

  await refreshAllExamsData();

  populateTimeDropdowns();
  updateGoalsTimeline();
  if (goalsTimelineInterval) clearInterval(goalsTimelineInterval);
  goalsTimelineInterval = setInterval(updateGoalsTimeline, 1000);
  renderCalendar();
  selectDate(calSelectedDate);
  loadDocsPanel();
  renderExamJumpButtons();
}

async function refreshAllExamsData() {
  try {
    const res = await fetch('/api/exams');
    const exams = await res.json();
    allExamsData = exams.filter(e => e.examDate);
  } catch { allExamsData = []; }
}

function populateTimeDropdowns() {
  const hourSels = ['taskAddHour', 'taskAddEndHour'];
  const minSels = ['taskAddMin', 'taskAddEndMin'];
  hourSels.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.options.length > 1) return;
    for (let h = 0; h <= 23; h++) {
      const o = document.createElement('option');
      o.value = h; o.textContent = String(h).padStart(2, '0');
      sel.appendChild(o);
    }
  });
  minSels.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || sel.options.length > 1) return;
    for (let m = 0; m < 60; m += 5) {
      const o = document.createElement('option');
      o.value = m; o.textContent = String(m).padStart(2, '0');
      sel.appendChild(o);
    }
  });
}

// ─── Goals Timeline ───
function updateGoalsTimeline() {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const totalMin = h * 60 + m;
  const pct = (totalMin / 1440) * 100;
  const isDaytime = SunTime.isDaytime();
  const elapsed = document.getElementById('goalsDtElapsed');
  if (!elapsed) return;
  elapsed.style.width = pct + '%';
  const dim = document.getElementById('goalsDtDim');
  if (dim) dim.style.width = pct + '%';
  // The underlying track (.dt-night-left, .dt-day, .dt-night-right) provides the correct background colors now.
  const dtNow = document.getElementById('goalsDtNow');
  dtNow.style.left = pct + '%';
  const dot = document.getElementById('goalsDtDot');
  isDaytime ? dot.classList.remove('night') : dot.classList.add('night');
  document.getElementById('goalsDtLabel').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (!goalsHoursRendered) {
    const c = document.getElementById('goalsDtHours');
    c.innerHTML = '';
    for (let hr = 0; hr <= 24; hr++) {
      const s = document.createElement('span');
      s.className = 'dt-hour-label';
      s.style.left = (hr / 24) * 100 + '%';
      if (hr === 0 || hr === 24) s.textContent = '12a';
      else if (hr === 12) s.textContent = '12p';
      else if (hr < 12) s.textContent = hr + 'a';
      else s.textContent = (hr - 12) + 'p';
      c.appendChild(s);
    }
    goalsHoursRendered = true;
  }
  renderTimelineMarkers();
}

function renderTimelineMarkers() {
  const track = document.querySelector('#goalsTimeline .dt-track');
  if (!track) return;
  track.querySelectorAll('.dt-task-marker').forEach(m => m.remove());
  timelineTaskMarkers.forEach(t => {
    if (!t.time) return;
    const [hh, mm] = t.time.split(':').map(Number);
    const pct = ((hh * 60 + mm) / 1440) * 100;
    const marker = document.createElement('div');
    marker.className = 'dt-task-marker' + (t.completed ? ' done' : (t.overdue ? ' overdue' : ''));
    marker.style.left = pct + '%';
    marker.title = `${t.time} — ${t.text}`;
    const tooltip = document.createElement('div');
    tooltip.className = 'dt-task-tooltip';
    tooltip.textContent = `${t.time} ${t.text}`;
    marker.appendChild(tooltip);
    track.appendChild(marker);
  });
}

// ─── Calendar ───
function dateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function calSwitchView(mode) {
  calViewMode = mode;
  document.querySelectorAll('.cal-tab').forEach(t => t.classList.toggle('active', t.dataset.view === mode));
  renderCalendar();
}

function calNavigate(dir) {
  if (calViewMode === 'month') calCurrentDate.setMonth(calCurrentDate.getMonth() + dir);
  else if (calViewMode === 'week') calCurrentDate.setDate(calCurrentDate.getDate() + dir * 7);
  else calCurrentDate.setDate(calCurrentDate.getDate() + dir);
  renderCalendar();
}

function calGoToday() {
  calCurrentDate = new Date();
  calSelectedDate = new Date();
  renderCalendar();
  selectDate(calSelectedDate);
}

async function renderCalendar() {
  if (calRenderLock) return;
  calRenderLock = true;
  const grid = document.getElementById('calGrid');
  const title = document.getElementById('calTitle');

  if (!firstEntryFetched && typeof currentExam !== 'undefined' && currentExam) {
    try {
      const res = await fetch(`/api/exams/${getExamId()}/entries/first`);
      const data = await res.json();
      firstEntryDateStr = data.firstDate;
      firstEntryFetched = true;
    } catch { }
  }

  if (calViewMode === 'month') {
    const y = calCurrentDate.getFullYear(), m = calCurrentDate.getMonth();
    title.textContent = calCurrentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const goals = await fetchGoalsRange(dateKey(new Date(y, m, 1)), dateKey(new Date(y, m, daysInMonth)));
    const entries = await fetchEntriesRange(dateKey(new Date(y, m, 1)), dateKey(new Date(y, m, daysInMonth)));
    const mocks = await fetchMocksRange(dateKey(new Date(y, m, 1)), dateKey(new Date(y, m, daysInMonth)));
    const goalsByDate = {};
    const entriesByDate = {};
    const mocksByDate = {};
    goals.forEach(g => { if (!goalsByDate[g.date]) goalsByDate[g.date] = []; goalsByDate[g.date].push(g); });
    entries.forEach(e => { if (!entriesByDate[e.date]) entriesByDate[e.date] = []; entriesByDate[e.date].push(e); });
    mocks.forEach(m => { if (!mocksByDate[m.scheduledDate]) mocksByDate[m.scheduledDate] = []; mocksByDate[m.scheduledDate].push(m); });
    grid.className = 'cal-grid cal-month';
    let html = '';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => { html += `<div class="cal-day-header">${d}</div>`; });
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';
    const todayKey = dateKey(new Date()), selKey = dateKey(calSelectedDate);
    const examDateStr = currentExam && currentExam.examDate;
    const examKey = examDateStr ? dateKey(new Date(examDateStr)) : null;
    const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
    const examObj = examDateStr ? new Date(examDateStr) : null;
    if (examObj) examObj.setHours(0, 0, 0, 0);
    const firstEntryObj = firstEntryDateStr ? new Date(firstEntryDateStr) : null;
    if (firstEntryObj) firstEntryObj.setHours(0, 0, 0, 0);

    for (let d = 1; d <= daysInMonth; d++) {
      const dayObj = new Date(y, m, d);
      const dk = dateKey(dayObj);
      const dGoals = goalsByDate[dk] || [];
      const cls = ['cal-cell'];
      if (dk === todayKey) cls.push('today');
      if (dk === selKey) cls.push('selected');
      if (firstEntryObj && dayObj >= firstEntryObj && dayObj <= todayObj) cls.push('note-interval');
      if (examObj && dayObj > todayObj && dayObj < examObj) cls.push('exam-interval');

      const dayExams = allExamsData.filter(ex => dateKey(new Date(ex.examDate)) === dk);
      if (dayExams.length > 0) {
        const allArchived = dayExams.every(ex => ex.isArchived);
        cls.push(allArchived ? 'exam-archived' : 'exam-day');
      }
      const dayMocks = mocksByDate[dk] || [];
      const dayJournals = entriesByDate[dk] || [];

      // Register tooltip data
      _calTipRegistry[dk] = { mocks: dayMocks, tasks: dGoals.length, taskList: dGoals.map(g => g.text), journals: dayJournals.length };

      let dots = '';
      if (dayExams.length === 0) {
        // Compact badge counters
        let badges = '';
        if (dayMocks.length) badges += `<div class="cal-badge-mock">+${dayMocks.length} mock${dayMocks.length > 1 ? 's' : ''}</div>`;
        if (dGoals.length) badges += `<div class="cal-badge-task">+${dGoals.length} task${dGoals.length > 1 ? 's' : ''}</div>`;
        if (dayJournals.length) badges += `<div class="cal-badge-journal">+${dayJournals.length} journal${dayJournals.length > 1 ? 's' : ''}</div>`;
        if (badges) dots += `<div class="cal-badges">${badges}</div>`;
      }

      const visibleExams = dayExams.slice(0, 2);
      const overflowCount = dayExams.length - 2;
      visibleExams.forEach(exam => {
        const timeHtml = exam.examTimeRange ? `<br><span class="exam-time-range" style="font-size: 0.85em; opacity: 0.9;">${exam.examTimeRange}</span>` : '';
        const archivedTag = exam.isArchived ? `<br><span style="font-size: 0.75em; opacity: 0.7; font-style: italic;">Archived</span>` : '';
        const colorStyle = `style="color: ${exam.color || 'var(--accent)'};"`;
        dots += `<div class="cal-exam-label" ${colorStyle}>${exam.name}${timeHtml}${archivedTag}</div>`;
      });
      if (overflowCount > 0) dots += `<div class="cal-exam-overflow">+${overflowCount} more</div>`;

      const hasTip = !dayExams.length && (dayMocks.length || dGoals.length || dayJournals.length);
      const tipAttrs = hasTip ? ` onmouseenter="showCalTip(event,'${dk}')" onmousemove="moveCalTip(event)" onmouseleave="hideCalTip()"` : '';
      html += `<div class="${cls.join(' ')}" onclick="calSelectDay(${y},${m},${d})"${tipAttrs}><span class="cal-cell-num">${d}</span>${dots}</div>`;
    }
    grid.innerHTML = html;
  } else if (calViewMode === 'week') {
    const sow = new Date(calCurrentDate); sow.setDate(sow.getDate() - sow.getDay());
    const eow = new Date(sow); eow.setDate(eow.getDate() + 6);
    title.textContent = sow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + eow.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const goals = await fetchGoalsRange(dateKey(sow), dateKey(eow));
    const entries = await fetchEntriesRange(dateKey(sow), dateKey(eow));
    const mocks = await fetchMocksRange(dateKey(sow), dateKey(eow));
    const goalsByDate = {};
    const entriesByDate = {};
    const mocksByDate = {};
    goals.forEach(g => { if (!goalsByDate[g.date]) goalsByDate[g.date] = []; goalsByDate[g.date].push(g); });
    entries.forEach(e => { if (!entriesByDate[e.date]) entriesByDate[e.date] = []; entriesByDate[e.date].push(e); });
    mocks.forEach(m => { if (!mocksByDate[m.scheduledDate]) mocksByDate[m.scheduledDate] = []; mocksByDate[m.scheduledDate].push(m); });
    grid.className = 'cal-grid cal-week';
    const todayKey = dateKey(new Date()), selKey = dateKey(calSelectedDate);
    const examDateStr = currentExam && currentExam.examDate;
    const examKey = examDateStr ? dateKey(new Date(examDateStr)) : null;
    const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
    const examObj = examDateStr ? new Date(examDateStr) : null;
    if (examObj) examObj.setHours(0, 0, 0, 0);
    const firstEntryObj = firstEntryDateStr ? new Date(firstEntryDateStr) : null;
    if (firstEntryObj) firstEntryObj.setHours(0, 0, 0, 0);

    let html = '';
    for (let i = 0; i < 7; i++) {
      const day = new Date(sow); day.setDate(day.getDate() + i);
      day.setHours(0, 0, 0, 0);
      const dk = dateKey(day);
      const cls = ['cal-week-col'];
      if (dk === todayKey) cls.push('today');
      if (dk === selKey) cls.push('selected');
      // Check ALL exams for this day
      const dayExams = allExamsData.filter(ex => dateKey(new Date(ex.examDate)) === dk);
      if (dayExams.length > 0) {
        const allArchived = dayExams.every(ex => ex.isArchived);
        cls.push(allArchived ? 'exam-archived' : 'exam-day');
      }

      if (firstEntryObj && day >= firstEntryObj && day <= todayObj) cls.push('note-interval');
      if (examObj && day > todayObj && day < examObj) cls.push('exam-interval');

      let taskHtml = '';
      const dayMocks = mocksByDate[dk] || [];
      const dayGoals = goalsByDate[dk] || [];
      const dayJournals = entriesByDate[dk] || [];

      // Register tooltip data
      _calTipRegistry[dk] = { mocks: dayMocks, tasks: dayGoals.length, taskList: dayGoals.map(g => g.text), journals: dayJournals.length };

      if (dayExams.length === 0) {
        // Compact badge counters
        let badges = '';
        if (dayMocks.length) badges += `<div class="cal-badge-mock">+${dayMocks.length} mock${dayMocks.length > 1 ? 's' : ''}</div>`;
        if (dayGoals.length) badges += `<div class="cal-badge-task">+${dayGoals.length} task${dayGoals.length > 1 ? 's' : ''}</div>`;
        if (dayJournals.length) badges += `<div class="cal-badge-journal">+${dayJournals.length} journal${dayJournals.length > 1 ? 's' : ''}</div>`;
        if (badges) taskHtml += `<div class="cal-badges">${badges}</div>`;
      }
      const visibleExams = dayExams.slice(0, 2);
      const overflowCount = dayExams.length - 2;
      visibleExams.forEach(exam => {
        const timeHtml = exam.examTimeRange ? `<br><span class="exam-time-range" style="font-size: 0.85em; opacity: 0.9;">${exam.examTimeRange}</span>` : '';
        const archivedTag = exam.isArchived ? `<br><span style="font-size: 0.75em; opacity: 0.7; font-style: italic;">Archived</span>` : '';
        const colorStyle = `style="color: ${exam.color || 'var(--accent)'};"`;
        taskHtml += `<div class="cal-exam-label week-view-exam-label" ${colorStyle}>${exam.name}${timeHtml}${archivedTag}</div>`;
      });
      if (overflowCount > 0) taskHtml += `<div class="cal-exam-overflow">+${overflowCount} more</div>`;

      const hasTip = !dayExams.length && (dayMocks.length || dayGoals.length || dayJournals.length);
      const tipAttrs = hasTip ? ` onmouseenter="showCalTip(event,'${dk}')" onmousemove="moveCalTip(event)" onmouseleave="hideCalTip()"` : '';
      html += `<div class="${cls.join(' ')}" onclick="calSelectDay(${day.getFullYear()},${day.getMonth()},${day.getDate()})"${tipAttrs}><div class="cal-week-header"><span class="cal-week-day">${day.toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="cal-week-num">${day.getDate()}</span></div><div class="cal-week-body">${taskHtml}</div></div>`;
    }
    grid.innerHTML = html;
  } else {
    title.textContent = calCurrentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    calSelectedDate = new Date(calCurrentDate);
    grid.className = 'cal-grid cal-day-view';
    grid.innerHTML = '<div class="cal-day-placeholder">Tasks shown below</div>';
    selectDate(calSelectedDate);
  }
  calRenderLock = false;
}

function calSelectDay(y, m, d) {
  calSelectedDate = new Date(y, m, d);
  calCurrentDate = new Date(y, m, d);
  renderCalendar();
  selectDate(calSelectedDate);
}

async function fetchGoalsRange(start, end) {
  try {
    const res = await fetch(`/api/exams/${getExamId()}/goals/range?start=${start}&end=${end}`);
    return await res.json();
  } catch { return []; }
}

async function fetchEntriesRange(start, end) {
  try {
    const res = await fetch(`/api/exams/${getExamId()}/entries/range?start=${start}&end=${end}`);
    return await res.json();
  } catch { return []; }
}

async function fetchMocksRange(start, end) {
  try {
    const res = await fetch(`/api/exams/${getExamId()}/mocks`);
    const mocks = await res.json();
    return mocks.filter(m => m.scheduledDate && m.scheduledDate >= start && m.scheduledDate <= end);
  } catch { return []; }
}

// ─── Task Management ───
async function selectDate(date) {
  const dk = dateKey(date);
  const titleEl = document.getElementById('tasksPanelDate');
  const todayKey = dateKey(new Date());
  titleEl.textContent = dk === todayKey ? "Today's Tasks" : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  try {
    const res = await fetch(`/api/exams/${getExamId()}/goals?date=${dk}`);
    const goals = await res.json();
    window.currentRenderedGoals = goals;
    renderTaskList(goals, dk);
  } catch {
    window.currentRenderedGoals = [];
    renderTaskList([], dk);
  }
  try {
    const res = await fetch(`/api/exams/${getExamId()}/entries?date=${dk}`);
    const raw = await res.json();
    const migrated = (raw || []).map(e => ({
      ...e,
      content: normalizeHighlightTextColorsHtml(e.content || '')
    }));
    renderEntries(migrated);
  } catch { renderEntries([]); }
  loadGoals();
}

function renderTaskList(goals, dk) {
  const now = new Date();
  const todayKey = dateKey(now);
  // Check overdue: if date passed or time passed
  goals.forEach(g => {
    g.overdue = false;
    if (!g.completed) {
      if (g.date < todayKey) g.overdue = true;
      else if (g.date === todayKey && g.endTime) {
        const [hh, mm] = g.endTime.split(':').map(Number);
        if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() > mm)) g.overdue = true;
      } else if (g.date === todayKey && g.time) {
        const [hh, mm] = g.time.split(':').map(Number);
        if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() > mm)) g.overdue = true;
      }
    }
  });
  const pending = goals.filter(g => !g.completed);
  const completed = goals.filter(g => g.completed);
  document.getElementById('pendingCount').textContent = pending.length;
  document.getElementById('completedCount').textContent = completed.length;
  // Update timeline markers for today
  if (dk === todayKey) {
    timelineTaskMarkers = goals.filter(g => g.time).map(g => ({ time: g.time, text: g.text, completed: g.completed, overdue: g.overdue }));
    renderTimelineMarkers();
  }

  const renderGroup = (list, container) => {
    container.innerHTML = '';
    if (!list.length) { container.innerHTML = '<div class="task-empty">No tasks</div>'; return; }
    list.forEach(g => {
      const el = document.createElement('div');
      el.className = 'task-item' + (g.completed ? ' completed' : '') + (g.overdue ? ' overdue' : '');
      el.dataset.id = g._id;
      el.draggable = true;

      el.addEventListener('dragstart', (e) => {
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', g._id);
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
      });

      // Format time with duration
      let timeStr = '';
      if (g.time) {
        if (g.endTime) {
          const dur = calcDuration(g.time, g.endTime);
          timeStr = `<span class="task-time">${g.time} – ${g.endTime}</span><span class="task-duration">${dur}</span>`;
        } else {
          timeStr = `<span class="task-time">${g.time}</span>`;
        }
      }
      const overdueTag = g.overdue ? '<span class="task-overdue-tag">overdue</span>' : '';
      el.innerHTML = `
        <label class="task-checkbox"><input type="checkbox" ${g.completed ? 'checked' : ''} onchange="toggleGoalCal('${g._id}')"><span class="checkmark"></span></label>
        <span class="task-text" data-tasktext="${encodeURIComponent(g.text)}" ondblclick="startEditTask(this, '${g._id}')">${timeStr}${g.text}${overdueTag}</span>
        <div class="task-actions">
          <button class="task-transfer-prev-btn" onclick="transferGoalPrevCal('${g._id}', '${encodeURIComponent(g.text)}')" title="Transfer to Previous Day">←</button>
          <button class="task-transfer-btn" onclick="transferGoalCal('${g._id}', '${encodeURIComponent(g.text)}')" title="Transfer to Next Day">→</button>
          <button class="task-edit-btn" onclick="startEditTask(this.closest('.task-item').querySelector('.task-text'), '${g._id}')" title="Edit">✎</button>
          <button class="task-delete-btn" onclick="deleteGoalCal('${g._id}', '${encodeURIComponent(g.text)}')" title="Delete">✕</button>
        </div>`;
      container.appendChild(el);
    });

    // Add dragover and drop handlers for reordering
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = container.querySelector('.dragging');
      if (!dragging) return;
      const afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(dragging);
      } else {
        container.insertBefore(dragging, afterElement);
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      handleTaskReorder(container);
    });
  };
  renderGroup(pending, document.getElementById('pendingTaskList'));
  renderGroup(completed, document.getElementById('completedTaskList'));
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging), .entry-card:not(.dragging)')];
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

async function handleTaskReorder(container) {
  const taskItems = [...container.querySelectorAll('.task-item')];
  const updates = taskItems.map((item, index) => ({ id: item.dataset.id, order: index }));

  // Reorder currentRenderedGoals locally
  if (window.currentRenderedGoals) {
    const idToIndex = {};
    updates.forEach(u => idToIndex[u.id] = u.order);
    window.currentRenderedGoals.forEach(g => {
      if (idToIndex[g._id] !== undefined) g.order = idToIndex[g._id];
    });
    window.currentRenderedGoals.sort((a, b) => {
      const aOrder = a.order !== undefined ? a.order : Infinity;
      const bOrder = b.order !== undefined ? b.order : Infinity;
      return aOrder - bOrder;
    });

    // Update sidebar instantly if looking at today
    if (calSelectedDate && dateKey(calSelectedDate) === dateKey(new Date())) {
      if (typeof loadGoals === 'function') {
        loadGoals(); // Fetches both exam and desk goals for the dashboard sidebar
      }
    }
  }

  try {
    await fetch(`/api/exams/${getExamId()}/goals/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    // Server order updated, but we don't need to re-fetch to stay instant
  } catch (err) {
    console.error('Failed to reorder tasks', err);
  }
}

function calcDuration(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  if (hrs > 0 && m > 0) return `${hrs}h ${m}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${m}m`;
}

function renderEntries(entries) {
  const list = document.getElementById('entriesList');
  document.getElementById('entriesCount').textContent = entries.length;
  list.innerHTML = '';
  
  // Remove old event listeners by cloning
  const newList = list.cloneNode(false);
  list.parentNode.replaceChild(newList, list);
  const listElement = document.getElementById('entriesList');
  
  if (!entries.length) { 
    listElement.innerHTML = '<div class="task-empty">No journal entries</div>'; 
    return; 
  }
  
  entries.forEach((e, index) => {
    const card = document.createElement('div');
    card.className = 'entry-card collapsed';
    card.id = `entry-${e._id}`;
    card.dataset.id = e._id;
    card.dataset.order = index;
    card.draggable = true;
    
    const effectivePageColor = e.pageColor || DEFAULT_PAGE_COLOR;
    const pageTextColor = isDarkColor(effectivePageColor) ? '#f5f5f5' : '#111111';
    const pageColorStyle = `background-color: ${effectivePageColor}; color: ${pageTextColor}; padding: 12px; border-radius: 10px;`;
    const accentColor = goalsAccentFromPage(effectivePageColor);
    const cardStyle = `style="--entry-accent: ${accentColor};"`;
    
    const normalizedContent = normalizeHighlightTextColorsHtml(e.content || '');
    card.innerHTML = `
      <div class="entry-card-header" onclick="toggleEntryCard(this)" ${cardStyle}>
        <div class="entry-card-title-row">
          <svg class="entry-card-chevron" viewBox="0 0 24 24" width="14" height="14"><path d="M9 18l6-6-6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <h4>${e.title}</h4>
        </div>
        <div class="entry-card-actions" onclick="event.stopPropagation()">
          <button onclick="transferEntryPrevCal('${e._id}', '${encodeURIComponent(e.title)}')" title="Transfer to Previous Day">←</button>
          <button onclick="transferEntryCal('${e._id}', '${encodeURIComponent(e.title)}')" title="Transfer to Next Day">→</button>
          <button class="entry-edit" onclick="editEntry('${e._id}')" title="Edit">✎</button>
          <button class="entry-delete" onclick="promptDeleteEntry('${e._id}')" title="Delete">✕</button>
        </div>
      </div>
      <div class="entry-card-body" style="${pageColorStyle}">${normalizedContent}</div>`;
    
    card.addEventListener('dragstart', (ev) => {
      card.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', e._id);
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
    const afterElement = getDragAfterElement(listElement, e.clientY);
    if (afterElement == null) {
      listElement.appendChild(dragging);
    } else {
      listElement.insertBefore(dragging, afterElement);
    }
  });
  
  listElement.addEventListener('drop', (e) => {
    e.preventDefault();
    handleEntryReorder(listElement);
  });
}

async function handleEntryReorder(container) {
  const entryItems = [...container.querySelectorAll('.entry-card')];
  const updates = entryItems.map((item, index) => ({ id: item.dataset.id, order: index }));
  
  try {
    await fetch(`/api/exams/${getExamId()}/entries/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
  } catch (err) {
    console.error('Failed to reorder entries', err);
  }
}

function toggleEntryCard(header) {
  const card = header.closest('.entry-card');
  if (!card) return;
  const wasCollapsed = card.classList.contains('collapsed');
  card.classList.toggle('collapsed');
  card.draggable = card.classList.contains('collapsed');
  if (wasCollapsed) {
    const container = document.getElementById('entriesList');
    if (!container) return;
    requestAnimationFrame(() => {
      const top = card.offsetTop - 8;
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }
}

// Task CRUD
async function toggleGoalCal(id) {
  await fetch(`/api/goals/${id}`, { method: 'PUT' });
  selectDate(calSelectedDate);
  renderCalendar();
}

async function deleteGoalCal(id, rawName) {
  const name = rawName ? decodeURIComponent(rawName) : 'this task';
  const confirmed = await customConfirm(`Are you sure you want to delete the task "${name}"?`);
  if (!confirmed) return;

  await fetch(`/api/goals/${id}`, { method: 'DELETE' });
  firstEntryFetched = false;
  selectDate(calSelectedDate);
  renderCalendar();
}

let customConfirmMutedUntil = 0;
function customConfirm(message) {
  return new Promise(resolve => {
    if (Date.now() < customConfirmMutedUntil) {
      resolve(true);
      return;
    }
    const modal = document.getElementById('customConfirmModal');
    document.getElementById('customConfirmMessage').textContent = message;
    document.getElementById('customConfirmMute').checked = false;
    modal.classList.add('active');

    const okBtn = document.getElementById('customConfirmOkBtn');
    const cancelBtn = document.getElementById('customConfirmCancelBtn');

    const cleanup = () => {
      modal.classList.remove('active');
      okBtn.replaceWith(okBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    };

    okBtn.onclick = () => {
      if (document.getElementById('customConfirmMute').checked) {
        customConfirmMutedUntil = Date.now() + 5 * 60 * 1000;
      }
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

async function transferGoalCal(id, encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!(await customConfirm(`Do you really want to transfer task "${name}" to the next day?`))) return;
  const nextDate = new Date(calSelectedDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDk = dateKey(nextDate);

  await fetch(`/api/goals/${id}/update`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: nextDk })
  });

  firstEntryFetched = false;
  selectDate(calSelectedDate);
  if (calViewMode) renderCalendar();
}

async function transferGoalPrevCal(id, encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!(await customConfirm(`Do you really want to transfer task "${name}" to the previous day?`))) return;
  const prevDate = new Date(calSelectedDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDk = dateKey(prevDate);

  await fetch(`/api/goals/${id}/update`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: prevDk })
  });

  firstEntryFetched = false;
  selectDate(calSelectedDate);
  if (calViewMode) renderCalendar();
}

async function transferEntryCal(id, encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!(await customConfirm(`Do you really want to transfer journal "${name}" to the next day?`))) return;
  const nextDate = new Date(calSelectedDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDk = dateKey(nextDate);

  await fetch(`/api/entries/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: nextDk })
  });

  firstEntryFetched = false;
  selectDate(calSelectedDate);
  loadDocsPanel();
  if (calViewMode) renderCalendar();
}

async function transferEntryPrevCal(id, encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!(await customConfirm(`Do you really want to transfer journal "${name}" to the previous day?`))) return;
  const prevDate = new Date(calSelectedDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDk = dateKey(prevDate);

  await fetch(`/api/entries/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: prevDk })
  });

  firstEntryFetched = false;
  selectDate(calSelectedDate);
  loadDocsPanel();
  if (calViewMode) renderCalendar();
}

function openAddTaskDialog() {
  document.getElementById('taskAddRow').style.display = 'flex';
  document.getElementById('taskAddInput').focus();
}

function closeAddTaskDialog() {
  document.getElementById('taskAddRow').style.display = 'none';
  document.getElementById('taskAddInput').value = '';
  const h = document.getElementById('taskAddHour'); if (h) h.value = '';
  const m = document.getElementById('taskAddMin'); if (m) m.value = '';
  const eh = document.getElementById('taskAddEndHour'); if (eh) eh.value = '';
  const em = document.getElementById('taskAddEndMin'); if (em) em.value = '';
}

async function submitNewTask() {
  const input = document.getElementById('taskAddInput');
  const text = input.value.trim();
  if (!text) return;
  const dk = dateKey(calSelectedDate);
  const body = { text, date: dk };
  // Read custom time dropdowns (24hr)
  const hSel = document.getElementById('taskAddHour');
  const mSel = document.getElementById('taskAddMin');
  if (hSel && hSel.value !== '') {
    const hr = parseInt(hSel.value);
    const mn = parseInt(mSel.value) || 0;
    body.time = String(hr).padStart(2, '0') + ':' + String(mn).padStart(2, '0');
  }
  // End time (24hr)
  const ehSel = document.getElementById('taskAddEndHour');
  const emSel = document.getElementById('taskAddEndMin');
  if (ehSel && ehSel.value !== '') {
    const hr = parseInt(ehSel.value);
    const mn = parseInt(emSel.value) || 0;
    body.endTime = String(hr).padStart(2, '0') + ':' + String(mn).padStart(2, '0');
  }
  // Validate: end must be after start
  if (body.time && body.endTime) {
    const [sh, sm] = body.time.split(':').map(Number);
    const [eh2, em2] = body.endTime.split(':').map(Number);
    if (eh2 * 60 + em2 <= sh * 60 + sm) {
      alert('End time must be after start time');
      return;
    }
  }
  await fetch(`/api/exams/${getExamId()}/goals/date`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  input.value = '';
  firstEntryFetched = false;
  closeAddTaskDialog();
  selectDate(calSelectedDate);
  renderCalendar();
}

function startEditTask(span, id) {
  if (span.querySelector('input.task-edit-input')) return;

  // Add editing class to the task item and disable drag
  const taskItem = span.closest('.task-item');
  taskItem.classList.add('editing');
  taskItem.draggable = false;

  const rawText = span.dataset.tasktext ? decodeURIComponent(span.dataset.tasktext) : span.textContent.replace(/overdue$/, '').replace(/^\d{2}:\d{2}(\s*[–\-]\s*\d{2}:\d{2})?\s*/, '').replace(/\d+h(\s*\d+m)?$/, '').trim();

  const goal = window.currentRenderedGoals ? window.currentRenderedGoals.find(g => g._id === id) : null;
  let sh = '', sm = '', eh = '', em = '';
  if (goal && goal.time) { [sh, sm] = goal.time.split(':'); }
  if (goal && goal.endTime) { [eh, em] = goal.endTime.split(':'); }

  const hrOptions = (val) => '<option value="">HH</option>' + Array.from({ length: 24 }, (_, i) => `<option value="${String(i).padStart(2, '0')}" ${String(i).padStart(2, '0') === val ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`).join('');
  const minOptions = (val) => '<option value="">MM</option>' + Array.from({ length: 12 }, (_, i) => { const m = String(i * 5).padStart(2, '0'); return `<option value="${m}" ${m === val ? 'selected' : ''}>${m}</option>`; }).join('');

  span.innerHTML = `
    <div class="task-edit-row" style="display: flex; gap: 8px; width: 100%; align-items: center; margin-top: 4px;">
      <input class="task-edit-input" value="${rawText}" style="flex:1; padding:4px 8px; border-radius:4px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-primary); font-size:.85rem; min-width:0;" onkeydown="if(event.key==='Enter')finishEditTask(this.closest('.task-edit-row'),'${id}');if(event.key==='Escape')cancelEditTask()">
      <div class="time-range-group" style="display:flex; align-items:center; gap:4px;">
        <select class="time-select edit-sh" style="padding:2px; font-size:.8rem; border-radius:4px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-primary);">${hrOptions(sh)}</select><span style="color:var(--text-muted)">:</span><select class="time-select edit-sm" style="padding:2px; font-size:.8rem; border-radius:4px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-primary);">${minOptions(sm)}</select>
        <span class="time-range-dash" style="color:var(--text-muted)">-</span>
        <select class="time-select edit-eh" style="padding:2px; font-size:.8rem; border-radius:4px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-primary);">${hrOptions(eh)}</select><span style="color:var(--text-muted)">:</span><select class="time-select edit-em" style="padding:2px; font-size:.8rem; border-radius:4px; background:var(--bg-input); border:1px solid var(--border); color:var(--text-primary);">${minOptions(em)}</select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="finishEditTask(this.closest('.task-edit-row'), '${id}')" style="padding:4px 8px; font-size:.8rem;">Save</button>
      <button class="btn btn-secondary btn-sm" onclick="cancelEditTask()" style="padding:4px 8px; font-size:.8rem;">✕</button>
    </div>
  `;
  span.querySelector('input').focus();
}

async function finishEditTask(editRow, id) {
  const textInput = editRow.querySelector('.task-edit-input');
  const text = textInput ? textInput.value.trim() : '';
  if (!text) { cancelEditTask(); return; }

  const sh = editRow.querySelector('.edit-sh').value;
  const sm = editRow.querySelector('.edit-sm').value;
  const eh = editRow.querySelector('.edit-eh').value;
  const em = editRow.querySelector('.edit-em').value;

  let time = null, endTime = null;
  if (sh && sm) time = `${sh}:${sm}`;
  if (eh && em) endTime = `${eh}:${em}`;

  await fetch(`/api/goals/${id}/update`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, time, endTime })
  });
  selectDate(calSelectedDate);
  if (calViewMode) renderCalendar();
}

function cancelEditTask() {
  selectDate(calSelectedDate);
}

function toggleTaskGroup(group) {
  let el;
  if (group === 'pending') el = document.getElementById('taskGroupPending');
  else if (group === 'completed') el = document.getElementById('taskGroupCompleted');
  else el = document.getElementById('entriesSection');
  el.classList.toggle('collapsed');
}

// ─── Rich Text Editor (Modal) ───
function openEntryEditor() {
  currentEditingEntryId = null;
  editorAttachments = [];
  currentPageColor = DEFAULT_PAGE_COLOR;
  document.getElementById('entryTitleInput').value = 'Today I completed...';
  document.getElementById('entryBody').innerHTML = '';
  document.getElementById('entryBody').style.backgroundColor = currentPageColor;
  document.getElementById('entryBody').style.color = isDarkColor(currentPageColor) ? '#f5f5f5' : '#111111';
  document.getElementById('entryEditorModal').classList.add('active');
  setTimeout(() => document.getElementById('entryBody').focus(), 100);
}

function closeEntryEditor() {
  document.getElementById('entryEditorModal').classList.remove('active');
  currentEditingEntryId = null;
  editorAttachments = [];
}

function execFormat(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('entryBody').focus();
}

function execHeading(val) {
  if (val) document.execCommand('formatBlock', false, val);
  else document.execCommand('formatBlock', false, 'P');
  document.getElementById('entryBody').focus();
  document.getElementById('headingSelect').value = '';
}

// ─── Color Pickers ───
const COLOR_SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#78716c', '#ffffff', '#000000'
];
const HIGHLIGHT_SWATCHES = [
  '#fde047', '#bef264', '#6ee7b7', '#67e8f9', '#a5b4fc', '#c4b5fd',
  '#f0abfc', '#fda4af', '#fed7aa', '#fef08a', '#d9f99d', '#bbf7d0'
];
const DEFAULT_PAGE_COLOR = '#0b0b0f';
const PAGE_COLOR_SWATCHES = [
  '#0b0b0f', '#161a22', '#1d2433', '#1a2b26', '#2a1f1f', '#2c233a',
  '#f4f1ea', '#efe7dc', '#e7eef6', '#e7f2ec', '#f3e8f0', '#f6ecd9'
];

function isDarkColor(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((r * 299) + (g * 587) + (b * 114)) / 1000 < 140;
}

function isDarkCssColor(color) {
  if (!color) return false;
  if (color.startsWith('#')) return isDarkColor(color);
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return false;
  const r = parseInt(rgb[1], 10);
  const g = parseInt(rgb[2], 10);
  const b = parseInt(rgb[3], 10);
  return ((r * 299) + (g * 587) + (b * 114)) / 1000 < 140;
}

function applyHighlightTextColors(root) {
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
      el.style.color = isDarkCssColor(inlineBg) ? '#f8fafc' : '#111111';
    }
  });
}

function normalizeHighlightTextColorsHtml(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';
  applyHighlightTextColors(wrapper);
  return wrapper.innerHTML;
}

function refreshHighlightColors(root) {
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
      el.style.color = isDarkCssColor(inlineBg) ? '#f8fafc' : '#111111';
    }
  });
}

function goalsAccentFromPage(color) {
  if (!color) return 'var(--accent)';
  if (isDarkCssColor(color)) {
    return `color-mix(in srgb, ${color} 35%, #e6edf7 65%)`;
  }
  return `color-mix(in srgb, ${color} 55%, #0f172a 45%)`;
}

function initColorPickers() {
  const fcg = document.getElementById('fontColorGrid');
  const hlg = document.getElementById('highlightGrid');
  const pcg = document.getElementById('pageColorGrid');
  if (fcg) fcg.innerHTML = COLOR_SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" onmousedown="event.preventDefault(); execFontColor('${c}'); closeColorPickers()"></div>`).join('');
  if (hlg) hlg.innerHTML = HIGHLIGHT_SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" onmousedown="event.preventDefault(); execHighlight('${c}'); closeColorPickers()"></div>`).join('');
  if (pcg) pcg.innerHTML = PAGE_COLOR_SWATCHES.map(c => `<div class="color-swatch" style="background:${c}" onmousedown="event.preventDefault(); execPageColor('${c}'); closeColorPickers()"></div>`).join('');
}

let currentPageColor = DEFAULT_PAGE_COLOR;

function toggleColorPicker(type) {
  const panels = { fontColor: 'fontColorPanel', highlight: 'highlightPanel', pageColor: 'pageColorPanel' };
  Object.keys(panels).forEach(k => {
    const p = document.getElementById(panels[k]);
    if (p) p.classList.toggle('active', k === type && !p.classList.contains('active'));
  });
}

function closeColorPickers() {
  document.querySelectorAll('.color-picker-panel').forEach(p => p.classList.remove('active'));
}

function execFontColor(color) {
  if (!color) { document.execCommand('removeFormat', false, null); return; }
  const sel = window.getSelection();
  const editor = document.getElementById('entryBody');
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
    refreshHighlightColors(document.getElementById('entryBody'));
  }, 10);
}

function execHighlight(color) {
  if (!color) { document.execCommand('removeFormat', false, null); return; }
  // Try hiliteColor first, fallback to backColor for Chrome/Edge
  if (!document.execCommand('hiliteColor', false, color)) {
    document.execCommand('backColor', false, color);
  }
  const editor = document.getElementById('entryBody');
  // Apply colors, merge (handles ZWS cleanup + flatten internally), then move cursor out
  setTimeout(() => {
    applyHighlightTextColors(editor);
    mergeAdjacentHighlights(editor);
    _moveCursorOutOfHighlight(editor);
  }, 10);
}

// Move cursor/caret out of any highlight span to prevent extending
function _moveCursorOutOfHighlight(root) {
  if (!root) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  // Collapse selection to the end if text is still selected
  if (!sel.isCollapsed) {
    sel.collapseToEnd();
  }
  const range = sel.getRangeAt(0);
  // Walk up to find if cursor is inside a highlighted element
  let hlAncestor = null;
  let el = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
  while (el && el !== root) {
    if (el.style && (el.style.backgroundColor || el.style.background)) {
      hlAncestor = el;
    }
    el = el.parentElement;
  }
  if (!hlAncestor) return;
  // Check if at the end
  const testRange = document.createRange();
  try {
    testRange.setStart(range.startContainer, range.startOffset);
    testRange.setEndAfter(hlAncestor.lastChild || hlAncestor);
  } catch { return; }
  if (testRange.toString().length > 0) return;
  // Move cursor after the highlight
  const zws = document.createTextNode('\u200B');
  hlAncestor.parentNode.insertBefore(zws, hlAncestor.nextSibling);
  const newRange = document.createRange();
  newRange.setStart(zws, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

// ─── Highlight Management System ───

// Normalize color string for comparison — parses rgb values numerically
const _colorCache = {};
function _normColor(c) {
  if (!c) return '';
  if (_colorCache[c]) return _colorCache[c];
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
  _colorCache[c] = norm;
  return norm;
}

// Get background-color of an element
function _getBg(el) {
  if (!el || !el.style) return '';
  return el.style.backgroundColor || el.style.background || '';
}

// Get the effective highlight color for any node (walks up ancestors within root)
function _effectiveBg(node, root) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  while (el && el !== root) {
    const bg = _getBg(el);
    if (bg) return _normColor(bg);
    el = el.parentElement;
  }
  return '';
}

// Check if a node is purely whitespace (spaces, nbsp, ZWS, etc.)
function _isWhitespaceNode(node) {
  if (node.nodeType === 3) return node.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '') === '';
  if (node.nodeType === 1) return node.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '') === '';
  return false;
}

// Check if element is a formatting wrapper
function _isFormattingTag(el) {
  return el && /^(B|I|U|EM|STRONG|S|STRIKE|SUB|SUP|SPAN|FONT)$/i.test(el.tagName);
}

// Step 1: Remove all accumulated zero-width space artifacts
function _cleanZWS(root) {
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

// Step 2: Flatten nested highlights — unwrap children that have the same bg as an ancestor
function _flattenNestedHighlights(root) {
  if (!root) return;
  let changed = true, passes = 0;
  while (changed && passes < 30) {
    changed = false; passes++;
    const els = root.querySelectorAll('span[style], font[style]');
    for (const el of els) {
      if (!el.parentNode || !root.contains(el)) continue;
      const bg = _getBg(el);
      if (!bg) continue;
      const norm = _normColor(bg);
      // Unwrap any descendant with the same background
      const descs = [...el.querySelectorAll('span[style], font[style]')];
      for (const child of descs) {
        if (!child.parentNode || !root.contains(child)) continue;
        const childBg = _getBg(child);
        if (childBg && _normColor(childBg) === norm) {
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

// Step 3: Recursive level-by-level merge — the core algorithm
function mergeAdjacentHighlights(root) {
  if (!root) return;
  _cleanZWS(root);
  _flattenNestedHighlights(root);
  _mergeLevelRecursive(root, root);
}

function _mergeLevelRecursive(container, root) {
  // First recurse into children so we merge bottom-up
  const childElements = [...container.querySelectorAll(':scope > *')];
  for (const child of childElements) {
    if (child.nodeType === 1 && root.contains(child)) {
      _mergeLevelRecursive(child, root);
    }
  }
  // Then merge siblings at this level
  _mergeSiblingsAtLevel(container, root);
}

function _mergeSiblingsAtLevel(container, root) {
  let changed = true, passes = 0;
  while (changed && passes < 30) {
    changed = false; passes++;
    const children = [...container.childNodes];

    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.nodeType !== 1 || !root.contains(node)) continue;
      const bg = _getBg(node);
      if (!bg) continue;
      const norm = _normColor(bg);

      // Scan forward: collect whitespace gaps and same-colored siblings into a run
      let j = i + 1;
      let runEnd = i; // last index that is part of this same-color run
      let foundMerge = false;

      while (j < children.length) {
        const sib = children[j];

        // Whitespace text node or whitespace-only element — bridge over it
        if (_isWhitespaceNode(sib)) {
          j++;
          continue;
        }

        // Element with the same background color — extend the run
        if (sib.nodeType === 1 && _getBg(sib) && _normColor(_getBg(sib)) === norm) {
          runEnd = j;
          foundMerge = true;
          j++;
          continue;
        }

        // Element without bg but all its highlighted children share the same color
        if (sib.nodeType === 1 && _isFormattingTag(sib) && !_getBg(sib)) {
          const innerBg = _getEffectiveSoleBg(sib);
          if (innerBg && _normColor(innerBg) === norm) {
            runEnd = j;
            foundMerge = true;
            j++;
            continue;
          }
        }

        // Text node with real content — stop
        break;
      }

      if (!foundMerge) continue;

      // Absorb everything from i+1 to runEnd into children[i]
      const target = children[i];
      for (let k = i + 1; k <= runEnd; k++) {
        const sib = children[k];
        if (!sib || !sib.parentNode) continue;

        if (sib.nodeType === 3) {
          // Whitespace text node — keep the space content, move into target
          if (sib.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '') === '') {
            // Preserve a single space for word separation
            const spaceText = document.createTextNode(' ');
            target.appendChild(spaceText);
            sib.remove();
          } else {
            target.appendChild(sib);
          }
        } else if (sib.nodeType === 1) {
          const sibBg = _getBg(sib);
          if (sibBg && _normColor(sibBg) === norm) {
            // Same-color span/font — unwrap it (steal its children)
            if (_isWhitespaceNode(sib)) {
              // It's a whitespace-only colored element — just add a space
              const sp = document.createTextNode(' ');
              target.appendChild(sp);
              sib.remove();
            } else if (sib.tagName === 'SPAN' || sib.tagName === 'FONT') {
              while (sib.firstChild) target.appendChild(sib.firstChild);
              sib.remove();
            } else {
              // Formatting tag with bg — strip bg and absorb
              sib.style.backgroundColor = '';
              sib.style.background = '';
              sib.querySelectorAll('*').forEach(c => {
                if (c.style && _normColor(_getBg(c)) === norm) {
                  c.style.backgroundColor = '';
                  c.style.background = '';
                }
              });
              target.appendChild(sib);
            }
          } else if (!sibBg && _isFormattingTag(sib)) {
            // Formatting wrapper with inner highlights — strip inner bgs and absorb
            sib.querySelectorAll('span[style], font[style]').forEach(inner => {
              if (_normColor(_getBg(inner)) === norm) {
                inner.style.backgroundColor = '';
                inner.style.background = '';
              }
            });
            target.appendChild(sib);
          } else if (_isWhitespaceNode(sib)) {
            // Whitespace-only element with different or no bg — strip bg, add space
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
      break; // restart scanning from the beginning
    }
  }
}

// Get the sole background color from an element's highlighted descendants
function _getEffectiveSoleBg(el) {
  const hlChildren = el.querySelectorAll('span[style], font[style]');
  if (hlChildren.length === 0) return '';
  const textContent = el.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '');
  let highlightedText = '';
  let commonBg = null;
  for (const child of hlChildren) {
    const bg = _getBg(child);
    if (!bg) continue;
    const norm = _normColor(bg);
    if (commonBg === null) commonBg = norm;
    else if (norm !== commonBg) return '';
    highlightedText += child.textContent.replace(/[\s\xA0\u200B\u200C\u200D\uFEFF]/g, '');
  }
  if (textContent.length > 0 && textContent !== highlightedText) return '';
  return commonBg || '';
}

function execPageColor(color) {
  currentPageColor = color || DEFAULT_PAGE_COLOR;
  const editor = document.getElementById('entryBody');
  if (editor) {
    editor.style.backgroundColor = currentPageColor;
    editor.style.color = isDarkColor(currentPageColor) ? '#f5f5f5' : '#111111';
  }
}

let dividerSavedSelection = null;
function toggleDividerPicker() {
  const panel = document.getElementById('dividerPickerPanel');
  if (!panel) return;
  const isActive = panel.classList.contains('active');
  // Close other open pickers
  closeColorPickers();
  if (!isActive) {
    dividerSavedSelection = saveSelection();
    _initDividerPicker(panel, 'goals');
    panel.classList.add('active');
  }
}

function _initDividerPicker(panel, mode) {
  const DIVIDER_STYLES = [
    { name: 'Solid', style: 'solid', weight: '2px' },
    { name: 'Dashed', style: 'dashed', weight: '2px' },
    { name: 'Dotted', style: 'dotted', weight: '2px' },
    { name: 'Double', style: 'double', weight: '4px' },
    { name: 'Thick', style: 'solid', weight: '4px' },
  ];
  const DIVIDER_COLORS = [
    '', '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#78716c', '#ffffff', '#000000'
  ];

  // Determine default contrast color label
  let pageBg;
  if (mode === 'desk') {
    pageBg = (typeof deskCurrentPageColor !== 'undefined') ? deskCurrentPageColor : '#0b0b0f';
  } else {
    pageBg = currentPageColor || DEFAULT_PAGE_COLOR;
  }
  const autoColor = isDarkColor(pageBg) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';

  let styleHtml = '<div class="divider-picker-label">Style</div><div class="divider-style-grid">';
  DIVIDER_STYLES.forEach((s, i) => {
    const previewColor = isDarkColor(pageBg) ? '#aaa' : '#555';
    styleHtml += `<div class="divider-style-option${i === 0 ? ' selected' : ''}" data-style="${s.style}" data-weight="${s.weight}" onclick="_selectDividerStyle(this)">
      <span class="divider-style-name">${s.name}</span>
      <div class="divider-style-preview" style="border-top: ${s.weight} ${s.style} ${previewColor};"></div>
    </div>`;
  });
  styleHtml += '</div>';

  let colorHtml = '<div class="divider-picker-label">Color</div><div class="divider-color-grid">';
  colorHtml += `<div class="divider-color-swatch selected" data-color="" style="background: ${autoColor}; position:relative;" onclick="_selectDividerColor(this)" title="Auto (contrast)"><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${isDarkColor(pageBg) ? '#fff' : '#000'}">A</span></div>`;
  DIVIDER_COLORS.slice(1).forEach(c => {
    colorHtml += `<div class="divider-color-swatch" data-color="${c}" style="background:${c};" onclick="_selectDividerColor(this)"></div>`;
  });
  colorHtml += '</div>';

  const insertFn = mode === 'desk' ? '_doInsertDeskDivider()' : '_doInsertDivider()';
  panel.innerHTML = styleHtml + colorHtml + `<button class="divider-picker-insert" onclick="${insertFn}">Insert Divider</button>`;
}

function _selectDividerStyle(el) {
  el.closest('.divider-style-grid').querySelectorAll('.divider-style-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

function _selectDividerColor(el) {
  el.closest('.divider-color-grid').querySelectorAll('.divider-color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

function _getDividerParams(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return { style: 'solid', weight: '2px', color: '' };
  const styleEl = panel.querySelector('.divider-style-option.selected');
  const colorEl = panel.querySelector('.divider-color-swatch.selected');
  return {
    style: styleEl ? styleEl.dataset.style : 'solid',
    weight: styleEl ? styleEl.dataset.weight : '2px',
    color: colorEl ? colorEl.dataset.color : ''
  };
}

function _createHrElement(params, pageBg) {
  const hr = document.createElement('hr');
  const color = params.color || (isDarkColor(pageBg) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)');
  hr.style.border = 'none';
  hr.style.borderTop = `${params.weight} ${params.style} ${color}`;
  hr.style.margin = '16px 0';
  hr.style.width = '100%';
  hr.style.opacity = '1';
  hr.contentEditable = 'false';
  return hr;
}

function _doInsertDivider() {
  const params = _getDividerParams('dividerPickerPanel');
  const pageBg = currentPageColor || DEFAULT_PAGE_COLOR;
  const hr = _createHrElement(params, pageBg);

  const editor = document.getElementById('entryBody');
  if (!editor) return;

  editor.focus({ preventScroll: true });
  if (typeof restoreSelection === 'function') {
    restoreSelection(dividerSavedSelection);
  }
  
  const sel = window.getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.collapse(false);
    // Insert HR then a new paragraph after it for continued typing
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    range.insertNode(p);
    range.insertNode(hr);
    // Move cursor to the new paragraph
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

  // Close the picker
  const panel = document.getElementById('dividerPickerPanel');
  if (panel) panel.classList.remove('active');
  editor.focus({ preventScroll: true });
}

function _handleDividerBackspace(e) {
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

function initDividerBackspace(editorId) {
  const editor = document.getElementById(editorId);
  if (editor) {
    editor.addEventListener('keydown', _handleDividerBackspace);
  }
}

// Init color pickers on DOMContentLoaded
if (document.readyState === 'loading') { 
  document.addEventListener('DOMContentLoaded', () => { initColorPickers(); initDividerBackspace('entryBody'); }); 
} else { 
  initColorPickers(); 
  initDividerBackspace('entryBody'); 
}

// ─── Link Insert ───
let savedSelection = null;
function insertLink() {
  savedSelection = saveSelection();
  document.getElementById('linkUrlInput').value = '';
  document.getElementById('linkTextInput').value = '';
  document.getElementById('linkEmbedCheck').checked = false;

  // Populate color grid
  const grid = document.getElementById('linkBoxColorGrid');
  if (grid) {
    const swatches = ['var(--info)', ...COLOR_SWATCHES.slice(0, 11)]; // default + some colors
    grid.innerHTML = swatches.map(c => `<div class="color-swatch" style="background:${c}; width: 24px; height: 24px;" onclick="document.getElementById('linkBoxColorInput').value='${c}'; document.querySelectorAll('#linkBoxColorGrid .color-swatch').forEach(el=>el.style.border='none'); this.style.border='2px solid white';"></div>`).join('');
    // Select first by default
    grid.firstChild.style.border = '2px solid white';
    document.getElementById('linkBoxColorInput').value = swatches[0];
  }

  document.getElementById('linkModal').classList.add('active');
}
function closeLinkModal() { document.getElementById('linkModal').classList.remove('active'); }

function getContrast(c) {
  if (c.startsWith('var')) return '#ffffff';
  const hex = c.replace('#', '');
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
  const lum = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  // Very bright backgrounds → dark charcoal text
  if (lum >= 180) return '#1a1a2e';
  // Mid-bright → dark navy for readability
  if (lum >= 128) return '#0f172a';
  // Mid-dark → warm white
  if (lum >= 60) return '#fefefe';
  // Very dark → pure white
  return '#ffffff';
}

function confirmInsertLink() {
  let url = document.getElementById('linkUrlInput').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  const text = document.getElementById('linkTextInput').value.trim() || url;
  const embed = document.getElementById('linkEmbedCheck').checked;
  const bgColor = document.getElementById('linkBoxColorInput') ? document.getElementById('linkBoxColorInput').value : 'var(--info)';
  const fgColor = getContrast(bgColor);

  closeLinkModal();
  document.getElementById('entryBody').focus();
  restoreSelection(savedSelection);
  if (embed) {
    // Convert YouTube URLs to nocookie embed format
    let embedUrl = url;
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]+)/);
    if (ytMatch) {
      embedUrl = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;
    }
    document.execCommand('insertHTML', false, `<div class="entry-embed resizable" contenteditable="false"><button class="entry-media-remove" onclick="if(confirm('Are you sure you want to remove this media?')) this.parentElement.remove()" title="Remove">&times;</button><iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe><a href="${url}" target="_blank" class="embed-link">${text}</a></div><p><br></p>`);
  } else {
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" class="entry-link" style="background-color: ${bgColor}; color: ${fgColor};">${text}</a>`);
  }
  editorAttachments.push({ type: 'link', url, name: text, embedMode: embed, id: 'att-' + Date.now() });
}
function saveSelection() { const s = window.getSelection(); return s.rangeCount > 0 ? s.getRangeAt(0).cloneRange() : null; }
function restoreSelection(r) { if (!r) return; const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }

// ─── File Uploads ───
function insertImage() { document.getElementById('imageFileInput').click(); }
function insertAudio() { document.getElementById('audioFileInput').click(); }
function insertDocument() { document.getElementById('docFileInput').click(); }

async function handleFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    document.getElementById('entryBody').focus();
    restoreSelection(savedSelection);
    let html = '';
    const removeBtn = '<button class="entry-media-remove" onclick="if(confirm(\'Are you sure you want to remove this media?\')) this.parentElement.remove()" title="Remove">&times;</button>';
    if (type === 'image') html = `<div class="entry-media resizable" contenteditable="false">${removeBtn}<img src="${data.url}" alt="${data.name}" loading="lazy"><span class="media-caption">${data.name}</span></div><p><br></p>`;
    else if (type === 'audio') html = `<div class="entry-media entry-audio resizable" contenteditable="false">${removeBtn}<audio controls src="${data.url}"></audio><span class="media-caption">${data.name}</span></div><p><br></p>`;
    else html = `<div class="entry-media entry-doc" contenteditable="false">${removeBtn}<a href="${data.url}" target="_blank" class="doc-link"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${data.name}</a></div><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    editorAttachments.push({ type, url: data.url, name: data.name, id: 'att-' + Date.now() });
  } catch (err) { console.error('Upload failed:', err); }
  input.value = '';
}

// ─── Save / Edit / Delete Entry ───
async function saveEntry() {
  const title = document.getElementById('entryTitleInput').value.trim() || 'Today I completed...';
  applyHighlightTextColors(document.getElementById('entryBody'));
  const content = document.getElementById('entryBody').innerHTML;
  const pageColor = currentPageColor || DEFAULT_PAGE_COLOR;
  const dk = dateKey(calSelectedDate);
  firstEntryFetched = false;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  const contentUrls = new Set();
  
  tempDiv.querySelectorAll('a').forEach(a => { const h = a.getAttribute('href'); if(h) contentUrls.add(h); });
  tempDiv.querySelectorAll('img').forEach(img => { const s = img.getAttribute('src'); if(s) contentUrls.add(s); });
  tempDiv.querySelectorAll('iframe').forEach(iframe => { const s = iframe.getAttribute('src'); if(s) contentUrls.add(s); });
  tempDiv.querySelectorAll('audio').forEach(audio => { const s = audio.getAttribute('src'); if(s) contentUrls.add(s); });

  editorAttachments = editorAttachments.filter(att => {
    let embedUrl = att.url;
    if (att.embedMode) {
      const ytMatch = att.url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]+)/);
      if (ytMatch) embedUrl = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;
    }
    return contentUrls.has(att.url) || contentUrls.has(embedUrl);
  });

  if (currentEditingEntryId) {
    await fetch(`/api/entries/${currentEditingEntryId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, attachments: editorAttachments, pageColor })
    });
  } else {
    await fetch(`/api/exams/${getExamId()}/entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, date: dk, attachments: editorAttachments, pageColor })
    });
  }
  closeEntryEditor();
  selectDate(calSelectedDate);
  loadDocsPanel();
  if (calViewMode) renderCalendar();
}

async function editEntry(id) {
  try {
    const dk = dateKey(calSelectedDate);
    const res = await fetch(`/api/exams/${getExamId()}/entries?date=${dk}`);
    const entries = await res.json();
    const entry = entries.find(e => e._id === id);
    if (!entry) return;
    currentEditingEntryId = id;
    editorAttachments = entry.attachments || [];
    currentPageColor = entry.pageColor || DEFAULT_PAGE_COLOR;
    document.getElementById('entryTitleInput').value = entry.title;
    document.getElementById('entryBody').innerHTML = normalizeHighlightTextColorsHtml(entry.content || '');
    document.getElementById('entryBody').style.backgroundColor = currentPageColor;
    document.getElementById('entryBody').style.color = isDarkColor(currentPageColor) ? '#f5f5f5' : '#111111';
    document.getElementById('entryEditorModal').classList.add('active');
  } catch { }
}

function promptDeleteEntry(id) {
  pendingDeleteEntryId = id;
  document.getElementById('deleteEntryModal').classList.add('active');
}
function closeDeleteEntryModal() {
  document.getElementById('deleteEntryModal').classList.remove('active');
  pendingDeleteEntryId = null;
}
async function confirmDeleteEntry() {
  if (!pendingDeleteEntryId) return;
  await fetch(`/api/entries/${pendingDeleteEntryId}`, { method: 'DELETE' });
  firstEntryFetched = false;
  closeDeleteEntryModal();
  selectDate(calSelectedDate);
  loadDocsPanel();
  if (calViewMode) renderCalendar();
}

// ─── Docs Panel ───
let docsPanelOpen = false;
function toggleDocsPanel() {
  docsPanelOpen = !docsPanelOpen;
  document.getElementById('docsPanel').classList.toggle('open', docsPanelOpen);
  const fab = document.getElementById('goalsDocsPanelToggle');
  if (fab) fab.style.display = docsPanelOpen ? 'none' : '';
  if (docsPanelOpen) loadDocsPanel();
}

async function loadDocsPanel() {
  try {
    const res = await fetch(`/api/exams/${getExamId()}/entries/attachments`);
    renderDocsPanel(await res.json());
  } catch { renderDocsPanel([]); }
}

function renderDocsPanel(attachments) {
  const groups = { image: 'docsImagesList', document: 'docsDocsList', link: 'docsLinksList', audio: 'docsAudioList' };
  const empties = { image: 'No images yet', document: 'No documents yet', link: 'No links yet', audio: 'No audio yet' };
  Object.keys(groups).forEach(type => {
    const items = attachments.filter(a => a.type === type);
    const c = document.getElementById(groups[type]);
    c.innerHTML = '';
    if (!items.length) { c.innerHTML = `<div class="docs-empty">${empties[type]}</div>`; return; }
    items.forEach(att => {
      const el = document.createElement('div');
      el.className = 'docs-item';
      if (att.type === 'image') el.innerHTML = `<img src="${att.url}" alt="${att.name}" class="docs-thumb"><div class="docs-item-info"><span class="docs-item-name">${att.name}</span><span class="docs-item-date">${att.entryDate}</span></div>`;
      else el.innerHTML = `<div class="docs-item-info"><span class="docs-item-name">${att.name}</span><span class="docs-item-date">${att.entryDate}</span></div>`;
      el.onclick = () => {
        if (att.entryId) {
          calSelectedDate = new Date(att.entryDate + 'T12:00:00');
          calCurrentDate = new Date(att.entryDate + 'T12:00:00');
          renderCalendar();
          selectDate(calSelectedDate);
          setTimeout(() => {
            const entryEl = document.getElementById(`entry-${att.entryId}`);
            if (entryEl) { entryEl.classList.remove('collapsed'); entryEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); entryEl.classList.add('highlight'); setTimeout(() => entryEl.classList.remove('highlight'), 2000); }
          }, 500);
        }
      };
      c.appendChild(el);
    });
  });
}

// ─── Wire into sidebar ───
const origSwitchView = window.switchView;
window.switchView = function (view) {
  origSwitchView(view);
  if (view === 'goals') initGoalsPage();
};

async function addGoalPage() {
  const input = document.getElementById('pageGoalInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  await fetch(`/api/exams/${getExamId()}/goals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  input.value = '';
  firstEntryFetched = false;
  loadGoals();
  if (calViewMode) { renderCalendar(); selectDate(calSelectedDate); }
}

// ─── Exam Jump Buttons (with drag-to-reorder) ───
let _examJumpDragSrc = null;
let _examJumpDragData = null;

function renderExamJumpButtons() {
  const container = document.getElementById('calExamJumps');
  if (!container) return;

  // Persist custom order in memory between renders
  if (!window._examJumpOrder) window._examJumpOrder = null;

  // Build sorted list (by date/time) as default order
  const defaultSorted = [...allExamsData].sort((a, b) => {
    const da = new Date(a.examDate), db = new Date(b.examDate);
    if (da.getTime() !== db.getTime()) return da - db;
    const ta = (a.examTimeRange || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const tb = (b.examTimeRange || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (ta && tb) {
      let ha = parseInt(ta[1]), hb = parseInt(tb[1]);
      if (ta[3].toUpperCase() === 'PM' && ha !== 12) ha += 12;
      if (ta[3].toUpperCase() === 'AM' && ha === 12) ha = 0;
      if (tb[3].toUpperCase() === 'PM' && hb !== 12) hb += 12;
      if (tb[3].toUpperCase() === 'AM' && hb === 12) hb = 0;
      return (ha * 60 + parseInt(ta[2])) - (hb * 60 + parseInt(tb[2]));
    }
    return 0;
  });

  // Apply saved order if available and IDs still match
  let sorted = defaultSorted;
  if (window._examJumpOrder && window._examJumpOrder.length === defaultSorted.length) {
    const idSet = new Set(defaultSorted.map(e => e._id));
    if (window._examJumpOrder.every(id => idSet.has(id))) {
      const idToExam = {};
      defaultSorted.forEach(e => idToExam[e._id] = e);
      sorted = window._examJumpOrder.map(id => idToExam[id]).filter(Boolean);
    }
  }

  container.innerHTML = '';
  sorted.forEach(exam => {
    if (!exam.examDate) return;
    const btn = document.createElement('button');
    btn.className = 'cal-exam-jump-btn';
    btn.dataset.examId = exam._id;
    btn.style.borderColor = exam.color || 'var(--accent)';
    btn.style.color = exam.color || 'var(--accent)';
    btn.textContent = exam.name;
    btn.title = `Jump to ${exam.name} exam day — drag to reorder`;
    btn.draggable = true;

    // Jump on click (only if not a drag)
    btn.addEventListener('click', () => {
      if (btn._wasDragged) { btn._wasDragged = false; return; }
      const d = new Date(exam.examDate);
      calCurrentDate = new Date(d);
      calSelectedDate = new Date(d);
      renderCalendar();
      selectDate(calSelectedDate);
    });

    // Drag events
    btn.addEventListener('dragstart', (e) => {
      _examJumpDragSrc = btn;
      btn._wasDragged = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', exam._id);
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      container.querySelectorAll('.cal-exam-jump-btn').forEach(b => b.classList.remove('drag-over'));
      // Save new order
      window._examJumpOrder = [...container.querySelectorAll('.cal-exam-jump-btn')].map(b => b.dataset.examId);
    });
    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (btn === _examJumpDragSrc) return;
      container.querySelectorAll('.cal-exam-jump-btn').forEach(b => b.classList.remove('drag-over'));
      btn.classList.add('drag-over');
      // Reorder in DOM
      const allBtns = [...container.querySelectorAll('.cal-exam-jump-btn')];
      const srcIdx = allBtns.indexOf(_examJumpDragSrc);
      const tgtIdx = allBtns.indexOf(btn);
      if (srcIdx !== -1 && tgtIdx !== -1) {
        if (srcIdx < tgtIdx) container.insertBefore(_examJumpDragSrc, btn.nextSibling);
        else container.insertBefore(_examJumpDragSrc, btn);
      }
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drag-over');
    });

    container.appendChild(btn);
  });
}

// ─── Paste handler for clipboard images ───
document.addEventListener('DOMContentLoaded', () => {
  const body = document.getElementById('entryBody');
  if (body) {
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
            editorAttachments.push({ type: 'image', url: data.url, name: data.name, id: 'att-' + Date.now() });
          } catch (err) { console.error('Paste upload failed:', err); }
          break;
        }
      }
    });

    // Prevent backspace from deleting contenteditable=false blocks
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const sel = window.getSelection();
        if (sel.anchorNode) {
          const block = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
          const prev = block?.previousElementSibling;
          if (e.key === 'Backspace' && prev && prev.getAttribute('contenteditable') === 'false') {
            // Caret is right after a non-editable block and the block would be deleted
            const range = sel.getRangeAt(0);
            if (range.startOffset === 0) {
              e.preventDefault();
            }
          }
        }
      }
      
      // Stop highlight from extending when typing — use beforeinput (reliable for space)
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
          hlAncestor = el; // keep going to find outermost
        }
        el = el.parentElement;
      }

      if (!hlAncestor) return;

      // Check if cursor is at the very end of the highlight using range
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
      mergeAdjacentHighlights(body);
    });
  }
});
