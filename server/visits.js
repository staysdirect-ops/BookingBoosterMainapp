// Privacy-friendly visit counts for booking sites: no cookies, no IPs stored. A visitor is a salted hash of
// IP + browser + day, kept in memory for the day only. Counts are written to the workspace once a minute.
'use strict';
const crypto = require('crypto');
const BOT = /bot|crawl|spider|slurp|preview|fetch|curl|wget|python|headless|lighthouse|monitor/i;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu)\./i;
const AI = /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai|you\.com)$/i;

module.exports = function (secret) {
  let day = '', seen = new Set();
  const pending = new Map(); // wid -> pid -> { v, search, ai }
  function count(req, wid, pid, today) {
    const ua = String(req.headers['user-agent'] || ''); if (!ua || BOT.test(ua)) return;
    if (today !== day) { day = today; seen = new Set(); }
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const h = crypto.createHmac('sha256', secret).update(day + '|' + ip + '|' + ua + '|' + pid).digest('base64url').slice(0, 16);
    if (seen.has(h)) return; seen.add(h);
    let ref = ''; try { ref = new URL(req.headers.referer || '').hostname; } catch (_) {}
    const src = AI.test(ref) ? 'ai' : SEARCH.test(ref) ? 'search' : '';
    const w = pending.get(wid) || new Map(); pending.set(wid, w);
    const c = w.get(pid) || { v: 0, search: 0, ai: 0 }; w.set(pid, c);
    c.v++; if (src) c[src]++;
  }
  // Rolls the day's counts into state.website: daily per home, 30-day visitors, share from search and AI, visit-to-booking rate.
  async function flush(ws) {
    const all = [...pending]; pending.clear();
    for (const [wid, homes] of all) {
      await ws.withWs(wid, BB => {
        const s = BB.store.get(), wsite = s.website; wsite.daily = wsite.daily || {};
        for (const [pid, c] of homes) { const d = (wsite.daily[pid] = wsite.daily[pid] || {}); const x = d[s.today] || { v: 0, search: 0, ai: 0 }; x.v += c.v; x.search += c.search; x.ai += c.ai; d[s.today] = x; }
        const from = BB.D.add(s.today, -30); let total = 0, found = 0;
        for (const pid of Object.keys(wsite.daily)) {
          let v = 0; for (const [dt, x] of Object.entries(wsite.daily[pid])) { if (dt <= BB.D.add(s.today, -90)) { delete wsite.daily[pid][dt]; continue; } if (dt > from) { v += x.v; found += x.search + x.ai; } }
          wsite.visitors[pid] = v; total += v;
        }
        const booked = s.bookings.filter(b => b.channel === 'direct' && b.status !== 'cancelled' && (b.createdAt || b.checkIn) > from).length;
        wsite.fromSearch = total ? found / total : 0; wsite.conversion = total ? Math.min(1, booked / total) : 0;
        BB.store.commit({ type: 'website', quiet: true });
      }, { quiet: true });
    }
  }
  return { count, flush };
};
