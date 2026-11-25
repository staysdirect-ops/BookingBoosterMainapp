// Team email campaigns: the Bookingbooster team markets to leads and host accounts from /admin/campaigns.
//
// Two kinds of campaign:
//  - designed: the five designed templates in server/emails/host-m*.html (fee check, AI search, demo invite, digest,
//    yearly offer). They go to leads only, and each one works out who it fits from what the lead told us.
//  - custom: written in /admin (heading, text, a button) and sent in the branded layout, to any audience below.
//
// Audiences: leads who asked for our emails (all, or by form), host accounts (all, or by billing state), or both.
// Always left out: anyone who unsubscribed (lead_optout), leads who signed up or whose emails the team stopped,
// and hosts who turned off "News and offers" (hostprefs:<id>.news === false).
//
// Nothing goes out until someone sends themselves a test and confirms the recipient count. A campaign is sent once:
// the people it reached are recorded, so a retry or a second press skips them. Big lists send in batches: the first
// batch at once, the rest from the background job (every minute locally, every few minutes on Supabase).
// Scheduled campaigns start from the same job when their time comes.
//
// Opens (a 1x1 image) and clicks (signed redirect links) are counted once per person. Unsubscribes that came from a
// campaign's own link are credited to it. Everything lives in the kv table, so no schema change is needed:
//   campaign:<id>          the campaign (settings, status, who it reached)
//   campaigns:index        ids of campaigns made in /admin (the designed ones are always there)
//   campaign-lock:<id>     held while a batch is sending
//   cst:<id>:<o|c|u>:<rid> one row per person who opened, clicked or unsubscribed
//   cst:<id>:l:<rid>:<h>   one row per person and link clicked (v = the link)
'use strict';
const crypto = require('crypto');

const AUDIENCE_SEQS = ['fee', 'audit', 'webinar', 'call'];
const AIRBNB_GUEST_FEE = 0.14, GROWTH_YEAR = 197 * 12;
const pounds = n => '£' + Math.round(n).toLocaleString('en-GB');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Who a campaign can go to. Labels show in /admin.
const AUDIENCES = {
  'leads:all': { label: 'All leads', about: 'Everyone who asked for our tips, an audit, the live demo or a call' },
  'leads:fee': { label: 'Leads: Fee Leak Calculator', about: 'Leads from the fee leak opt-in' },
  'leads:audit': { label: 'Leads: AI audit requests', about: 'Leads who asked for an AI search audit' },
  'leads:webinar': { label: 'Leads: live demo sign-ups', about: 'Leads who registered for the live demo' },
  'leads:call': { label: 'Leads: booked a call', about: 'Leads who booked a walkthrough call' },
  'hosts:all': { label: 'All host accounts', about: 'Every host with a Bookingbooster account' },
  'hosts:active': { label: 'Hosts: paying', about: 'Hosts whose plan is active' },
  'hosts:trial': { label: 'Hosts: not paid yet', about: 'Hosts who signed up but have not paid for their plan yet' },
  'hosts:past_due': { label: 'Hosts: payment failed', about: 'Hosts whose last plan payment failed' },
  'hosts:cancelled': { label: 'Hosts: cancelled', about: 'Hosts who cancelled their plan' },
  everyone: { label: 'Everyone', about: 'All leads and all host accounts (each email once)' },
};
const BATCH_MS = 20e3; // how long one request or job spends sending before handing over to the next run

