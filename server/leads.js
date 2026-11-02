// Lead follow-up: picks the right email series for each marketing form, sends each step when it is due,
// and stops for good when the person unsubscribes or signs up for an account.
'use strict';
const { esc } = require('./pages');

// UK clock helpers (Europe/London, so 8am stays 8am across the clock change).
function ukOffsetMin(ms) {
  const z = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName');
  const m = z && z.value.match(/GMT([+-]\d+)(?::(\d+))?/); return m ? (+m[1]) * 60 + (m[2] ? Math.sign(+m[1]) * +m[2] : 0) : 0;
}
const ukDay = ms => new Date(ms + ukOffsetMin(ms) * 6e4).toISOString().slice(0, 10);
function ukAt(day, hhmm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return 0;
  const [h, m] = String(hhmm || '08:00').split(':').map(Number); if (isNaN(h)) return 0;
  const guess = Date.parse(day + 'T' + String(h).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') + ':00Z');
  return guess - ukOffsetMin(guess) * 6e4;
}
const dayAt = (base, n, hh = 8) => ukAt(new Date(Date.parse(ukDay(base) + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10), hh + ':00');
const fmt = (ms, o) => new Date(ms).toLocaleString('en-GB', Object.assign({ timeZone: 'Europe/London' }, o));
const date = ms => fmt(ms, { weekday: 'long', day: 'numeric', month: 'long' });
const time = ms => fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });

// Which series a form starts. A form can also name one with a hidden input: <input type="hidden" name="sequence" value="fee">
function pick(kind, d) {
  const k = String(d.sequence || '').toLowerCase(); if (['fee', 'audit', 'call', 'webinar', 'site', 'apply'].includes(k)) return k;
  const s = (String(d.page || '') + ' ' + String(kind || '')).toLowerCase();
  if (/book-call|walkthrough/.test(s)) return 'call';
  if (/fee-leak|optin/.test(s)) return 'fee';
  if (/ai-audit|audit-request|\/02-request/.test(s)) return 'audit';
  if (/direct-in-7|register|webinar/.test(s)) return 'webinar';
  if (/done-for-you|apply/.test(s)) return 'apply';
  if (/ledger|booking-site|get-my-site/.test(s)) return 'site';
  return null;
}

