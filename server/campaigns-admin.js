// The team's email campaign pages in /admin/campaigns (logic in server/campaigns.js). Team only: index.js checks
// ADMIN_EMAILS before calling this. Server-rendered forms in the team admin frame, like the rest of /admin.
'use strict';

// Uses the team admin frame (server/admin-shell.js), which shares the host console's look.

module.exports = function ({ campaigns, leads, cfg, E, ui, email, send, redirect, formBody, me }) {
  const day = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '–');
  const sentCount = s => Object.keys(s.sent || {}).length;
  const failedCount = s => Object.keys(s.failed || {}).length;
  const field = (n, v, label, o) => ui.field(n, v, label, o);
  const audSelect = (cur, counts) => ui.field('audience', cur, 'Who gets it', { options: Object.entries(campaigns.AUDIENCES).map(([k, a]) => [k, a.label + (counts ? ' (' + counts[k] + ')' : '')]) });
  const page = async (res, o) => send(res, 200, ui.shell(Object.assign({ email: await email(), active: 'campaigns' }, o)), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });

  function badge(o) {
    const s = o.s;
    if (s.status === 'sent') return ui.pill('good', 'Sent ' + day(s.sent_at));
    if (s.status === 'sending') return ui.pill('info', 'Sending · ' + sentCount(s) + ' so far');
    if (s.status === 'scheduled') return ui.pill('info', 'Scheduled ' + day(s.scheduled_at));
    if (s.status === 'stopped') return ui.pill('muted', 'Stopped · ' + sentCount(s) + ' sent');
    return o.blocked.length ? ui.pill('warn', 'Draft · needs details') : ui.pill('muted', 'Draft · ready');
  }
  const tiles = list => '<div class="adm-kpis">' + list.map(([n, l, hi]) => ui.kpi(l, n, '', '', hi)).join('') + '</div>';

  /* ---------- the list ---------- */
  async function listPage(res, note, err) {
    const all = await campaigns.overview(), counts = await campaigns.audienceCounts();
    const done = all.filter(o => ['sent', 'stopped', 'sending'].includes(o.s.status));
    const totSent = done.reduce((a, o) => a + sentCount(o.s), 0), totOpen = done.reduce((a, o) => a + o.stats.opens, 0), totClick = done.reduce((a, o) => a + o.stats.clicks, 0), totUnsub = done.reduce((a, o) => a + o.stats.unsubs, 0);
    const row = o => {
      const s = o.s, n = sentCount(s), st = o.stats;
      return '<tr><td><a href="/admin/campaigns/' + s.id + '" style="color:inherit"><b>' + E(s.name) + '</b></a>' + (s.kind === 'designed' ? ' <span class="adm-help">· designed</span>' : '') + '<small>' + E(s.subject || 'No subject yet') + '</small></td>' +
        '<td class="wrap">' + E(o.audienceLabel) + '</td><td>' + badge(o) + '</td>' +
        '<td class="num">' + (n ? '<b>' + n + '</b> sent' : '<b>' + o.count + '</b> can get it') + '</td>' +
        '<td class="num">' + (st && n ? '<b>' + pct(st.opens, n) + '</b> opened<small>' + pct(st.clicks, n) + ' clicked' + (st.unsubs ? ' · ' + st.unsubs + ' unsubscribed' : '') + '</small>' : '<span class="adm-help">–</span>') + '</td>' +
        '<td><div class="adm-inline"><a class="btn sm" href="/admin/campaigns/' + s.id + '">Open</a><form method="post" action="/admin/campaigns/' + s.id + '/duplicate"><button class="btn sm ghost">Copy</button></form></div></td></tr>';
    };
    const table = (title, list, empty) => '<section class="a-card a-flush" style="margin-top:16px"><div class="a-card-h" style="padding:18px 20px 0"><h3>' + title + '</h3><div class="a-card-m">' + list.length + '</div></div>' + ui.table(['Campaign', 'Audience', 'Status', 'People', 'Results', ''], list.map(row), empty) + '</section>';
    const byNew = (a, b) => (b.s.sent_at || b.s.scheduled_at || b.s.updated_at || 0) - (a.s.sent_at || a.s.scheduled_at || a.s.updated_at || 0);
    const active = all.filter(o => ['scheduled', 'sending'].includes(o.s.status)), drafts = all.filter(o => ['draft', 'cancelled'].includes(o.s.status)).sort((a, b) => (a.s.kind === 'designed') - (b.s.kind === 'designed') || byNew(a, b)), sent = all.filter(o => ['sent', 'stopped'].includes(o.s.status)).sort(byNew);
    const auto = Object.values(leads.series || {}).map(sq => '<div><span><b>' + E(sq.name) + '</b><small>' + sq.steps.map(st => E(st.key) + (typeof st.subject === 'function' ? '' : ': ' + E(st.subject))).join('<br>') + '</small></span></div>').join('');
    const newForm = '<details class="a-card" id="new"' + (all.some(o => o.s.kind === 'custom') ? '' : ' open') + '><summary class="a-card-h"><h3>New campaign</h3></summary><form class="adm-form" method="post" action="/admin/campaigns/new"><div class="adm-two">' + field('name', '', 'Name (only the team sees this)', { ph: 'e.g. December newsletter', req: true }) + audSelect('leads:all', counts) + '</div>' +
      '<div class="row"><button class="btn primary">' + ui.icon('plus') + 'Create draft</button><span class="adm-help">Or press <b>Copy</b> on any campaign below to start from it, including the five designed ones.</span></div></form></details>';
    return page(res, { title: 'Email campaigns', note, err, sub: 'Write an email, pick who gets it, send yourself a test, then send it now or schedule it. Nothing goes out until you confirm the number of people, and anyone who unsubscribed is always left out.',
      actions: '<a class="btn sm" href="/admin/emails">' + ui.icon('doc') + 'All email templates</a>',
      body: tiles([[done.length, 'Campaigns sent'], [totSent.toLocaleString('en-GB'), 'Emails delivered'], [pct(totOpen, totSent), 'Opened (unique)'], [pct(totClick, totSent), 'Clicked a link', true], [totUnsub, 'Unsubscribed from a campaign']]) +
        newForm + (active.length ? table('Scheduled and sending', active, '') : '') + table('Drafts', drafts, 'No drafts.') + table('Sent', sent, 'Nothing sent yet.') +
        '<div class="adm-cols" style="margin-top:16px">' + '<section class="a-card a-flush"><div class="a-card-h" style="padding:18px 20px 0"><h3>Audiences</h3><div class="a-card-m">can get emails now</div></div>' + ui.table(['Audience', 'Who', '>People'], Object.entries(campaigns.AUDIENCES).map(([k, a]) => '<tr><td><b>' + E(a.label) + '</b></td><td class="wrap">' + E(a.about) + '</td><td class="r num"><b>' + counts[k] + '</b></td></tr>')) +
        '<p class="adm-help" style="padding:12px 20px 16px;margin:0">Leads come from the website forms. Contact-form enquiries are never included, because they did not ask for emails. Hosts can turn off “News and offers” in their account page or with the link in each email.</p></section>' +
        ui.card('Automatic emails already running', 'send by themselves', '<p class="adm-help" style="margin:0 0 6px">From each lead form (see Leads), and to hosts after sign-up: welcome, day-2 checklist, site live, week-3 tips, Monday report, payment failed.</p><div class="adm-list">' + auto + '</div>') + '</div>' });
  }

  /* ---------- write a new email: the one-page start ---------- */
  async function writePage(res, f, err) {
    f = f || {}; const counts = await campaigns.audienceCounts(), designs = (await campaigns.overview()).filter(o => o.s.kind === 'designed');
    const form = ui.card('Your email', 'step 1 of 3', '<form class="adm-form" method="post" action="/admin/campaigns/new">' +
      '<div class="adm-two">' + audSelect(f.audience || 'leads:all', counts) + field('name', f.name || '', 'Name (only the team sees this)', { ph: 'e.g. December newsletter' }) + '</div>' +
      field('subject', f.subject || '', 'Subject', { req: true, ph: 'Fill your January gaps, {{first_name}}', help: 'Personal fields work here too, like <code>{{first_name}}</code>.' }) +
      field('preview', f.preview || '', 'Preview line (shown after the subject in the inbox)', { ph: 'Three quick wins for quiet weeks' }) +
      field('heading', f.heading || '', 'Heading (optional)', { ph: 'Fill January without the Airbnb discount' }) +
      field('body', f.body || 'Hi {{first_name}},\n\n', 'Email', { area: true, tall: true, help: 'Blank line for a new paragraph. Lines starting with <code>-</code> make a list. <code>**bold**</code>, <code>[words](https://link)</code>. Personal fields: <code>{{first_name}}</code> <code>{{property_name}}</code>. Links: <code>{{demo_url}}</code> <code>{{signup_url}}</code> <code>{{book_call_url}}</code>. The sign-off and unsubscribe link are added for you.' }) +
      '<div class="adm-two">' + field('button_label', f.button_label || '', 'Button text (optional)', { ph: 'Try the demo' }) + field('button_url', f.button_url || '', 'Button link', { ph: 'https://booking-booster.co.uk/demo' }) + '</div>' +
      '<div class="row"><button class="btn primary" name="then" value="test">' + ui.icon('mail') + 'Save and send me a test</button><button class="btn" name="then" value="save">Save and preview</button><span class="adm-help">Nothing goes to anyone else yet.</span></div></form>');
    const steps = ui.card('How it works', '', '<div class="adm-list"><div><span><b>1. Write it</b><small>Pick who gets it, then write the subject and the email.</small></span></div>' +
      '<div><span><b>2. Check it</b><small>A test goes to you only, and the preview shows it with a real person’s details.</small></span></div>' +
      '<div><span><b>3. Send or schedule</b><small>Type the number of people to confirm. Anyone who unsubscribed is always left out, and opens, clicks and unsubscribes are counted.</small></span></div></div>');
    const start = ui.card('Or start from a designed email', designs.length + '', '<div class="adm-list">' + designs.map(o => '<div><span><b>' + E(o.s.name) + '</b><small>' + E(o.audienceLabel) + ' · ' + o.count + ' can get it</small></span><span class="adm-inline" style="flex:none;flex-wrap:nowrap"><a class="btn sm ghost" href="/admin/emails?t=camp.' + E(o.s.id) + '#preview">Preview</a><a class="btn sm" href="/admin/campaigns/' + E(o.s.id) + '">Use it</a></span></div>').join('') + '</div>');
    return page(res, { title: 'Write a marketing email', active: 'write', err, back: ['/admin/campaigns', 'Email campaigns'],
      sub: 'Write it, send yourself a test, then send it now or schedule it.',
      body: '<div class="adm-cols"><div class="adm-stack">' + form + '</div><div class="adm-stack adm-sticky">' + steps + start + '</div></div>' });
  }

  /* ---------- one campaign ---------- */
  async function editPage(res, id, note, err) {
    const o = (await campaigns.overview()).find(x => x.s.id === id); if (!o) return null;
    const { s, d } = o, ed = campaigns.editable(s), n = sentCount(s), st = o.stats, counts = d ? null : await campaigns.audienceCounts();
    const skipped = Object.entries(o.skipped).map(([r, k]) => k + ' ' + r).join(' · ');
    const sub = badge(o) + ' ' + (d ? E(d.about) : '') + '<br><b>Who:</b> ' + E(o.audienceLabel) + ' · <b>' + o.count + '</b> ' + (n ? 'more ' : '') + 'can get it now' + (skipped ? ' · left out: ' + E(skipped) : '') + (d ? '<br><b>When:</b> ' + E(d.when) : '');

    let results = '';
    if (n || ['sending', 'sent', 'stopped'].includes(s.status)) {
      results = tiles([[n, 'Delivered'], [pct(st.opens, n), st.opens + ' opened'], [pct(st.clicks, n), st.clicks + ' clicked', true], [st.unsubs, 'Unsubscribed'], [failedCount(s), 'Failed']]) +
        (st.links.length ? ui.card('Links clicked', 'people, once each', ui.table(['Link', '>People'], st.links.map(([u, k]) => '<tr><td style="word-break:break-all">' + E(u) + '</td><td class="r num"><b>' + k + '</b></td></tr>')), '') : '') +
        '<p class="adm-help" style="margin:10px 0 16px">Opens are a guide only: some email apps load images for privacy and count as an open, others block them. Clicks are exact.</p>';
    }
    const actions = [];
    if (s.status === 'sending') actions.push('<form method="post" action="/admin/campaigns/' + id + '/cancel"><button class="btn sm danger">Stop sending</button></form>');
    if (s.status === 'scheduled') actions.push('<form method="post" action="/admin/campaigns/' + id + '/cancel"><button class="btn sm">Cancel the schedule</button></form>');
    if (failedCount(s) && ['sent', 'stopped'].includes(s.status)) actions.push('<form method="post" action="/admin/campaigns/' + id + '/retry"><button class="btn sm primary">Retry ' + failedCount(s) + ' failed</button></form>');
    actions.push('<form method="post" action="/admin/campaigns/' + id + '/duplicate"><button class="btn sm">Make a copy</button></form>');
    if (s.kind === 'custom' && ed) actions.push('<form method="post" action="/admin/campaigns/' + id + '/delete"><button class="btn sm danger">Delete draft</button></form>');

    let form = '', sendBox = '';
    if (ed) {
      const fields = d ? d.needs.map(([k, label, , type]) => field(k, s.settings[k], label, { type })).join('')
        : audSelect(s.audience, counts) + field('heading', s.heading, 'Heading (optional)', { ph: 'Fill January without the Airbnb discount' }) +
          field('body', s.body, 'Email', { area: true, tall: true, help: 'Blank line for a new paragraph. Lines starting with <code>-</code> make a list. <code>**bold**</code>, <code>[words](https://link)</code>. Personal fields: <code>{{first_name}}</code> <code>{{name}}</code> <code>{{email}}</code> <code>{{property_name}}</code>. Links: <code>{{demo_url}}</code> <code>{{signup_url}}</code> <code>{{book_call_url}}</code>. The sign-off and unsubscribe link are added for you.' }) +
          '<div class="adm-two">' + field('button_label', s.button_label, 'Button text (optional)', { ph: 'Try the demo' }) + field('button_url', s.button_url, 'Button link', { ph: 'https://booking-booster.co.uk/demo' }) + '</div>';
      form = ui.card('Email', s.tests ? s.tests + ' test' + (s.tests === 1 ? '' : 's') + ' sent' : 'Draft', '<form class="adm-form" method="post" action="/admin/campaigns/' + id + '/save">' + field('name', s.name, 'Name (only the team sees this)') + field('subject', s.subject, 'Subject', { help: 'Personal fields work here too, like <code>{{first_name}}</code>.' }) +
        field('preview', s.preview, 'Preview line (shown after the subject in the inbox)') + fields +
        '<div class="row"><button class="btn">Save draft</button><button formaction="/admin/campaigns/' + id + '/test" class="btn primary">' + ui.icon('mail') + 'Save and send me a test</button></div>' + (s.last_test_to ? '<small class="adm-help">Last test went to ' + E(s.last_test_to) + '.</small>' : '') + '</form>');
      const why = o.blocked.length ? E(o.blocked.join(' ')) : !s.tests ? 'Send yourself a test first.' : !o.count ? 'Nobody in this audience can get it right now.' : '';
      sendBox = ui.card('Send', why ? 'Not ready' : o.count + ' people', why ? '<p class="adm-help" style="margin:0">' + why + '</p>' :
        '<form class="adm-form" method="post" action="/admin/campaigns/' + id + '/send"><p class="adm-help" style="margin:0">This goes to <b>' + o.count + '</b> people and cannot be undone. Type the number to confirm, then send now or pick a time.</p>' + field('confirm', '', 'Type ' + o.count + ' to confirm', { req: true }) +
        '<div class="adm-two">' + field('day', '', 'Day (UK)', { type: 'date' }) + field('time', '09:30', 'Time (UK)', { type: 'time' }) + '</div>' +
        '<div class="row"><button class="btn primary">' + ui.icon('mail') + 'Send now to ' + o.count + ' people</button><button formaction="/admin/campaigns/' + id + '/schedule" class="btn">Schedule for that time</button></div></form>');
    } else if (s.status === 'scheduled') {
      sendBox = ui.card('Scheduled for ' + day(s.scheduled_at), 'about ' + (s.planned || o.count) + ' people', '<p class="adm-help" style="margin:0">Anyone who unsubscribes before then is left out. Cancel the schedule to make changes.</p>');
    }
    const preview = '<div class="adm-sticky">' + ui.card('Preview', '<a href="/admin/campaigns/' + id + '/preview" target="_blank">Open full size</a>', '<p class="adm-help" style="margin:0 0 10px">' + (o.count ? 'With the first person’s details.' : 'With sample details.') + '</p><iframe class="adm-frame" title="Email preview" src="/admin/campaigns/' + id + '/preview" sandbox></iframe>') + '</div>';
    return page(res, { title: s.name, note, err, sub, back: ['/admin/campaigns', 'Email campaigns'], actions: '<div class="adm-inline">' + actions.join('') + '</div>',
      body: results + '<div class="adm-cols"><div class="adm-stack">' + form + sendBox + '</div>' + preview + '</div>' });
  }

  return async function (req, res, p, m, u) {
    if (p === '/admin/campaigns') return await listPage(res, u.searchParams.get('note'), u.searchParams.get('err'));
    if (p === '/admin/campaigns/write') return await writePage(res);
    if (p === '/admin/campaigns/new' && m === 'POST') {
      const f = await formBody(req);
      if (!f.then) { const s = await campaigns.create(f); return redirect(res, '/admin/campaigns/' + s.id + '?note=' + encodeURIComponent('Draft created. Write it, send yourself a test, then send or schedule it.')); }
      if (!String(f.subject || '').trim()) return await writePage(res, f, 'Add a subject.');
      if (!f.name || !String(f.name).trim()) f.name = String(f.subject).replace(/\{\{[^}]*\}\}/g, '').replace(/[\s,]+$/, '').trim().slice(0, 80);
      const s = await campaigns.create(f); await campaigns.update(s.id, f);
      let note = 'Draft saved. Check the preview, send yourself a test, then send or schedule it.', err = '';
      if (f.then === 'test') { const who = await me(req); const r = await campaigns.sendTest(s.id, who.email); r.ok ? note = 'Draft saved and a test sent to ' + who.email + '. Nobody else got it. When it looks right, send or schedule it below.' : err = r.error; }
      return redirect(res, '/admin/campaigns/' + s.id + '?' + (err ? 'err=' + encodeURIComponent(err) : 'note=' + encodeURIComponent(note)));
    }
    const mm = p.match(/^\/admin\/campaigns\/([a-z0-9-]+)(?:\/(preview|save|test|send|schedule|cancel|retry|duplicate|delete))?$/);
    const s = mm && await campaigns.load(mm[1]); if (!s) return send(res, 404, ui.shell({ email: await email(), active: 'campaigns', title: 'Not found', sub: 'That campaign does not exist. <a href="/admin/campaigns">Back to email campaigns</a>', body: '' }), 'text/html; charset=utf-8');
    const id = s.id, act = mm[2];
    if (act === 'preview') return send(res, 200, (await campaigns.preview(id)).html, 'text/html; charset=utf-8', { 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; img-src * data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com" });
    if (m !== 'POST' || !act) return await editPage(res, id, u.searchParams.get('note'), u.searchParams.get('err'));
    const f = await formBody(req); let note = '', err = '';
    if (act === 'save') { await campaigns.update(id, f); note = 'Saved. Still a draft: nothing has been sent.'; }
    if (act === 'test') { const who = await me(req); await campaigns.update(id, f); const r = await campaigns.sendTest(id, who.email); r.ok ? note = 'Test sent to ' + who.email + '. Nobody else got it.' : err = r.error; }
    if (act === 'send') { const r = await campaigns.send(id, f.confirm); r.ok ? note = 'Sent to ' + r.sent + (r.failed ? ', ' + r.failed + ' failed' : '') + (r.left ? '. The other ' + r.left + ' are going out in the background over the next few minutes' : '') + '.' : err = r.error; }
    if (act === 'schedule') {
      const at = f.day && /^\d{4}-\d{2}-\d{2}$/.test(f.day) && /^\d{2}:\d{2}$/.test(f.time || '') ? leads.ukAt(f.day, f.time) : 0;
      const r = at ? await campaigns.schedule(id, at, f.confirm) : { error: 'Pick a day and time to schedule it.' }; r.ok ? note = 'Scheduled for ' + day(r.at) + ' (UK), to about ' + r.count + ' people.' : err = r.error;
    }
    if (act === 'cancel') { const r = await campaigns.cancel(id); r.ok ? note = r.note : err = r.error; }
    if (act === 'retry') { const r = await campaigns.retry(id); r.ok ? note = 'Retried: ' + r.sent + ' sent' + (r.failed ? ', ' + r.failed + ' failed again' : '') + '.' : err = r.error; }
    if (act === 'duplicate') { const c = await campaigns.duplicate(id); return redirect(res, '/admin/campaigns/' + c.id + '?note=' + encodeURIComponent('Copied as a new draft.')); }
    if (act === 'delete') { const r = await campaigns.remove(id); if (r.ok) return redirect(res, '/admin/campaigns?note=' + encodeURIComponent('Draft deleted.')); err = r.error; }
    return await editPage(res, id, note, err);
  };
};
