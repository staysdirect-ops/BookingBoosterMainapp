// Team email campaigns to marketing leads, built from the designed templates in server/emails/host-m*.html.
// Each campaign starts as a draft. Nothing is sent until someone on the team opens it in /admin/campaigns,
// fills in what it needs, sends themselves a test and then confirms the send with the recipient count.
// Who can get them: leads whose form started a follow-up series (they asked for tips, an audit, a demo or a call),
// minus anyone who unsubscribed, signed up for an account or had their emails stopped by the team.
// State (subject, settings, who it went to) lives in the kv table under campaign:<key>.
'use strict';

const AUDIENCE_SEQS = ['fee', 'audit', 'webinar', 'call'];
const AIRBNB_GUEST_FEE = 0.14, GROWTH_YEAR = 200 * 12;
const pounds = n => '£' + Math.round(n).toLocaleString('en-GB');

module.exports = function ({ db, cfg, msg, auth, leads, log }) {
  const q = {
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'),
    kvSet: db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)'),
    leads: db.prepare('SELECT l.id, l.email, l.name, l.kind, l.data, l.created_at, s.seq, s.status, s.vars FROM leads l JOIN lead_seq s ON s.lead_id = l.id ORDER BY l.created_at DESC'),
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
    return Object.assign({}, d, v, { first_name: String(l.name || '').trim().split(/\s+/)[0] || 'there', property_name: prop || 'your holiday let', seq: l.seq });
  }

  /* ---------- the campaigns ---------- */
  // needs: settings the team fills in once per campaign (shown as a form in /admin). fit(v): false, or a reason this lead is left out.
  const C = [
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
      about: 'Pay yearly for Growth: £2,000 instead of £2,400. The £997 setup fee and free first month still apply.',
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
  const byKey = k => C.find(c => c.key === k);

  async function state(c) {
    const s = await get('campaign:' + c.key) || {};
    const settings = Object.assign({}, Object.fromEntries(c.needs.map(([k, , d]) => [k, d || ''])), s.settings);
    return Object.assign({ status: 'draft', subject: c.subject, preview: c.preview, sent: {}, sent_at: 0, tests: 0 }, s, { settings });
  }
  async function save(key, patch) {
    const c = byKey(key); if (!c) return null;
    const s = await state(c); if (s.status === 'sent') return s;
    if (patch.subject !== undefined) s.subject = String(patch.subject).trim().slice(0, 150) || c.subject;
    if (patch.preview !== undefined) s.preview = String(patch.preview).trim().slice(0, 200) || c.preview;
    for (const [k] of c.needs) if (patch[k] !== undefined) s.settings[k] = String(patch[k]).trim().slice(0, 300);
    await put('campaign:' + key, s); return s;
  }

  // footer and links the designed templates expect; lead is null for previews
  function common(c, s, lead, now) {
    const unsub = lead ? cfg.baseUrl + '/u/lead/' + lead.id + '/' + auth.sign('lead', lead.id) : '#';
    return Object.assign({ site_url: cfg.baseUrl, demo_url: app('/demo'), signup_url: app('/start?plan=Growth'), account_url: app('/start?plan=Growth'), help_url: 'mailto:' + cfg.company.support,
      privacy_url: app('/privacy'), unsubscribe_url: unsub, preferences_url: unsub, book_call_url: leads.settings().book_call_url || app('/demo'),
      company_address: cfg.company.address, company_number: cfg.company.number, vat_number: cfg.company.vat }, s.settings, c.vars ? c.vars(s.settings, now) : {});
  }
  const fillText = (t, v) => String(t).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (m, k) => (v[k] == null ? '' : String(v[k])));
  function render(c, s, v) {
    v = Object.assign({}, v, { subject: fillText(s.subject, v) });
    let html = msg.template(c.tpl, v);
    const pre = fillText(s.preview, v); // the template's hidden preview line is the default; swap in the team's
    html = html.replace(/(<div[^>]*display:none[^>]*>)([^<]*)/, (m, a) => a + pre.replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x])));
    const text = 'Hi ' + v.first_name + ',\n\n' + fillText(s.preview, v) + '\n\nRead it in your browser or reply to this email.\n\n' + cfg.leads.signoff + '\n\nUnsubscribe: ' + v.unsubscribe_url;
    return { subject: v.subject, html, text };
  }

  // sample person for previews, from the template's own QA values, run through fit() so the numbers add up
  const SAMPLE = { fee: { seq: 'fee', rate: 210, nights: 16, homes: 1, fee: 15.5 }, audit: { seq: 'audit', town: 'Keswick', mentions: 1, audit_url: '#' } };
  function sampleVars(c) {
    const v = Object.assign({ first_name: 'Hannah', property_name: 'Fellside Barn', seq: 'webinar' }, c.key === 'fee-check' ? SAMPLE.fee : c.key === 'ai-search' ? SAMPLE.audit : {});
    c.fit(v); return v;
  }

  async function audience(c) {
    const out = (await q.optedOut.all()).map(r => String(r.email).toLowerCase()), users = new Set((await q.users.all()).map(r => r.email));
    const opted = new Set(out), seen = new Set(), list = [], skipped = {};
    const skip = r => { skipped[r] = (skipped[r] || 0) + 1; };
    for (const l of await q.leads.all()) {
      const e = String(l.email || '').toLowerCase(); if (!e || seen.has(e)) continue; seen.add(e); // newest form per person
      if (!AUDIENCE_SEQS.includes(l.seq)) { skip('enquiry only, never asked for tips'); continue; }
      if (opted.has(e) || l.status === 'unsubscribed') { skip('unsubscribed'); continue; }
      if (users.has(e) || l.status === 'converted') { skip('signed up already'); continue; }
      if (l.status === 'stopped') { skip('emails stopped by the team'); continue; }
      const v = leadVars(l), why = c.fit(v); if (why) { skip(why); continue; }
      list.push({ lead: l, v });
    }
    return { list, skipped };
  }

  async function overview() {
    return Promise.all(C.map(async c => { const s = await state(c), a = await audience(c); return { c, s, count: a.list.filter(x => !s.sent[x.lead.email.toLowerCase()]).length, skipped: a.skipped, blocked: blockers(c, s) }; }));
  }
  function blockers(c, s) {
    const out = c.needs.filter(([k]) => !String(s.settings[k] || '').trim()).map(([, label]) => 'Fill in: ' + label);
    const r = c.requires && c.requires(s.settings); if (r) out.push(r);
    return out;
  }

  async function preview(key, now) {
    const c = byKey(key); if (!c) return null; const s = await state(c);
    const a = await audience(c), first = a.list[0];
    return render(c, s, Object.assign(common(c, s, null, now || Date.now()), first ? first.v : sampleVars(c)));
  }

  // a test goes only to the signed-in team member, with the first real recipient's details (or the sample)
  async function sendTest(key, to) {
    const c = byKey(key); if (!c) return { error: 'No such campaign' }; const s = await state(c);
    const r = await preview(key);
    const res = await msg.sendEmail({ to, subject: '[Test] ' + r.subject, html: r.html, text: r.text, from: cfg.leads.from || undefined, replyTo: cfg.company.support, meta: { campaign: key, test: true } });
    s.tests = (s.tests || 0) + 1; await put('campaign:' + key, s);
    return res.ok ? { ok: true } : { error: res.error || 'Could not send' };
  }

  // the real send: only when confirm matches the number about to receive it. Safe to press again after a time-out:
  // anyone already sent to is skipped.
  async function send(key, confirm, now) {
    now = now || Date.now();
    const c = byKey(key); if (!c) return { error: 'No such campaign' };
    const s = await state(c); if (s.status === 'sent') return { error: 'This campaign has already gone out.' };
    const b = blockers(c, s); if (b.length) return { error: b.join(' ') };
    if (!s.tests) return { error: 'Send yourself a test first.' };
    const todo = (await audience(c)).list.filter(x => !s.sent[x.lead.email.toLowerCase()]);
    if (!todo.length) return { error: 'Nobody to send to.' };
    if (String(confirm).trim() !== String(todo.length)) return { error: 'Type ' + todo.length + ' (the number of people) to confirm.' };
    let n = 0, failed = 0;
    for (const x of todo) {
      const v = Object.assign(common(c, s, x.lead, now), x.v), r = render(c, s, v);
      const res = await msg.sendEmail({ to: x.lead.email, subject: r.subject, html: r.html, text: r.text, from: cfg.leads.from || undefined, replyTo: cfg.company.support, unsubscribeUrl: v.unsubscribe_url,
        meta: { campaign: key, lead: x.lead.id, broadcast: true } });
      if (res.ok) { s.sent[x.lead.email.toLowerCase()] = now; n++; } else { failed++; log('campaign', key, x.lead.id, res.error); }
      if (n % 20 === 0) await put('campaign:' + key, s);
    }
    if (!failed) { s.status = 'sent'; s.sent_at = now; }
    await put('campaign:' + key, s);
    return { ok: true, sent: n, failed };
  }

  return { list: C, byKey, state, save, overview, preview, sendTest, send, blockers };
};
