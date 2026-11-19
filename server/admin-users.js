// Team admin: every user and host account (/admin/hosts) and one account in full (/admin/hosts/<id>):
// who they are, their sites, plan and billing, bookings, guests, emails sent to them, AI credit, and what the team can do.
// Team only: index.js checks ADMIN_EMAILS before calling this. Uses the team admin frame (server/admin-shell.js).
'use strict';

module.exports = function ({ db, ws, cfg, credits, urls, ui, E, send, email, admins }) {
  const A = ui;
  const d = t => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  const dt = t => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
  const ago = t => { if (!t) return 'never'; const m = (Date.now() - t) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  const gbp = n => '£' + Math.round(Number(n) || 0).toLocaleString('en-GB');
  const BILL = { trial: ['warn', 'Not paid yet'], active: ['good', 'Paying'], past_due: ['bad', 'Payment failed'], cancelled: ['muted', 'Cancelled'] };
  const bill = st => { const b = BILL[st] || ['warn', 'Not paid yet']; return A.pill(b[0], b[1]); };
  const page = async (res, o, status) => send(res, status || 200, A.shell(Object.assign({ email: await email(), active: 'hosts' }, o)), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });

  const Q = {
    accts: db.prepare("SELECT w.id, w.slug, w.plan, w.billing_status, w.stripe_customer, w.stripe_account, w.created_at, w.last_seen, u.id AS user_id, u.email, u.name, u.verified, c.allowance_left, c.topup_left, " +
      "(SELECT coalesce(sum(l.amount), 0) FROM ai_ledger l WHERE l.workspace_id = w.id AND l.kind = 'use' AND l.created_at > ?) AS ai_used " +
      "FROM workspaces w LEFT JOIN users u ON u.workspace_id = w.id LEFT JOIN ai_credit c ON c.workspace_id = w.id WHERE w.kind = 'live' ORDER BY w.created_at DESC LIMIT 500"),
    users: db.prepare('SELECT id, email, name, verified, created_at FROM users WHERE workspace_id = ? ORDER BY created_at'),
    lastLogin: db.prepare('SELECT max(s.created_at) AS at FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.workspace_id = ?'),
    outbox: db.prepare("SELECT channel, recipient, subject, status, error, meta, created_at FROM outbox WHERE workspace_id = ? ORDER BY id DESC LIMIT 25"),
    ledger: db.prepare('SELECT kind, amount, feature, model, created_at FROM ai_ledger WHERE workspace_id = ? ORDER BY id DESC LIMIT 15'),
  };
  const creditLeft = a => (a.allowance_left == null ? null : (Math.max(0, Number(a.allowance_left)) + Number(a.topup_left || 0)) / credits.UNIT);

  // what each account has built and taken, from its saved state
  async function summary(id) {
    const w = await ws.open(id); if (!w) return null;
    const s = w.state || {}, bs = (s.bookings || []).filter(b => b.status !== 'cancelled'), props = s.properties || [];
    const direct = bs.filter(b => (b.channel || 'direct') === 'direct');
    return { w, s, business: (s.account || {}).business || w.slug, owner: (s.account || {}).owner || '', props, live: props.filter(p => p.published !== false).length,
      bookings: bs.length, direct: direct.length, revenue: direct.reduce((n, b) => n + (+b.total || 0), 0), guests: (s.guests || []).length,
      upcoming: bs.filter(b => b.checkIn >= (s.today || '')).length, onboarded: !!(s.account || {}).onboarded,
      stripe: (s.integrations || []).some(i => i.id === 'stripe' && i.connected), domains: (w.domains || []).filter(x => x.verified && !ws.isOurs(x.host)).map(x => x.host) };
  }

  async function listPage(res, q, note, err) {
    const rows = await Q.accts.all(Date.now() - 30 * 864e5);
    const seen = new Set(), accts = rows.filter(r => !seen.has(r.id) && seen.add(r.id));
    const sums = new Map(await Promise.all(accts.map(async a => [a.id, await summary(a.id).catch(() => null)])));
    const term = String(q.get('q') || '').trim().toLowerCase(), fb = BILL[q.get('billing')] ? q.get('billing') : '';
    const shown = accts.filter(a => { const s = sums.get(a.id) || {}; return (!fb || (a.billing_status || 'trial') === fb) && (!term || [a.email, a.name, a.slug, s.business, s.owner].some(x => String(x || '').toLowerCase().includes(term))); });
    const paying = accts.filter(a => a.billing_status === 'active').length, fails = accts.filter(a => a.billing_status === 'past_due').length;
    const mrr = paying * 200, recent = accts.filter(a => a.created_at > Date.now() - 30 * 864e5).length, active7 = accts.filter(a => a.last_seen > Date.now() - 7 * 864e5).length;
    const row = a => {
      const s = sums.get(a.id) || {}, left = creditLeft(a);
      return '<tr><td><a href="/admin/hosts/' + E(a.id) + '" style="color:inherit;text-decoration:none"><b>' + E(s.business || a.slug) + '</b></a><small>' + E(a.name || s.owner || '') + ' · ' + E(a.email || 'no login') + (a.email && !a.verified ? ' · email not confirmed' : '') + '</small></td>' +
        '<td>' + bill(a.billing_status) + '<small>' + E(a.plan || 'No plan') + '</small></td>' +
        '<td class="num"><b>' + (s.live || 0) + '</b> of ' + ((s.props || []).length) + ' live' + (s.domains && s.domains.length ? '<small>' + E(s.domains[0]) + '</small>' : '') + '</td>' +
        '<td class="num"><b>' + (s.bookings || 0) + '</b><small>' + (s.direct || 0) + ' direct · ' + gbp(s.revenue) + '</small></td>' +
        '<td class="num">' + (left == null ? '<small>Not used yet</small>' : credits.money(left)) + '<small>' + credits.money(Number(a.ai_used || 0) / credits.UNIT) + ' used, 30 days</small></td>' +
        '<td class="num">' + d(a.created_at) + '<small>Seen ' + ago(a.last_seen) + '</small></td>' +
        '<td><a class="btn sm" href="/admin/hosts/' + E(a.id) + '">Open</a></td></tr>';
    };
    const chips = [['', 'Everyone', accts.length]].concat(Object.entries(BILL).map(([k, [, l]]) => [k, l, accts.filter(a => (a.billing_status || 'trial') === k).length]))
      .map(([k, l, n]) => '<a class="chip' + (fb === k ? ' on' : '') + '" href="/admin/hosts?' + new URLSearchParams(Object.assign(k ? { billing: k } : {}, term ? { q: term } : {})) + '">' + E(l) + ' · ' + n + '</a>').join('');
    const search = '<form method="get" action="/admin/hosts" class="adm-inline" style="padding:14px 20px 0;width:100%">' + (fb ? '<input type="hidden" name="billing" value="' + E(fb) + '">' : '') +
      '<label class="field" style="flex:1;min-width:200px;margin:0"><span class="sr-only" style="position:absolute;left:-9999px">Search</span><input name="q" value="' + E(term) + '" placeholder="Search by business, name or email"></label><button class="btn sm">Search</button></form>';
    const team = await admins();
    return page(res, { title: 'Users', note, err,
      sub: accts.length + ' host account' + (accts.length === 1 ? '' : 's') + ' and everyone who can sign in to them. Open one to see their sites, bookings, billing, emails and AI use.',
      actions: '<a class="btn sm" href="/admin/hosts/export.csv">' + A.icon('down') + 'Download CSV</a>',
      body: '<div class="adm-kpis">' + A.kpi('Host accounts', accts.length, '', recent + ' joined in the last 30 days') + A.kpi('Paying', paying, '', 'about ' + gbp(mrr) + ' a month', true) +
        A.kpi('Payment failed', fails, '', fails ? '<a href="/admin/hosts?billing=past_due">See who</a>' : 'none') + A.kpi('Active this week', active7, '', 'opened their console') + '</div>' +
        '<section class="a-card a-flush"><div class="a-card-h" style="padding:18px 20px 0;flex-wrap:wrap;gap:8px"><h3>Host accounts</h3><div class="adm-chips">' + chips + '</div></div>' + search +
        A.table(['Account', 'Billing', 'Sites', '>Bookings', '>AI credit', 'Joined', ''], shown.map(row), term || fb ? 'Nobody matches.' : 'No host accounts yet.') + '</section>' +
        A.card('Team', team.length + ' with admin access', '<p class="adm-help" style="margin:0 0 8px">These people see this team admin. Add more in the server’s ADMIN_EMAILS, or the kv key <code>config:admins</code>.</p><div class="adm-list">' +
          team.map(e => '<div><span><b>' + E(e) + '</b></span>' + A.pill('info', 'Team admin') + '</div>').join('') + '</div>', '').replace('<section class="a-card ', '<section style="margin-top:16px" class="a-card ') });
  }

  async function csv(res) {
    const accts = await Q.accts.all(Date.now() - 30 * 864e5), out = [['business', 'owner', 'email', 'plan', 'billing', 'sites_live', 'bookings', 'direct_revenue', 'joined', 'last_seen']];
    for (const a of accts) { const s = (await summary(a.id).catch(() => null)) || {}; out.push([s.business || a.slug, a.name || s.owner || '', a.email || '', a.plan || '', a.billing_status || 'trial', s.live || 0, s.bookings || 0, s.revenue || 0, new Date(a.created_at).toISOString().slice(0, 10), a.last_seen ? new Date(a.last_seen).toISOString().slice(0, 10) : '']); }
    const c = v => { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return send(res, 200, out.map(r => r.map(c).join(',')).join('\n'), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="bookingbooster-hosts.csv"', 'cache-control': 'no-store' });
  }

  async function detailPage(res, id, note, err) {
    const a = (await Q.accts.all(Date.now() - 30 * 864e5)).find(x => x.id === id); const s = a && await summary(id);
    if (!s) return page(res, { title: 'Not found', sub: 'That account does not exist. <a href="/admin/hosts">Back to users</a>', body: '' }, 404);
    const w = s.w, st = s.s, left = creditLeft(a), people = await Q.users.all(id), login = await Q.lastLogin.get(id);
    const acct = A.card('Account', bill(a.billing_status), '<div class="adm-list">' +
      '<div><span><small>Business</small><b>' + E(s.business) + '</b></span></div>' +
      '<div><span><small>Owner</small><b>' + E(a.name || s.owner || '–') + '</b></span></div>' +
      '<div><span><small>Sign-in email</small><b>' + E(a.email || 'No login') + '</b></span>' + (a.email ? A.pill(a.verified ? 'good' : 'warn', a.verified ? 'Confirmed' : 'Not confirmed') : '') + '</div>' +
      '<div><span><small>Plan</small><b>' + E(a.plan || 'No plan') + '</b></span>' + bill(a.billing_status) + '</div>' +
      '<div><span><small>Joined</small><b>' + d(a.created_at) + '</b></span><span><small>Last seen</small><b>' + ago(a.last_seen) + '</b></span></div>' +
      '<div><span><small>Last sign-in</small><b>' + dt(login && login.at) + '</b></span><span><small>Setup</small><b>' + (s.onboarded ? 'Finished' : 'Not finished') + '</b></span></div>' +
      '<div><span><small>Stripe customer (their plan)</small><b class="mono">' + (a.stripe_customer ? '<a href="https://dashboard.stripe.com/customers/' + E(a.stripe_customer) + '" target="_blank" rel="noopener">' + E(a.stripe_customer) + '</a>' : '–') + '</b></span></div>' +
      '<div><span><small>Guest payouts</small><b>' + (s.stripe ? 'Stripe connected' : 'Not connected') + '</b></span></div>' +
      '<div><span><small>Account id</small><b class="mono">' + E(id) + '</b></span></div></div>');
    const sites = A.card('Sites', s.live + ' of ' + s.props.length + ' live', s.props.length ? '<div class="adm-list">' + s.props.map(p => { const u = urls.site(w, p); return '<div><span><b>' + E(p.name) + '</b><small>' + E(p.area || '') + (p.nightly ? ' · from ' + gbp(p.nightly) + ' a night' : '') + '</small><small><a href="' + E(u) + '" target="_blank" rel="noopener">' + E(u.replace(/^https?:\/\//, '')) + '</a></small></span>' + A.pill(p.published === false ? 'muted' : 'good', p.published === false ? 'Not live' : 'Live') + '</div>'; }).join('') + '</div>' : '<p class="adm-help" style="margin:0">No homes added yet.</p>');
    const bks = (st.bookings || []).slice().sort((x, y) => String(y.createdAt || y.checkIn).localeCompare(String(x.createdAt || x.checkIn))).slice(0, 12);
    const prop = pid => (s.props.find(p => p.id === pid) || {}).name || pid, guest = gid => ((st.guests || []).find(g => g.id === gid) || {}).name || '';
    const bookings = '<section class="a-card a-flush"><div class="a-card-h" style="padding:18px 20px 0"><h3>Latest bookings</h3><div class="a-card-m">' + s.bookings + ' in total</div></div>' +
      A.table(['Booked', 'Guest', 'Home', 'Stay', 'Channel', '>Total', 'Status'], bks.map(b => '<tr><td class="num">' + E(b.createdAt || '') + '</td><td>' + E(guest(b.guestId)) + '</td><td>' + E(prop(b.propertyId)) + '</td><td class="num">' + E(b.checkIn) + ' to ' + E(b.checkOut) + '</td><td>' + A.pill(b.channel === 'direct' || !b.channel ? 'good' : 'muted', b.channel || 'direct') + '</td><td class="r num">' + gbp(b.total) + '</td><td>' + E(b.status || '') + (b.paid === false ? ' · unpaid' : '') + '</td></tr>'), 'No bookings yet.') + '</section>';
    const mails = await Q.outbox.all(id);
    const outbox = '<section class="a-card a-flush"><div class="a-card-h" style="padding:18px 20px 0"><h3>Emails and texts sent</h3><div class="a-card-m">latest ' + mails.length + '</div></div>' +
      A.table(['When', 'To', 'Subject', 'Status'], mails.map(m => '<tr><td class="num">' + dt(m.created_at) + '</td><td>' + E(m.recipient) + '<small>' + E(m.channel) + '</small></td><td class="wrap">' + E(m.subject || '') + '</td><td>' + A.pill(m.status === 'sent' ? 'good' : m.status === 'failed' ? 'bad' : 'muted', m.status) + (m.error ? '<small>' + E(m.error) + '</small>' : '') + '</td></tr>'), 'Nothing sent yet.') + '</section>';
    const led = await Q.ledger.all(id);
    const ai = A.card('AI credit', left == null ? 'not used yet' : credits.money(left) + ' left', '<div class="adm-list">' + (led.map(l => '<div><span><b>' + E(l.kind === 'use' ? (l.feature || 'AI use') : l.kind) + '</b><small>' + dt(l.created_at) + (l.model ? ' · ' + E(l.model) : '') + '</small></span><b class="num">' + (l.kind === 'use' ? '−' : '+') + credits.money(Math.abs(Number(l.amount)) / credits.UNIT) + '</b></div>').join('') || '<div><span><small>No AI use yet.</small></span></div>') + '</div>' +
      '<form class="adm-form" method="post" action="/admin/credits/' + E(id) + '" style="margin-top:12px"><input type="hidden" name="back" value="detail"><div class="row">' + A.field('pounds', '', 'Add goodwill credit, £', { type: 'number', ph: '20' }) + '<button class="btn sm primary" style="align-self:end">Add AI credit</button></div></form>');
    const logins = A.card('People who can sign in', people.length + '', '<div class="adm-list">' + (people.map(u => '<div><span><b>' + E(u.email) + '</b><small>' + E(u.name || '') + ' · since ' + d(u.created_at) + '</small></span>' + A.pill(u.verified ? 'good' : 'warn', u.verified ? 'Confirmed' : 'Not confirmed') + '</div>').join('') || '<div><span><small>Nobody.</small></span></div>') + '</div>');
    const actions = (a.email ? '<a class="btn sm" href="mailto:' + E(a.email) + '">' + A.icon('mail') + 'Email them</a><form method="post" action="/admin/hosts/' + E(id) + '/reset" style="display:inline"><button class="btn sm">Send a password reset</button></form>' : '') +
      (s.props[0] ? '<a class="btn sm" href="' + E(urls.site(w, s.props[0])) + '" target="_blank" rel="noopener">' + A.icon('out') + 'Their site</a>' : '');
    return page(res, { title: s.business, note, err, back: ['/admin/hosts', 'Users'], sub: bill(a.billing_status) + ' ' + E(a.plan || '') + ' · ' + E(a.name || s.owner || '') + ' · ' + E(a.email || 'no login'), actions: '<div class="adm-inline">' + actions + '</div>',
      body: '<div class="adm-kpis">' + A.kpi('Bookings', s.bookings, '', s.upcoming + ' still to come') + A.kpi('Direct bookings', s.direct, '', gbp(s.revenue) + ' taken direct', true) + A.kpi('Guests', s.guests, '', 'on their list') + A.kpi('Homes live', s.live + ' of ' + s.props.length, '', s.domains.length ? E(s.domains.join(', ')) : 'on our address') + '</div>' +
        '<div class="a-grid adm-top"><div class="a-s8 adm-stack">' + bookings + outbox + '</div><div class="a-s4 adm-stack">' + acct + sites + ai + logins + '</div></div>' });
  }

  return { listPage, detailPage, csv, summary };
};
