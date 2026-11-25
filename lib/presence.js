// Live visitor counting. A visitor is "online" if their browser pinged within the last ONLINE_MS.
// Only a random per-tab id is used; no IP address or personal data is stored.
const ONLINE_MS = 70 * 1000;
const MAX_TRACKED = 200000;

const seen = new Map(); // visitor id -> { at, page }
const todayIds = new Set();
let today = dayKey();
const stats = { visitors: 0, views: 0, peak: 0 };

function dayKey(d = new Date()) {
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10); // India date
}

function rollover() {
  const k = dayKey();
  if (k !== today) {
    today = k;
    todayIds.clear();
    stats.visitors = stats.views = stats.peak = 0;
  }
}

function sweep(now = Date.now()) {
  for (const [id, v] of seen) if (now - v.at > ONLINE_MS) seen.delete(id);
}

function online(now = Date.now()) {
  let n = 0;
  for (const v of seen.values()) if (now - v.at <= ONLINE_MS) n++;
  return n;
}

function ping(id, page, isView, now = Date.now()) {
  rollover();
  if (!seen.has(id) && seen.size >= MAX_TRACKED) sweep(now);
  if (!seen.has(id) && seen.size >= MAX_TRACKED) return; // still full: ignore rather than grow without bound
  seen.set(id, { at: now, page });
  if (!todayIds.has(id) && todayIds.size < MAX_TRACKED * 5) { todayIds.add(id); stats.visitors++; }
  if (isView) stats.views++;
  const n = online(now);
  if (n > stats.peak) stats.peak = n;
}

function snapshot(now = Date.now()) {
  rollover();
  const pages = {};
  let n = 0;
  for (const v of seen.values()) {
    if (now - v.at > ONLINE_MS) continue;
    n++;
    pages[v.page] = (pages[v.page] || 0) + 1;
  }
  return {
    online: n,
    today: { date: today, visitors: stats.visitors, views: stats.views, peak: Math.max(stats.peak, n) },
    pages: Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([page, count]) => ({ page, count })),
  };
}

function seed(row) {
  rollover();
  if (row && row.day === today) {
    stats.visitors = Math.max(stats.visitors, row.visitors);
    stats.views = Math.max(stats.views, row.views);
    stats.peak = Math.max(stats.peak, row.peak);
  }
}

function totals() {
  rollover();
  return { day: today, visitors: stats.visitors, views: stats.views, peak: Math.max(stats.peak, online()) };
}

setInterval(sweep, 60 * 1000).unref();

module.exports = { ping, snapshot, online, seed, totals, ONLINE_MS };