module.exports = function ({ db, cfg, msg, auth, leads, hostMail, log }) {
  const q = {
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'),
    kvSet: db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)'),
    kvAdd: db.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?)'),
    kvDel: db.prepare('DELETE FROM kv WHERE k = ?'),
    kvLike: db.prepare('SELECT k, v FROM kv WHERE k LIKE ?'),
    kvDelLike: db.prepare('DELETE FROM kv WHERE k LIKE ?'),
    leads: db.prepare('SELECT l.id, l.email, l.name, l.kind, l.data, l.created_at, s.seq, s.status, s.vars FROM leads l JOIN lead_seq s ON s.lead_id = l.id ORDER BY l.created_at DESC'),
    hosts: db.prepare("SELECT u.email, u.name, w.id AS wid, w.slug, w.plan, w.billing_status FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE w.kind = 'live' ORDER BY w.created_at DESC"),
    optedOut: db.prepare('SELECT email FROM lead_optout'),
    users: db.prepare('SELECT lower(email) AS email FROM users'),
  };
  const get = async k => { const r = await q.kvGet.get(k); try { return r ? JSON.parse(r.v) : null; } catch (_) { return null; } };
  const put = (k, o) => q.kvSet.run(k, JSON.stringify(o));
  const app = p => cfg.baseUrl + p;
  const ukDate = (ms, o) => new Date(ms).toLocaleString('en-GB', Object.assign({ timeZone: 'Europe/London' }, o));

  // what one lead brings to every campaign
  function leadVars(l) {
    let d = {}, v = {}; try { d = JSON.parse(l.data || '{}'); } catch (_) {} try { v = JSON.parse(l.vars || '{}'); } catch (_) {}
    const prop = String(d.property || d.property_name || d.business || '').trim().slice(0, 80);
    return Object.assign({}, d, v, { first_name: String(l.name || '').trim().split(/\s+/)[0] || 'there', name: String(l.name || '').trim(), email: l.email, property_name: prop || 'your holiday let', business: prop || 'your holiday let', seq: l.seq });
  }

  /* ---------- the designed campaigns (leads only) ---------- */
  // needs: settings the team fills in once per campaign (shown as a form in /admin). fit(v): false, or a reason this lead is left out.
  const D = [
    { key: 'fee-check', tpl: 'host-m01-fee-leak', name: 'Fee check',
      about: 'Their own yearly Airbnb fees, from what they typed into the Fee Leak Calculator, and what a direct site keeps.',
      audience: 'Fee Leak Calculator leads who entered a nightly rate and nights a month',
      when: 'Any time. Works best a few weeks after they used the calculator.',
      subject: 'Your fee check: about {{fees_paid_last_year}} a year in Airbnb fees', preview: 'From your Fee Leak Calculator numbers: where a year of booking fees goes, and what a direct site keeps.',
      needs: [],
      fit(v) {
        if (v.seq !== 'fee' || !(+v.rate > 0) || !(+v.nights > 0)) return 'not a fee calculator lead with numbers';
        const nights = +v.nights * 12, gross = +v.rate * nights * (+v.homes || 1), pct = (+v.fee || 15.5) / 100, fees = gross * pct;
        if (GROWTH_YEAR / fees > 1) return 'their fees are lower than the plan costs';
        Object.assign(v, { nights_booked_last_year: Math.round(nights * (+v.homes || 1)).toLocaleString('en-GB'), avg_nightly_rate: pounds(+v.rate), gross_revenue_last_year: pounds(gross), host_fee_pct: (pct * 100).toLocaleString('en-GB') + '%',
          fees_paid_last_year: pounds(fees), guest_fees_last_year: pounds(gross * AIRBNB_GUEST_FEE), total_fees_last_year: pounds(fees + gross * AIRBNB_GUEST_FEE),
          kept_at_20: pounds(fees * 0.2), kept_at_40: pounds(fees * 0.4), kept_at_60: pounds(fees * 0.6), payback_share: Math.max(1, Math.ceil(100 * GROWTH_YEAR / fees)) + '%' });
        return false;
      } },
    { key: 'ai-search', tpl: 'host-m02-ai-search', name: 'AI search check',
      about: 'Shows how often their home came up in AI answers, with their audit link and the three fixes.',
      audience: 'AI audit leads whose audit result has been entered in Leads',
      when: 'About a week after their audit email, if they have not booked a call.',
      subject: 'Is ChatGPT recommending {{property_name}}?', preview: 'We asked the AI assistants the questions your guests ask. Here is how often your home came up.',
      needs: [['competitor_example_1', 'Example place named in the sample AI answer', 'Willow Barn'], ['competitor_example_2', 'Second example place', 'The Old Dairy']],
      fit(v) {
        if (v.seq !== 'audit' || !v.audit_url || v.mentions === undefined || v.mentions === '') return 'no audit result entered yet';
        Object.assign(v, { ai_mentions: v.mentions, ai_questions: 8, ai_report_url: v.audit_url, area_name: v.town && v.town !== 'your area' ? v.town : 'you' });
        return false;
      } },
    { key: 'demo-invite', tpl: 'host-m03-demo-invite', name: 'Demo invite',
      about: 'Invites them to click around the live demo and book a 15-minute walkthrough, with three times to pick from.',
      audience: 'All leads who have not booked a call yet',
      when: 'When you have three walkthrough times free in the next week.',
      subject: 'Try Bookingbooster before you decide', preview: 'Click around the real host console, then grab 15 minutes with us. No slide deck.',
      needs: [['slot_1_day', 'First time: day', 'Tue 10 Nov'], ['slot_1_time', 'First time: time (UK)', '10:00'], ['slot_2_day', 'Second time: day', 'Wed 11 Nov'], ['slot_2_time', 'Second time: time', '14:30'],
        ['slot_3_day', 'Third time: day', 'Thu 12 Nov'], ['slot_3_time', 'Third time: time', '18:00']],
      requires: () => leads.settings().book_call_url ? '' : 'Add the “Page where people book a walkthrough” link in Leads first.',
      fit: v => (v.seq === 'call' ? 'already booked a call' : false) },
    { key: 'digest', tpl: 'host-m04-newsletter', name: 'Direct Booking Digest',
      about: 'The monthly newsletter: filling January without the Airbnb discount, three tips and the gap-night update.',
      audience: 'All leads',
      when: 'First Tuesday of the month, 09:30 UK time. This issue suits October or November.',
      subject: 'Direct Booking Digest: filling January without the Airbnb discount', preview: 'One story, three tips and one product update for UK holiday let hosts. Five minutes.',
      needs: [['issue_number', 'Issue number', '1'], ['issue_month', 'Issue month', 'November 2026'], ['story_url', 'Link for “Read the full playbook”', app('/guides/direct-booking-playbook.pdf')], ['changelog_url', 'Link for “See what is new”', app('/demo')]],
      fit: () => false },
    { key: 'yearly-offer', tpl: 'host-m05-offer', name: 'Yearly offer: 2 months free',
      about: 'Pay yearly for Growth: £1,970 instead of £2,364. No setup fee.',
      audience: 'All leads',
      when: 'About 7 days before the offer ends. Make sure the yearly Stripe price is set up first.',
      subject: '2 months free if you go yearly (ends {{offer_end_date}})', preview: 'Pay yearly for Growth and get 2 months free. Ends {{offer_end_date}} at 23:59.',
      needs: [['offer_end', 'Offer ends (UK date, 23:59)', '', 'date']],
      requires: s => (s.offer_end && leads.ukAt(s.offer_end, '23:59') > Date.now() ? '' : 'Set an offer end date in the future.'),
      vars(s, now) {
        const end = leads.ukAt(s.offer_end, '23:59'), left = Math.max(0, end - now);
        return { offer_end_date: s.offer_end ? ukDate(end, { weekday: 'long', day: 'numeric', month: 'long' }) : '', days_left: Math.floor(left / 864e5), hours_left: Math.floor(left / 36e5) % 24, mins_left: Math.floor(left / 6e4) % 60,
          offer_url: app('/start?plan=Growth&annual=1') };
      },
      fit: () => false },
  ];
  const design = k => D.find(d => d.key === k);

  /* ---------- storing campaigns ---------- */
  const validId = id => /^[a-z0-9-]{2,40}$/.test(String(id || ''));
  const index = async () => (await get('campaigns:index')) || [];
  // fill in defaults so old records (and designed ones never opened) read the same way
  function shape(id, s) {
    const d = s && s.design ? design(s.design) : design(id);
    if (!s && !d) return null;
    s = Object.assign({ id, kind: d ? 'designed' : 'custom', design: d ? d.key : '', name: d ? d.name : 'Untitled campaign', audience: d ? 'leads:all' : 'leads:all', status: 'draft',
      subject: d ? d.subject : '', preview: d ? d.preview : '', heading: '', body: '', button_label: '', button_url: '', sent: {}, failed: {}, sent_at: 0, scheduled_at: 0, started_at: 0, tests: 0, created_at: 0 }, s || {});
    if (d) s.settings = Object.assign({}, Object.fromEntries(d.needs.map(([k, , def]) => [k, def || ''])), s.settings);
    else s.settings = s.settings || {};
    s.failed = s.failed || {};
    return s;
  }
  async function load(id) { if (!validId(id)) return null; return shape(id, await get('campaign:' + id)); }
  const save = s => put('campaign:' + s.id, Object.assign(s, { updated_at: Date.now() }));
  async function all() {
    const ids = D.map(d => d.key).concat(await index());
    return (await Promise.all(ids.map(load))).filter(Boolean);
  }
  const defOf = s => (s.kind === 'designed' ? design(s.design) : null);

  async function create(o) {
    o = o || {}; const now = Date.now();
    const id = 'c-' + now.toString(36) + crypto.randomBytes(2).toString('hex');
    const s = shape(id, { id, kind: 'custom', name: String(o.name || 'New campaign').trim().slice(0, 80) || 'New campaign', audience: AUDIENCES[o.audience] ? o.audience : 'leads:all',
      subject: '', preview: '', heading: '', body: 'Hi {{first_name}},\n\n', button_label: '', button_url: '', created_at: now });
    await save(s); await put('campaigns:index', (await index()).concat(id)); return s;
  }
  // a copy of any campaign as a new draft (send the digest again next month, reuse a good email for another list)
  async function duplicate(id) {
    const src = await load(id); if (!src) return null; const now = Date.now();
    const nid = 'c-' + now.toString(36) + crypto.randomBytes(2).toString('hex');
    const s = shape(nid, { id: nid, kind: src.kind, design: src.design, name: (src.name + ' (copy)').slice(0, 80), audience: src.audience, subject: src.subject, preview: src.preview, heading: src.heading, body: src.body,
      button_label: src.button_label, button_url: src.button_url, settings: Object.assign({}, src.settings), created_at: now });
    await save(s); await put('campaigns:index', (await index()).concat(nid)); return s;
  }
  async function remove(id) {
    const s = await load(id); if (!s || s.kind === 'designed' && D.some(d => d.key === id)) return { error: 'The designed campaigns stay. Make a copy instead.' };
    if (!['draft', 'cancelled'].includes(s.status)) return { error: 'Only drafts can be deleted. Sent campaigns are kept for their numbers.' };
    await q.kvDel.run('campaign:' + id); await put('campaigns:index', (await index()).filter(x => x !== id)); await q.kvDelLike.run('cst:' + id + ':%');
    return { ok: true };
  }
  const editable = s => ['draft', 'cancelled'].includes(s.status);
  const url = v => { v = String(v || '').trim(); return /^https?:\/\/[^\s"<>]+$/i.test(v) || /^mailto:[^\s"<>]+$/i.test(v) ? v.slice(0, 500) : ''; };
  async function update(id, patch) {
    const s = await load(id); if (!s) return null; if (!editable(s)) return s;
    const d = defOf(s), str = (k, n) => { if (patch[k] !== undefined) s[k] = String(patch[k]).trim().slice(0, n); };
    if (patch.name !== undefined) s.name = String(patch.name).trim().slice(0, 80) || s.name;
    if (patch.subject !== undefined) s.subject = String(patch.subject).trim().slice(0, 150) || (d ? d.subject : '');
    if (patch.preview !== undefined) s.preview = String(patch.preview).trim().slice(0, 200) || (d ? d.preview : '');
    if (d) { for (const [k] of d.needs) if (patch[k] !== undefined) s.settings[k] = String(patch[k]).trim().slice(0, 300); }
    else {
      if (patch.audience !== undefined && AUDIENCES[patch.audience]) s.audience = patch.audience;
      str('heading', 150); if (patch.body !== undefined) s.body = String(patch.body).replace(/\r\n/g, '\n').slice(0, 20000); str('button_label', 60);
      if (patch.button_url !== undefined) s.button_url = url(patch.button_url) || String(patch.button_url).trim().slice(0, 500);
    }
    if (s.status === 'cancelled') s.status = 'draft';
    await save(s); return s;
  }

  /* ---------- who gets it ---------- */
  async function recipients(s) {
    const d = defOf(s), aud = d ? 'leads:all' : s.audience;
    const opted = new Set((await q.optedOut.all()).map(r => String(r.email).toLowerCase())), users = new Set((await q.users.all()).map(r => r.email));
    const seen = new Set(), list = [], skipped = {};
    const skip = r => { skipped[r] = (skipped[r] || 0) + 1; };
    const wantHosts = aud === 'everyone' || aud.startsWith('hosts:'), wantLeads = aud === 'everyone' || aud.startsWith('leads:');
    if (wantHosts) {
      const st = aud.split(':')[1];
      for (const h of await q.hosts.all()) {
        const e = String(h.email || '').toLowerCase(); if (!e || seen.has(e)) continue;
        if (st && st !== 'all' && (h.billing_status || 'trial') !== st) continue;
        seen.add(e);
        if (opted.has(e)) { skip('unsubscribed'); continue; }
        if ((await hostMail.prefs(h.wid)).news === false) { skip('turned off news and offers'); continue; }
        const first = String(h.name || '').trim().split(/\s+/)[0] || 'there';
        list.push({ rid: 'h' + h.wid, email: h.email, kind: 'host', wid: h.wid, v: { first_name: first, name: String(h.name || '').trim(), email: h.email, business: h.slug, property_name: h.slug, plan: h.plan || '' } });
      }
    }
    if (wantLeads) {
      const seq = aud.startsWith('leads:') && aud !== 'leads:all' ? aud.split(':')[1] : '';
      const leadSeen = new Set();
      for (const l of await q.leads.all()) {
        const e = String(l.email || '').toLowerCase(); if (!e || leadSeen.has(e)) continue; leadSeen.add(e); // newest form per person
        if (seen.has(e)) continue; // already in as a host
        if (!AUDIENCE_SEQS.includes(l.seq)) { skip('enquiry only, never asked for tips'); continue; }
        if (seq && l.seq !== seq) continue;
        if (opted.has(e) || l.status === 'unsubscribed') { skip('unsubscribed'); continue; }
        if (users.has(e) || l.status === 'converted') { skip('signed up already'); continue; }
        if (l.status === 'stopped') { skip('emails stopped by the team'); continue; }
        const v = leadVars(l), why = d ? d.fit(v) : false; if (why) { skip(why); continue; }
        seen.add(e); list.push({ rid: 'l' + l.id, email: l.email, kind: 'lead', lead: l, v });
      }
    }
    return { list, skipped };
  }
  async function audienceCounts() {
    const out = {};
    for (const k of Object.keys(AUDIENCES)) out[k] = (await recipients({ kind: 'custom', audience: k })).list.length;
    return out;
  }

  /* ---------- building the email ---------- */
  const unsubFor = (s, r) => !r ? '#' : (r.kind === 'host' ? hostMail.unsubUrl(r.wid, 'news') : cfg.baseUrl + '/u/lead/' + r.lead.id + '/' + auth.sign('lead', r.lead.id)) + '?c=' + encodeURIComponent(s.id);
  function common(s, r, now) {
    const d = defOf(s), unsub = unsubFor(s, r);
    return Object.assign({ site_url: cfg.baseUrl, demo_url: app('/demo'), signup_url: app('/start?plan=Growth'), account_url: r && r.kind === 'host' ? app('/app/account') : app('/start?plan=Growth'), dashboard_url: app('/app'),
      help_url: 'mailto:' + cfg.company.support, privacy_url: app('/privacy'), unsubscribe_url: unsub, preferences_url: r && r.kind === 'host' ? app('/app/account#emails') : unsub,
      book_call_url: leads.settings().book_call_url || app('/demo'), company_address: cfg.company.address, company_number: cfg.company.number, vat_number: cfg.company.vat }, s.settings, d && d.vars ? d.vars(s.settings, now) : {});
  }
  const fillText = (t, v) => String(t || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (m, k) => (v[k] == null ? '' : String(v[k])));
  // the team's text: blank lines make paragraphs, "- " lines make a list, **bold**, [words](https://link) and bare links
  function markdown(t, v) {
    const inline = x => esc(fillText(x, v)).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" style="color:#3355FF">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" style="color:#3355FF">$2</a>');
    return String(t || '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
      const lines = b.split('\n');
      if (lines.every(l => /^\s*[-*•]\s+/.test(l))) return '<ul style="margin:0 0 16px;padding-left:20px">' + lines.map(l => '<li style="margin:0 0 6px">' + inline(l.replace(/^\s*[-*•]\s+/, '')) + '</li>').join('') + '</ul>';
      return '<p style="margin:0 0 16px">' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }
  const plainText = (t, v) => fillText(t, v).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  function customEmail(s, v) {
    const why = v._kind === 'host' ? 'You are getting this because you have a Bookingbooster account.' : 'You are getting this because you asked for it on our website.';
    const btn = s.button_label && s.button_url ? '<p style="margin:8px 0 24px"><a href="' + esc(fillText(s.button_url, v)) + '" style="display:inline-block;background:#3355FF;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">' + esc(fillText(s.button_label, v)) + '</a></p>' : '';
    const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(fillText(s.subject, v)) + '</title></head><body style="margin:0;background:#F4F5F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141A33">' +
      '<div style="display:none;max-height:0;overflow:hidden">' + esc(fillText(s.preview, v)) + '</div>' +
      '<div style="max-width:560px;margin:0 auto;padding:24px 16px"><p style="margin:0 0 16px"><img src="' + esc(app('/email-img/brand/logo.png')) + '" alt="bookingbooster" height="28" style="height:28px;border:0"></p>' +
      '<div style="background:#fff;border-radius:16px;padding:28px 24px;font-size:16px;line-height:1.55">' +
      (s.heading ? '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#141A33">' + esc(fillText(s.heading, v)) + '</h1>' : '') + markdown(s.body, v) + btn +
      '<p style="margin:0 0 4px">Thanks,</p><p style="margin:0">' + esc(cfg.leads.signoff) + '</p></div>' +
      '<div style="padding:16px 8px"><p style="margin:0;color:#8A90A6;font-size:12px;line-height:1.5">' + esc(cfg.company.name) + ' · United Kingdom · ' + why + ' <a href="' + esc(v.unsubscribe_url) + '" style="color:#8A90A6">Unsubscribe in one click</a></p></div></div></body></html>';
    const text = [s.heading ? fillText(s.heading, v) : '', plainText(s.body, v).trim(), btn ? fillText(s.button_label, v) + ': ' + fillText(s.button_url, v) : '', 'Thanks,\n' + cfg.leads.signoff, 'Unsubscribe: ' + v.unsubscribe_url].filter(Boolean).join('\n\n');
    return { html, text };
  }
  function render(s, v) {
    const d = defOf(s); v = Object.assign({}, v, { subject: fillText(s.subject, v) });
    if (!d) { const r = customEmail(s, v); return { subject: v.subject, html: r.html, text: r.text }; }
    let html = msg.template(d.tpl, v);
    const pre = fillText(s.preview, v); // the template's hidden preview line is the default; swap in the team's
    html = html.replace(/(<div[^>]*display:none[^>]*>)([^<]*)/, (m, a) => a + esc(pre));
    const text = 'Hi ' + v.first_name + ',\n\n' + pre + '\n\nRead it in your browser or reply to this email.\n\n' + cfg.leads.signoff + '\n\nUnsubscribe: ' + v.unsubscribe_url;
    return { subject: v.subject, html, text };
  }

  // open and click tracking for one person: a pixel, and every web link through a signed redirect
  const tsig = (id, rid) => auth.sign('mc', id, rid);
  const linkSig = u => auth.sign('mcu', u);
  function track(html, s, r) {
    const base = cfg.baseUrl + '/t/m/' + s.id + '/' + r.rid + '/' + tsig(s.id, r.rid);
    html = html.replace(/href="(https?:\/\/[^"]+)"/g, (m, h) => {
      const u = h.replace(/&amp;/g, '&');
      if (u.includes('/u/lead/') || u.includes('/u/host/') || u.includes('/app/account#emails')) return m; // unsubscribe links stay direct
      return 'href="' + base + '/c?u=' + encodeURIComponent(u) + '&amp;k=' + linkSig(u) + '"';
    });
    const px = '<img src="' + base + '/o.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">';
    return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, px + '</body>') : html + px;
  }
  async function hit(id, rid, sig, type, u, k) {
    if (!validId(id) || !/^[hl][A-Za-z0-9_-]{1,60}$/.test(rid) || !auth.verify(sig, 'mc', id, rid)) return { ok: false };
    const now = String(Date.now());
    await q.kvAdd.run('cst:' + id + ':o:' + rid, now);
    let to = '';
    if (type === 'c') {
      if (u && auth.verify(k, 'mcu', u) && /^(https?:|mailto:)/i.test(u)) to = u;
      await q.kvAdd.run('cst:' + id + ':c:' + rid, now);
      if (to) await q.kvAdd.run('cst:' + id + ':l:' + rid + ':' + crypto.createHash('sha1').update(to).digest('hex').slice(0, 10), to);
    }
    return { ok: true, to };
  }
  async function unsubscribed(id, rid) { if (validId(id) && rid) await q.kvAdd.run('cst:' + id + ':u:' + rid, String(Date.now())); }

  async function stats(id) {
    const rows = await q.kvLike.all('cst:' + id + ':%'), n = { o: 0, c: 0, u: 0 }, links = {};
    for (const r of rows) { const t = r.k.split(':')[2]; if (t === 'l') links[r.v] = (links[r.v] || 0) + 1; else if (n[t] != null) n[t]++; }
    return { opens: n.o, clicks: n.c, unsubs: n.u, links: Object.entries(links).sort((a, b) => b[1] - a[1]).slice(0, 20) };
  }

  /* ---------- previews and tests ---------- */
  const SAMPLE = { fee: { seq: 'fee', rate: 210, nights: 16, homes: 1, fee: 15.5 }, audit: { seq: 'audit', town: 'Keswick', mentions: 1, audit_url: '#' } };
  function sampleVars(s) {
    const d = defOf(s);
    const v = Object.assign({ first_name: 'Hannah', name: 'Hannah Lees', email: 'hannah@example.co.uk', property_name: 'Fellside Barn', business: 'Fellside Barn', seq: 'webinar' }, d && d.key === 'fee-check' ? SAMPLE.fee : d && d.key === 'ai-search' ? SAMPLE.audit : {});
    if (d) d.fit(v); return v;
  }
  function blockers(s) {
    const d = defOf(s), out = [];
    if (d) { out.push(...d.needs.filter(([k]) => !String(s.settings[k] || '').trim()).map(([, label]) => 'Fill in: ' + label)); const r = d.requires && d.requires(s.settings); if (r) out.push(r); }
    else {
      if (!s.subject) out.push('Add a subject.');
      if (!String(s.body || '').replace(/Hi \{\{first_name\}\},?/, '').trim()) out.push('Write the email.');
      if (s.button_label && !url(s.button_url)) out.push('The button needs a link starting with https://');
    }
    return out;
  }
  async function preview(id, now) {
    const s = await load(id); if (!s) return null;
    const first = (await recipients(s)).list[0];
    const v = Object.assign(common(s, first, now || Date.now()), first ? first.v : sampleVars(s), { _kind: first ? first.kind : (s.audience || '').startsWith('hosts:') ? 'host' : 'lead' });
    if (!first) v.unsubscribe_url = '#';
    return render(s, v);
  }
  // a test goes only to the signed-in team member, with the first real recipient's details (or the sample)
  async function sendTest(id, to) {
    const s = await load(id); if (!s) return { error: 'No such campaign' };
    const b = blockers(s).filter(x => !/^Fill in/.test(x)); if (!defOf(s) && b.length) return { error: b.join(' ') };
    const r = await preview(id);
    const res = await msg.sendEmail({ to, subject: '[Test] ' + r.subject, html: r.html, text: r.text, from: cfg.leads.from || undefined, replyTo: cfg.company.support, meta: { campaign: id, test: true } });
    s.tests = (s.tests || 0) + 1; s.last_test_to = to; await save(s);
    return res.ok ? { ok: true } : { error: res.error || 'Could not send' };
  }

  /* ---------- sending ---------- */
  async function ready(s, confirm) {
    if (!editable(s)) return { error: s.status === 'sent' ? 'This campaign has already gone out.' : 'This campaign is already ' + s.status + '.' };
    const b = blockers(s); if (b.length) return { error: b.join(' ') };
    if (!s.tests) return { error: 'Send yourself a test first.' };
    const todo = (await recipients(s)).list.filter(x => !s.sent[x.email.toLowerCase()]);
    if (!todo.length) return { error: 'Nobody to send to.' };
    if (String(confirm).trim() !== String(todo.length)) return { error: 'Type ' + todo.length + ' (the number of people) to confirm.' };
    return { ok: true, count: todo.length };
  }
  async function send(id, confirm, now) {
    now = now || Date.now();
    const s = await load(id); if (!s) return { error: 'No such campaign' };
    const ok = await ready(s, confirm); if (ok.error) return ok;
    Object.assign(s, { status: 'sending', started_at: now, scheduled_at: 0, planned: ok.count }); await save(s);
    const r = await pump(id, now + BATCH_MS);
    return Object.assign({ ok: true }, r);
  }
  async function schedule(id, at, confirm) {
    const s = await load(id); if (!s) return { error: 'No such campaign' };
    if (!(at > Date.now() + 60e3)) return { error: 'Pick a time at least a few minutes from now (UK time).' };
    const ok = await ready(s, confirm); if (ok.error) return ok;
    Object.assign(s, { status: 'scheduled', scheduled_at: at, planned: ok.count }); await save(s);
    return { ok: true, at, count: ok.count };
  }
  async function cancel(id) {
    const s = await load(id); if (!s) return { error: 'No such campaign' };
    if (s.status === 'scheduled') { s.status = 'draft'; s.scheduled_at = 0; await save(s); return { ok: true, note: 'Schedule cancelled. It is a draft again.' }; }
    if (s.status === 'sending') { s.status = 'stopped'; s.sent_at = Date.now(); await save(s); return { ok: true, note: 'Stopped. ' + Object.keys(s.sent).length + ' had already been sent.' }; }
    return { error: 'Nothing to cancel.' };
  }
  async function retry(id) {
    const s = await load(id); if (!s || !Object.keys(s.failed).length) return { error: 'Nothing to retry.' };
    s.failed = {}; s.status = 'sending'; await save(s);
    return Object.assign({ ok: true }, await pump(id, Date.now() + BATCH_MS));
  }

  // one sender per campaign at a time, across requests, the background job and function instances
  async function lock(id) {
    const k = 'campaign-lock:' + id, now = Date.now();
    if ((await q.kvAdd.run(k, String(now))).changes) return true;
    const r = await q.kvGet.get(k); if (r && now - +r.v > 120e3) { await q.kvDel.run(k); return (await q.kvAdd.run(k, String(now))).changes > 0; }
    return false;
  }
  const unlock = id => q.kvDel.run('campaign-lock:' + id);

  async function pump(id, deadline) {
    if (!await lock(id)) return { sent: 0, failed: 0, busy: true };
    let n = 0, failed = 0, left = 0;
    try {
      const s = await load(id); if (!s || s.status !== 'sending') return { sent: 0, failed: 0 };
      const now = Date.now();
      const todo = (await recipients(s)).list.filter(x => !s.sent[x.email.toLowerCase()] && !s.failed[x.email.toLowerCase()]);
      for (let i = 0; i < todo.length; i++) {
        if (Date.now() > deadline) { left = todo.length - i; break; }
        const x = todo[i], e = x.email.toLowerCase();
        const v = Object.assign(common(s, x, now), x.v, { _kind: x.kind }), r = render(s, v);
        const res = await msg.sendEmail({ workspaceId: x.kind === 'host' ? x.wid : undefined, to: x.email, subject: r.subject, html: track(r.html, s, x), text: r.text, from: cfg.leads.from || undefined, replyTo: cfg.company.support,
          unsubscribeUrl: v.unsubscribe_url, meta: { campaign: id, [x.kind]: x.kind === 'host' ? x.wid : x.lead.id, broadcast: true } });
        if (res.ok) { s.sent[e] = Date.now(); n++; } else { s.failed[e] = String(res.error || 'failed').slice(0, 120); failed++; log('campaign', id, e, res.error); }
        await save(s);
      }
      if (!left) { s.status = 'sent'; s.sent_at = Date.now(); await save(s); }
      return { sent: n, failed, left };
    } finally { await unlock(id); }
  }

  // background job: start scheduled campaigns that are due and carry on with any still sending
  async function run(now) {
    now = now || Date.now(); let total = 0;
    for (const s of await all()) {
      if (s.status === 'scheduled' && s.scheduled_at && s.scheduled_at <= now) { s.status = 'sending'; s.started_at = now; await save(s); }
      if (s.status === 'sending') total += (await pump(s.id, Date.now() + BATCH_MS)).sent;
    }
    return total;
  }

  async function overview() {
    return Promise.all((await all()).map(async s => {
      const d = defOf(s), a = await recipients(s);
      return { s, d, count: a.list.filter(x => !s.sent[x.email.toLowerCase()]).length, skipped: a.skipped, blocked: blockers(s), stats: s.status === 'draft' && !Object.keys(s.sent).length ? null : await stats(s.id), audienceLabel: d ? d.audience : AUDIENCES[s.audience].label };
    }));
  }

  return { AUDIENCES, designs: D, all, load, create, duplicate, remove, update, editable, recipients, audienceCounts, overview, preview, sendTest, send, schedule, cancel, retry, run, blockers, stats, hit, unsubscribed };
};
