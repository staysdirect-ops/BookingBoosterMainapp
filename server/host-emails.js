// Emails to hosts about their own account: the day-2 setup checklist, week-3 tips, the Monday report and
// failed payments. Welcome and site-live are sent from index.js and effects.js.
// What was sent, and each host's choices, live in the kv table (hostmail:<id>, hostprefs:<id>).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PART = JSON.parse(fs.readFileSync(path.join(__dirname, 'emails', 'host-partials.json'), 'utf8'));
const DAY = 864e5, AIRBNB_HOST_FEE = 0.155;

module.exports = function ({ db, cfg, msg, auth, ws, urls, leads, log }) {
  const kvGet = db.prepare('SELECT v FROM kv WHERE k = ?'), kvSet = db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)');
  const get = async k => { const r = await kvGet.get(k); try { return r ? JSON.parse(r.v) : {}; } catch (_) { return {}; } };
  const put = (k, o) => kvSet.run(k, JSON.stringify(o));
  const prefs = async wid => Object.assign({ setup: true, report: true }, await get('hostprefs:' + wid));
  const setPrefs = async (wid, p) => put('hostprefs:' + wid, Object.assign(await prefs(wid), p));
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (tpl, v) => tpl.replace(/\{\{([a-z_]+)\}\}/g, (m, k) => E(v[k]));
  const money = n => '£' + Math.round(n).toLocaleString('en-GB');
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
  const change = (now, before) => before ? (now >= before ? '+' : '') + Math.round(100 * (now - before) / before) + '%' : now ? 'new' : '0%';
  const ukParts = ms => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date(ms)); const g = k => (f.find(x => x.type === k) || {}).value; return { date: g('year') + '-' + g('month') + '-' + g('day'), hour: +g('hour') % 24, wd: g('weekday') }; };
  const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const shortDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const shortRange = (a, b) => { const x = new Date(a + 'T12:00:00Z'), y = new Date(b + 'T12:00:00Z'); return x.getUTCDate() + (x.getUTCMonth() === y.getUTCMonth() ? '' : ' ' + x.toLocaleDateString('en-GB', { month: 'short' })) + ' to ' + y.getUTCDate() + ' ' + y.toLocaleDateString('en-GB', { month: 'short' }); };
  const unsub = (wid, kind) => cfg.baseUrl + '/u/host/' + wid + '/' + kind + '/' + auth.sign('hostmail', wid, kind);

  function base(w, kind) {
    const s = w.state, p = s.properties[0];
    return { first_name: String(s.account.owner || '').split(' ')[0] || 'there', property_name: s.properties.length > 1 ? s.account.business : p ? p.name : s.account.business,
      site_url: p ? urls.site(w, p) : cfg.baseUrl, account_url: cfg.baseUrl + '/app/account', dashboard_url: cfg.baseUrl + '/app', help_url: cfg.baseUrl + '/help', privacy_url: cfg.baseUrl + '/privacy',
      billing_url: cfg.baseUrl + '/app/billing', preferences_url: cfg.baseUrl + '/app/account#emails', unsubscribe_url: kind ? unsub(w.id, kind) : cfg.baseUrl + '/app/account#emails',
      company_address: cfg.company.address, company_number: cfg.company.number || 'to be confirmed', vat_number: cfg.company.vat || 'not registered',
      setup_lead_name: 'The Bookingbooster team', setup_lead_initials: 'BB' };
  }
  async function send(w, tpl, subject, v, text, kind) {
    v.subject = subject;
    return msg.sendEmail({ workspaceId: w.id, to: w.state.account.email, subject, text: text + '\n\n' + v.dashboard_url, html: msg.template(tpl, v), meta: { template: tpl, host: true }, unsubscribeUrl: kind ? v.unsubscribe_url : undefined });
  }

  /* ---------- day 2: setup checklist ---------- */
  function checklist(w) {
    const s = w.state, ps = s.properties, every = f => ps.length > 0 && ps.every(f);
    const custom = (w.domains || []).some(d => d.verified && !ws.isOurs(d.host));
    return [
      ['Your home’s details', 'Name, description and what the home offers, in Website & SEO. Search engines and AI assistants read these.', every(p => String(p.about || '').trim().length > 40)],
      ['Photos, 10 or more', 'Your best landscape shots. The first one is the cover, and your site shows a drawing until you add some.', every(p => (p.photos || []).length >= 10)],
      ['House rules and check-in details', 'Address, how guests get in, Wi-Fi and house rules. Guests see them in their trip app after check-in.', every(p => String(p.address || '').trim() && String(p.entry || '').trim())],
      ['Payouts', 'Connect Stripe with your UK bank account in Connections. Guests pay you directly; the money lands in your account, not ours.', s.integrations.some(i => i.id === 'stripe' && i.connected)],
      ['Your own domain', 'Already own one? Add it under Your web address in Website & SEO. Your free address works until then.', custom, true],
      ['Past guest list', 'A CSV of guests who agreed to hear from you, imported in Guests, so you can invite them back direct.', s.guests.some(g => g.source === 'import'), true],
    ];
  }
  function checklistRows(items) {
    return items.map(([title, desc, done, optional], i) => fill(PART.o02_row, { title, desc })
      .replace('[[ICON]]', done ? PART.icon_done : PART.icon_todo).replace('[[BADGE]]', done ? PART.badge_done : optional ? PART.badge_opt : '')
      .split('[[BORDER]]').join(i < items.length - 1 ? 'border-bottom:1px solid #E3E7F5;' : '')).join('');
  }
  async function sendChecklist(w, created) {
    const items = checklist(w), done = items.filter(x => x[2]).length;
    if (items.filter(x => !x[3]).every(x => x[2])) return 'skip'; // the required four are done already
    const v = Object.assign(base(w, 'setup'), { checklist_rows: checklistRows(items), items_received: done, progress_pct: Math.max(4, Math.round(100 * done / 6)), checklist_due_date: longDate(ukParts(created + 14 * DAY).date), checklist_url: cfg.baseUrl + '/app' });
    return send(w, 'host-o02-setup-checklist', 'Day 2: the 15-minute checklist for ' + v.property_name, v, 'Hi ' + v.first_name + ', ' + done + ' of 6 setup steps are done. ' + items.filter(x => !x[2]).map(x => x[0]).join(', ') + ' still to do in your console.', 'setup');
  }

  /* ---------- week 3: campaigns and automations ---------- */
  function gapNights(s) {
    let n = 0;
    for (const p of s.properties) for (let i = 0; i < 60; i++) {
      const d = addDays(s.today, i);
      const taken = s.bookings.some(b => b.propertyId === p.id && b.status !== 'cancelled' && b.checkIn <= d && b.checkOut > d) || (s.blocks || []).some(k => k.propertyId === p.id && k.from <= d && k.to > d);
      if (!taken) n++;
    }
    return n;
  }
  async function sendWeek3(w) {
    const s = w.state; if (!s.properties.length) return 'skip';
    const autos = s.automations || [], off = autos.filter(a => !a.on);
    const rows = off.map((a, i) => fill(PART.o05_row, { name: a.name, desc: a.steps.join('. ') + '.' }).split('[[BORDER]]').join(i < off.length - 1 ? 'border-bottom:1px solid #E3E7F5;' : '')).join('');
    const st = leads.settings();
    const v = Object.assign(base(w, 'setup'), { guest_list_count: s.guests.filter(g => g.subscribed).length, gap_nights: gapNights(s), automations_on: autos.filter(a => a.on).length,
      automation_intro: off.length ? 'Here is what is still switched off on ' + (s.properties.length > 1 ? 'your homes' : s.properties[0].name) + ':' : 'All ' + autos.length + ' are switched on. Check the timings suit you.',
      automation_block: off.length ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table>' : '',
      campaigns_url: cfg.baseUrl + '/app', automations_url: cfg.baseUrl + '/app', book_call_url: st.book_call_url || 'mailto:' + cfg.company.support });
    return send(w, 'host-o05-week3-tips', v.guest_list_count > 1 ? 'Week 3: turn ' + v.guest_list_count + ' past guests into direct bookings' : 'Week 3: bring your past guests back direct', v, 'Hi ' + v.first_name + ', you have ' + v.guest_list_count + ' guests on your list and ' + v.gap_nights + ' empty nights in the next 60 days. Campaigns and automations are in your console.', 'setup');
  }

  /* ---------- Monday: last week's report ---------- */
  function week(s, from, to) {
    const inW = b => { const d = String(b.createdAt || '').slice(0, 10); return d >= from && d <= to && b.status !== 'cancelled' && b.status !== 'request'; };
    const bs = s.bookings.filter(inW), direct = bs.filter(b => b.channel === 'direct');
    let visits = 0, search = 0, ai = 0;
    for (const days of Object.values((s.website && s.website.daily) || {})) for (const [d, x] of Object.entries(days)) if (d >= from && d <= to) { visits += x.v; search += x.search; ai += x.ai; }
    return { bs, direct, revenue: direct.reduce((n, b) => n + (+b.total || 0), 0), visits, search, ai };
  }
  async function report(w, from, to) {
    const s = w.state, W = week(s, from, to), P = week(s, addDays(from, -7), addDays(to, -7)), F = week(s, addDays(from, -21), to);
    const ytd = week(s, from.slice(0, 4) + '-01-01', to);
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], per = days.map((k, i) => { const d = addDays(from, i), x = W.bs.filter(b => String(b.createdAt).slice(0, 10) === d); return [x.filter(b => b.channel === 'direct').length, x.filter(b => b.channel !== 'direct').length]; });
    const top = Math.max(1, ...per.map(([a, b]) => a + b)), px = n => Math.round(120 * n / top);
    const qs = s.ai.questions || [], checked = !!s.ai.checkedAt && qs.length;
    const score = checked ? Math.round(100 * qs.reduce((n, q) => n + Object.values(q.engines).filter(Boolean).length, 0) / (qs.length * 4)) : null;
    const hm = await get('hostmail:' + w.id), eng = k => checked ? qs.filter(q => q.engines[k]).length + ' of ' + qs.length : '–';
    const task = (s.ai.tasks || []).find(t => !t.done);
    const other = Math.max(0, W.visits - W.search - W.ai), vmax = Math.max(1, W.search, W.ai, other);
    const insight = !W.bs.length ? 'No new bookings this week. ' + (W.visits ? W.visits + ' people looked at your site.' : 'Share your booking site link with past guests to get the first ones in.')
      : W.direct.length === W.bs.length ? 'Every new booking this week came direct, so no platform fees on any of them.'
      : W.direct.length + ' of ' + W.bs.length + ' new bookings came direct this week.';
    const v = Object.assign(base(w, 'report'), {
      week_range: shortRange(from, to), direct_revenue: money(W.revenue), direct_revenue_change: change(W.revenue, P.revenue), headline_insight: insight,
      fees_kept_week: money(W.revenue * AIRBNB_HOST_FEE), fees_kept_ytd: money(ytd.revenue * AIRBNB_HOST_FEE),
      ai_score: score == null ? '–' : score, ai_score_change: score == null || hm.aiScore == null ? '0' : (score - hm.aiScore >= 0 ? '+' : '') + (score - hm.aiScore),
      direct_share: pct(W.direct.length, W.bs.length), direct_share_4w: pct(F.direct.length, F.bs.length),
      term_1: 'Search engines', term_1_clicks: W.search, term_1_pct: Math.round(100 * W.search / vmax),
      term_2: 'AI assistants', term_2_clicks: W.ai, term_2_pct: Math.round(100 * W.ai / vmax),
      term_3: 'Links and typed in', term_3_clicks: other, term_3_pct: Math.round(100 * other / vmax),
      ai_questions: qs.length, ai_chatgpt: eng('chatgpt'), ai_gemini: eng('gemini'), ai_perplexity: eng('perplexity'), ai_google: eng('google'),
      ai_next_fix: checked ? (task ? task.title || task.text || task.name : 'answer the questions guests ask most in your FAQs') : 'your first check runs once AI visibility is switched on',
      bookings_week: W.bs.length, bookings_direct: W.direct.length, site_visits: W.visits.toLocaleString('en-GB'), site_visits_change: change(W.visits, P.visits) + ' vs last week',
      ai_url: cfg.baseUrl + '/app', report_settings_url: cfg.baseUrl + '/app/account#emails' });
    [W.search, W.ai, other].forEach((n, i) => { v['term_' + (i + 1) + '_fill'] = n ? '#2747F5' : '#E4E9FF'; v['term_' + (i + 1) + '_pct'] = Math.max(1, v['term_' + (i + 1) + '_pct']); });
    days.forEach((k, i) => { v[k + '_direct_px'] = px(per[i][0]); v[k + '_platform_px'] = px(per[i][1]); });
    return { v, W, score };
  }
  async function sendReport(w, from, to) {
    const { v, W, score } = await report(w, from, to);
    if (!W.bs.length && !W.visits) return 'skip'; // nothing happened: no email
    const r = await send(w, 'host-t04-weekly-report', 'Your week: ' + v.direct_revenue + ' direct, ' + v.fees_kept_week + ' in fees kept', v,
      v.week_range + ': ' + v.bookings_week + ' new bookings, ' + v.bookings_direct + ' direct (' + v.direct_revenue + '). ' + v.site_visits + ' site visits.', 'report');
    if (score != null) { const hm = await get('hostmail:' + w.id); hm.aiScore = score; await put('hostmail:' + w.id, hm); }
    return r;
  }

  /* ---------- schedule: called from the background job every minute ---------- */
  async function run(now = Date.now()) {
    let sent = 0;
    await leads.loadSettings();
    for (const id of await ws.liveIds()) {
      const row = await ws.row(id); if (!row || row.billing_status === 'cancelled') continue;
      const w = await ws.open(id); if (!w || !w.state.account.email) continue;
      const hm = await get('hostmail:' + id), pr = await prefs(id), age = now - row.created_at, uk = ukParts(now);
      const mark = (k, val) => { hm[k] = val; return put('hostmail:' + id, hm); };
      try {
        if (!hm.checklist && age >= 2 * DAY && uk.hour >= 9) { await mark('checklist', now); if (pr.setup && age < 5 * DAY) { const r = await sendChecklist(w, row.created_at); if (r !== 'skip') sent++; } }
        if (!hm.week3 && age >= 21 * DAY && uk.hour >= 9) { await mark('week3', now); if (pr.setup && age < 30 * DAY) { const r = await sendWeek3(w); if (r !== 'skip') sent++; } }
        // Monday from 8am, for the week that just ended (Monday to Sunday, UK time)
        if (uk.wd === 'Mon' && uk.hour >= 8 && age >= DAY / 2) {
          const from = addDays(uk.date, -7), to = addDays(uk.date, -1);
          if (hm.report !== from) { await mark('report', from); if (pr.report) { const r = await sendReport(w, from, to); if (r !== 'skip') sent++; } }
        }
      } catch (e) { log('host email', id, e.message); }
    }
    return sent;
  }

  /* ---------- Stripe: a plan payment failed ---------- */
  async function paymentFailed(wid, inv, card) {
    const w = await ws.open(wid); if (!w) return;
    const v = Object.assign(base(w, null), {
      amount_due: money((inv.amount_due || 0) / 100), failed_date: longDate(ukParts((inv.created || Date.now() / 1000) * 1000).date),
      next_retry_date: inv.next_payment_attempt ? shortDate(ukParts(inv.next_payment_attempt * 1000).date) : 'soon',
      card_brand: card && card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Your card', card_last4: card && card.last4 ? card.last4 : '····',
      decline_reason: card && card.reason ? String(card.reason).replace(/_/g, ' ') : 'not given' });
    return send(w, 'host-t02-payment-failed', 'Action needed: your Bookingbooster payment did not go through', v,
      'Hi ' + v.first_name + ', we could not take ' + v.amount_due + '. Stripe tries again on ' + v.next_retry_date + '. Update your card: ' + v.billing_url, null);
  }

  return { run, paymentFailed, report, checklist, prefs, setPrefs, unsubUrl: unsub, verifyUnsub: (wid, kind, sig) => ['setup', 'report'].includes(kind) && auth.verify(sig, 'hostmail', wid, kind) };
};
