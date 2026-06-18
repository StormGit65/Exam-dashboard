// ─── Offline-capable Countdown Timer ───
// Stores exam date in localStorage, computes from system clock
// Works without internet and after app restart

const TimerModule = {
  intervalId: null,

  init(examId, examDate) {
    // Always clear previous timer first
    this.destroy();

    if (examDate) {
      localStorage.setItem(`examprep-timer-${examId}`, examDate);
    }
    this.start(examId);
  },

  start(examId) {
    const stored = localStorage.getItem(`examprep-timer-${examId}`);
    if (!stored) return;

    const target = new Date(stored).getTime();

    const update = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        this.render(0, 0, 0, 0);
        document.getElementById('badgeCountdown').textContent = 'Exam passed';
        document.getElementById('statDays').textContent = '0';
        clearInterval(this.intervalId);
        this.intervalId = null;
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      this.render(days, hours, minutes, seconds);
    };

    update();
    this.intervalId = setInterval(update, 1000);
  },

  render(days, hours, minutes, seconds) {
    const badge = document.getElementById('badgeCountdown');
    if (badge) {
      badge.textContent = `${days}d ${hours}h ${minutes}m`;
    }

    const statDays = document.getElementById('statDays');
    if (statDays) {
      statDays.textContent = days;
      let subEl = document.getElementById('statDaysSub');
      if (!subEl) {
        const s = document.createElement('div');
        s.className = 'stat-sub';
        s.id = 'statDaysSub';
        statDays.parentElement.appendChild(s);
      }
      subEl = document.getElementById('statDaysSub');
      if (subEl) subEl.textContent = `${hours}h ${minutes}m ${seconds}s`;
    }
  },

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
};
