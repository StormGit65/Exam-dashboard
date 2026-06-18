// ─── SunTime Module ───
// Real sunrise/sunset via Geolocation + sunrise-sunset.org API
// Falls back to 6 AM / 6 PM

const SunTime = (() => {
  let data = null;
  const CACHE_KEY = 'examprep-suntime';
  const DEF_SR = 6, DEF_SS = 18;

  function makeDefault() {
    return { date: new Date().toDateString(), sunrise: DEF_SR, sunset: DEF_SS, sunriseStr: '6:00 AM', sunsetStr: '6:00 PM' };
  }

  async function init() {
    // Check today's cache
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.date === new Date().toDateString()) { data = p; applyToDOM(); return data; }
      }
    } catch {}

    // Try geolocation → API
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject('No geolocation');
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 3600000 });
      });
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&formatted=0&date=today`);
      const json = await res.json();
      if (json.status === 'OK') {
        const sr = new Date(json.results.sunrise);
        const ss = new Date(json.results.sunset);
        data = {
          date: new Date().toDateString(),
          sunrise: sr.getHours() + sr.getMinutes() / 60,
          sunset: ss.getHours() + ss.getMinutes() / 60,
          sunriseStr: sr.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          sunsetStr: ss.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        applyToDOM();
        return data;
      }
    } catch (e) { console.log('SunTime: Using defaults.', e); }

    data = makeDefault();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    applyToDOM();
    return data;
  }

  function get() {
    const d = data || makeDefault();
    return { ...d, sunrisePct: (d.sunrise / 24) * 100, sunsetPct: (d.sunset / 24) * 100 };
  }

  function isDaytime() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const d = data || makeDefault();
    return h >= d.sunrise && h < d.sunset;
  }

  function applyToDOM() {
    const st = get();
    document.querySelectorAll('.day-timeline, .goals-timeline').forEach(tl => {
      const nL = tl.querySelector('.dt-night-left');
      const nR = tl.querySelector('.dt-night-right');
      const day = tl.querySelector('.dt-day');
      const sr = tl.querySelector('.dt-sunrise');
      const ss = tl.querySelector('.dt-sunset');
      if (nL) nL.style.width = st.sunrisePct + '%';
      if (nR) nR.style.width = (100 - st.sunsetPct) + '%';
      if (day) { day.style.left = st.sunrisePct + '%'; day.style.width = (st.sunsetPct - st.sunrisePct) + '%'; }
      if (sr) { sr.style.left = st.sunrisePct + '%'; sr.title = 'Sunrise ' + st.sunriseStr; }
      if (ss) { ss.style.left = st.sunsetPct + '%'; ss.title = 'Sunset ' + st.sunsetStr; }
    });
  }

  return { init, get, isDaytime, applyToDOM };
})();