module.exports = function ({ db, cfg, msg, auth, log }) {
  const q = {
    ins: db.prepare('INSERT OR IGNORE INTO lead_seq (lead_id, seq, idx, status, next_at, sent, vars, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)'),
    get: db.prepare('SELECT s.*, l.email, l.name, l.created_at AS start, l.kind, l.data FROM lead_seq s JOIN leads l ON l.id = s.lead_id WHERE s.lead_id = ?'),
    due: db.prepare("SELECT lead_id FROM lead_seq WHERE status = 'active' AND (next_at IS NULL OR next_at <= ?) ORDER BY next_at LIMIT 200"),
    waiting: db.prepare("SELECT lead_id FROM lead_seq WHERE status = 'waiting'"),
    save: db.prepare('UPDATE lead_seq SET idx = ?, status = ?, next_at = ?, sent = ?, vars = ?, updated_at = ? WHERE lead_id = ?'),
    all: db.prepare('SELECT * FROM lead_seq'),
    optedOut: db.prepare('SELECT 1 FROM lead_optout WHERE email = lower(?)'),
    optOut: db.prepare('INSERT OR IGNORE INTO lead_optout (email, at) VALUES (?, ?)'),
    stopFor: db.prepare("UPDATE lead_seq SET status = ?, next_at = NULL, updated_at = ? WHERE status IN ('active', 'waiting') AND lead_id IN (SELECT id FROM leads WHERE email = ? COLLATE NOCASE)"),
    hasUser: db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)'),
    callFor: db.prepare("SELECT 1 FROM lead_seq s JOIN leads l ON l.id = s.lead_id WHERE s.seq = 'call' AND l.email = ? COLLATE NOCASE"),
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'),
    kvSet: db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v'),
  };
  const kv = async k => { const r = await q.kvGet.get(k); try { return r ? JSON.parse(r.v) : {}; } catch (_) { return {}; } };
  const setKv = (k, v) => q.kvSet.run(k, JSON.stringify(v));
  // Team settings (webinar date, links). Loaded fresh at the start of each job or request, then read synchronously by the email templates.
  const DEFAULTS = { webinar_at: 0, join_url: '', replay_url: '', meeting_url: '', book_call_url: '', sample_report_url: '' };
  let current = Object.assign({}, DEFAULTS);
  const settings = () => current;
  async function loadSettings() { current = Object.assign({}, DEFAULTS, await kv('lead-settings')); return current; }

  const app = p => cfg.baseUrl + p;
  const links = { bookCall: () => settings().book_call_url, meeting: () => settings().meeting_url, sampleReport: () => settings().sample_report_url };
  const SEQ = require('./lead-emails')({ dayAt, ukAt, date, time, app, guide: f => app('/guides/' + f), link: n => (links[n] ? links[n]() : '') });

  // Start the right series for a new lead. Returns the series key or null.
  async function start(leadId, kind, email, d) {
    const seq = pick(kind, d || {}); if (!seq || !SEQ[seq]) return null;
    await loadSettings();
    const vars = SEQ[seq].vars(d || {}) || {};
    if (seq === 'webinar') { const st = settings(); if (st.webinar_at > Date.now()) vars.session_at = st.webinar_at; }
    await q.ins.run(leadId, seq, 'active', null, '{}', JSON.stringify(vars), Date.now());
    return seq;
  }

  function context(row, now, callBooked) {
    const v = JSON.parse(row.vars || '{}'), sent = JSON.parse(row.sent || '{}');
    if (row.seq === 'webinar') {
      const st = settings();
      if (!v.session_at && st.webinar_at > row.start) v.session_at = st.webinar_at; // first session after they registered
      if (v.session_at === st.webinar_at) { v.join_url = st.join_url; v.replay_url = st.replay_url; }
      if (v.session_at) { v.session_day = date(v.session_at); v.session_time = time(v.session_at); }
    }
    if (v.call_at) { v.call_when = date(v.call_at) + ' at ' + time(v.call_at); v.call_time = time(v.call_at); }
    v.first_name = (String(row.name || '').trim().split(/\s+/)[0]) || 'there';
    v.month = fmt(now, { month: 'long' });
    return { start: row.start, sent, v, now, callBooked: row.seq === 'audit' && !!callBooked };
  }

  const fill = (s, v) => String(typeof s === 'function' ? s(v) : s || '').replace(/\{([a-z_]+)\}/g, (m, k) => (v[k] == null ? m : esc(String(v[k]))));
  const plain = h => h.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2 ($1)').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  function render(row, step, c) {
    const v = c.v, unsub = cfg.baseUrl + '/u/lead/' + row.lead_id + '/' + auth.sign('lead', row.lead_id);
    const blocks = [].concat(step.body(v) || []).filter(Boolean);
    const after = [].concat(typeof step.after === 'function' ? step.after(v) : step.after || []).filter(Boolean);
    const cta = step.cta && step.cta(v);
    const subject = plain(fill(step.subject, v));
    const P = b => (b && b.list ? '<ul style="margin:0 0 16px;padding-left:20px">' + b.list.map(x => '<li style="margin:0 0 6px">' + fill(x, v) + '</li>').join('') + '</ul>' : '<p style="margin:0 0 16px">' + fill(b, v) + '</p>');
    const btn = cta && cta.href ? '<p style="margin:8px 0 24px"><a href="' + esc(cta.href) + '" style="display:inline-block;background:#3355FF;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">' + fill(cta.label, v) + '</a></p>' : '';
    const sign = '<p style="margin:0 0 4px">' + esc(step.signoff || 'Thanks,') + '</p><p style="margin:0 0 24px">' + esc(cfg.leads.signoff) + '</p>';
    const tm = step.ai ? '<p style="margin:8px 0 0;color:#8A90A6;font-size:11px">ChatGPT, Gemini, Perplexity, Google, Claude and Copilot are trademarks of their owners. Bookingbooster is not affiliated with or endorsed by them.</p>' : '';
    const foot = '<p style="margin:0;color:#8A90A6;font-size:12px;line-height:1.5">' + esc(cfg.company.name) + ' · United Kingdom · You are getting this because you asked for it on our website. <a href="' + esc(unsub) + '" style="color:#8A90A6">Unsubscribe in one click</a></p>' + tm;
    const html = '<!doctype html><html><body style="margin:0;background:#F4F5F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141A33">' +
      '<span style="display:none;max-height:0;overflow:hidden">' + fill(step.preview, v) + '</span>' +
      '<div style="max-width:560px;margin:0 auto;padding:24px 16px"><p style="margin:0 0 16px;font-weight:700;font-size:18px;color:#141A33"><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:#3355FF;vertical-align:-4px;margin-right:8px"></span>bookingbooster</p>' +
      '<div style="background:#fff;border-radius:16px;padding:28px 24px;font-size:16px;line-height:1.55">' +
      '<p style="margin:0 0 16px">Hi ' + esc(v.first_name) + ',</p>' + blocks.map(P).join('') + btn + after.map(P).join('') + sign + '</div>' +
      '<div style="padding:16px 8px">' + foot + '</div></div></body></html>';
    const text = ['Hi ' + v.first_name + ','].concat(blocks.map(b => (b.list ? b.list.map(x => '- ' + plain(fill(x, v))).join('\n') : plain(fill(b, v)))),
      cta && cta.href ? [plain(fill(cta.label, v)) + ': ' + cta.href] : [], after.map(b => plain(fill(b, v))), [step.signoff || 'Thanks,', cfg.leads.signoff, '', 'Unsubscribe: ' + unsub]).join('\n\n');
    return { subject, html, text, unsub };
  }

  function invite(row, step, c) {
    const v = c.v, at = row.seq === 'call' ? v.call_at : v.session_at; if (!at) return null;
    const mins = row.seq === 'call' ? 15 : 45, z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const title = row.seq === 'call' ? 'Bookingbooster walkthrough (15 minutes)' : 'Live demo: launch your direct booking site in 7 days';
    const where = row.seq === 'call' ? settings().meeting_url : v.join_url;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookingbooster//Leads//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:lead-' + row.lead_id + '-' + at + '@' + new URL(cfg.baseUrl).hostname, 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(at), 'DTEND:' + z(at + mins * 6e4),
      'SUMMARY:' + title, where ? 'LOCATION:' + where : '', where ? 'URL:' + where : '', 'DESCRIPTION:' + (where ? 'Join here: ' + where : 'We will email the joining link before it starts.'),
      'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    return { filename: 'invite.ics', content: ics, type: 'text/calendar' };
  }

  // Send everything that is due for one lead. Returns the keys sent.
  async function advance(leadId, now) {
    now = now || Date.now();
    const row = await q.get.get(leadId); if (!row || !['active', 'waiting'].includes(row.status)) return [];
    await loadSettings();
    const steps = SEQ[row.seq] ? SEQ[row.seq].steps : [];
    const stop = status => q.save.run(row.idx, status, null, row.sent, row.vars, now, leadId);
    if (await q.optedOut.get(row.email)) { await stop('unsubscribed'); return []; }
    if (await q.hasUser.get(row.email) && !['site', 'apply'].includes(row.seq)) { await stop('converted'); return []; } // they signed up: onboarding emails take over
    const c = context(row, now, row.seq === 'audit' && await q.callFor.get(row.email)); const out = []; let idx = row.idx, nextAt = null, status = 'active';
    while (idx < steps.length) {
      const step = steps[idx]; const due = step.when(c);
      if (due === false) { idx++; continue; }
      if (due === null || due === undefined) { status = 'waiting'; break; }
      if (due > now) { nextAt = due; break; }
      if (now - due > 3 * 864e5 && idx > 0) { idx++; continue; } // missed by days (server was off): skip rather than send late
      const r = render(row, step, c);
      const att = (typeof step.invite === 'function' ? step.invite(c.v) : step.invite) ? invite(row, step, c) : null;
      const res = await msg.sendEmail({ to: row.email, subject: r.subject, text: r.text, html: r.html, from: cfg.leads.from || undefined, replyTo: cfg.company.support, unsubscribeUrl: r.unsub,
        meta: { lead: row.lead_id, seq: row.seq, step: step.key, broadcast: true }, attachments: att ? [att] : undefined });
      if (!res.ok && !res.test) { nextAt = now + 30 * 6e4; break; } // provider error: try again in 30 minutes
      c.sent[step.key] = now; out.push(step.key); idx++;
    }
    if (idx >= steps.length) status = 'done';
    // keep idx and sent in step with what was really sent
    await q.save.run(idx, status, status === 'active' ? nextAt : null, JSON.stringify(c.sent), row.vars, now, leadId);
    return out;
  }

  async function run(now) {
    now = now || Date.now();
    const ids = (await q.due.all(now)).map(r => r.lead_id).concat((await q.waiting.all()).map(r => r.lead_id));
    let n = 0;
    for (const id of ids) { try { n += (await advance(id, now)).length; } catch (e) { log('leads', id, e.message); } }
    return n;
  }

  // The team fills in a waiting step from /admin (audit results, proposal link).
  async function setVars(leadId, patch) {
    const row = await q.get.get(leadId); if (!row) return false;
    const v = Object.assign(JSON.parse(row.vars || '{}'), patch);
    await q.save.run(row.idx, row.status === 'waiting' ? 'active' : row.status, row.next_at, row.sent, JSON.stringify(v), Date.now(), leadId);
    return true;
  }
  async function unsubscribe(leadId) {
    const row = await q.get.get(leadId); if (!row) return false;
    await q.optOut.run(String(row.email).toLowerCase(), Date.now()); await q.stopFor.run('unsubscribed', Date.now(), row.email); return true;
  }
  async function stop(leadId) { const row = await q.get.get(leadId); if (!row) return false; await q.save.run(row.idx, 'stopped', null, row.sent, row.vars, Date.now(), leadId); return true; }
  async function info(leadId) {
    const row = await q.get.get(leadId); if (!row) return null;
    const steps = SEQ[row.seq] ? SEQ[row.seq].steps : []; const v = JSON.parse(row.vars || '{}');
    return { seq: row.seq, name: SEQ[row.seq] ? SEQ[row.seq].name : row.seq, status: row.status, next_at: row.next_at, sent: Object.keys(JSON.parse(row.sent || '{}')), total: steps.length, next: steps[row.idx] ? steps[row.idx].key : null, vars: v };
  }

  return { start, advance, run, setVars, unsubscribe, stop, info, settings, loadSettings, saveSettings: async s => { await loadSettings(); await setKv('lead-settings', Object.assign({}, current, s)); await loadSettings(); }, ukAt, pick };
};
