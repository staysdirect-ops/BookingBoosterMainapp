// Partner (affiliate) programme. Anyone can join at /partners and gets a link (/r/<code>) and a code. When a host
// signs up through either one, that host is the partner's for life: the partner earns AFFILIATE_RATE % (25 by default)
// of every payment the host makes to us for their plan (monthly or yearly, add-on included), for as long as they pay.
//
//  - Attribution: /r/<code>, or ?ref=<code> on our marketing pages, keeps the code in the bb_ref cookie for
//    AFFILIATE_COOKIE_DAYS (90). The last link clicked wins. A code typed at sign-up wins over the cookie.
//    Partners cannot refer their own email address.
//  - Commissions are recorded from Stripe's invoice.paid (card) and from bank transfers the team records in
//    /admin/affiliates. Each payment is recorded once, whatever Stripe retries.
//  - Refunds and lost chargebacks take back the same share of the commission. If it was already paid out,
//    the balance goes negative and comes off the next payout.
//  - A commission is on hold for AFFILIATE_HOLD_DAYS (30) so refunds can land, then it can be paid out. The team pays
//    by bank transfer or PayPal once a partner has AFFILIATE_MIN_PAYOUT (£50) cleared, and marks it paid in /admin/affiliates.
'use strict';
const crypto = require('crypto');

module.exports = function ({ db, cfg, auth, msg, stripe, log, h }) {
  const A = cfg.affiliate, DAY = 864e5, now = () => Date.now();
  const E = h.esc;
  const q = {
    byCode: db.prepare('SELECT * FROM affiliates WHERE code = ?'),
    byEmail: db.prepare('SELECT * FROM affiliates WHERE lower(email) = lower(?)'),
    byId: db.prepare('SELECT * FROM affiliates WHERE id = ?'),
    all: db.prepare('SELECT * FROM affiliates ORDER BY created_at DESC'),
    add: db.prepare('INSERT INTO affiliates (id, code, email, name, pass, payout, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    setDetails: db.prepare('UPDATE affiliates SET name = ?, payout = ? WHERE id = ?'),
    setStatus: db.prepare('UPDATE affiliates SET status = ? WHERE id = ?'),
    setPass: db.prepare('UPDATE affiliates SET pass = ? WHERE id = ?'),
    addSess: db.prepare('INSERT INTO aff_sessions (token, affiliate_id, expires_at) VALUES (?, ?, ?)'),
    sess: db.prepare('SELECT a.* FROM aff_sessions s JOIN affiliates a ON a.id = s.affiliate_id WHERE s.token = ? AND s.expires_at > ?'),
    delSess: db.prepare('DELETE FROM aff_sessions WHERE token = ?'),
    delSessFor: db.prepare('DELETE FROM aff_sessions WHERE affiliate_id = ?'),
    click: db.prepare('INSERT INTO aff_clicks (affiliate_id, day, n) VALUES (?, ?, 1) ON CONFLICT (affiliate_id, day) DO UPDATE SET n = aff_clicks.n + 1'),
    clicks: db.prepare('SELECT day, n FROM aff_clicks WHERE affiliate_id = ?'),
    referral: db.prepare('SELECT * FROM referrals WHERE workspace_id = ?'),
    addRef: db.prepare('INSERT OR IGNORE INTO referrals (workspace_id, affiliate_id, how, created_at) VALUES (?, ?, ?, ?)'),
    refsFor: db.prepare('SELECT r.*, w.billing_status, w.slug FROM referrals r LEFT JOIN workspaces w ON w.id = r.workspace_id WHERE r.affiliate_id = ? ORDER BY r.created_at'),
    allRefs: db.prepare('SELECT r.*, w.billing_status, w.slug, a.code FROM referrals r LEFT JOIN workspaces w ON w.id = r.workspace_id JOIN affiliates a ON a.id = r.affiliate_id ORDER BY r.created_at DESC'),
    addComm: db.prepare('INSERT OR IGNORE INTO commissions (id, affiliate_id, workspace_id, kind, source, gross, amount, reversed, refs, note, clears_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)'),
    comm: db.prepare('SELECT * FROM commissions WHERE id = ?'),
    commByRef: db.prepare("SELECT * FROM commissions WHERE source = 'stripe' AND refs LIKE ?"),
    commsFor: db.prepare('SELECT * FROM commissions WHERE affiliate_id = ? ORDER BY created_at DESC'),
    recentComms: db.prepare('SELECT c.*, a.code, w.slug FROM commissions c JOIN affiliates a ON a.id = c.affiliate_id LEFT JOIN workspaces w ON w.id = c.workspace_id ORDER BY c.created_at DESC LIMIT 200'),
    setReversed: db.prepare('UPDATE commissions SET reversed = ?, note = ?, updated_at = ? WHERE id = ?'),
    addPayout: db.prepare('INSERT INTO aff_payouts (affiliate_id, amount, reference, created_at) VALUES (?, ?, ?, ?)'),
    payoutsFor: db.prepare('SELECT * FROM aff_payouts WHERE affiliate_id = ? ORDER BY created_at DESC'),
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'), kvSet: db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)'), kvDel: db.prepare('DELETE FROM kv WHERE k = ?'),
    wsByEmail: db.prepare('SELECT u.workspace_id AS id FROM users u WHERE lower(u.email) = lower(?)'),
    wsBySlug: db.prepare("SELECT id FROM workspaces WHERE slug = ? AND kind = 'live'"),
  };
  const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
  const money = p => (p < 0 ? '-' : '') + '£' + (Math.abs(p) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = t => new Date(t).toISOString().slice(0, 10);
  const date = t => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
  const cleanCode = c => String(c || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const KIND = { setup: 'Package', plan: 'Plan payment', other: 'Other payment' };
  const STATUS = { trial: 'Signed up, not paid yet', active: 'Paying', past_due: 'Payment failed', cancelled: 'Cancelled' };
  const pct = A.rate + '%';

  /* ---------- partners ---------- */
  async function newCode(name) {
    const base = String(name).split(/\s+/)[0].toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '').slice(0, 10) || 'partner';
    for (let i = 0; i < 30; i++) { const c = base + (100 + crypto.randomInt(900)); if (!await q.byCode.get(c)) return c; }
    return 'p' + crypto.randomBytes(5).toString('hex');
  }
  const active = async code => { const c = cleanCode(code); if (!c) return null; const a = await q.byCode.get(c); return a && a.status === 'active' ? a : null; };
  async function create({ name, email, password, payout }) {
    const id = 'af_' + crypto.randomBytes(9).toString('base64url'), code = await newCode(name);
    await q.add.run(id, code, email.trim().toLowerCase(), name, auth.hashPass(password), String(payout || '').slice(0, 500), 'active', now());
    return q.byId.get(id);
  }
  async function startSession(id) { const tok = crypto.randomBytes(32).toString('base64url'); await q.addSess.run(sha(tok), id, now() + 30 * DAY); return tok; }
  const me = async req => { const t = h.cookies(req).bb_aff; return t ? (await q.sess.get(sha(t), now())) || null : null; };
  const link = a => cfg.baseUrl + '/r/' + a.code;

  /* ---------- attribution ---------- */
  // /r/<code> and ?ref=<code> on our marketing pages: remember the partner, count the click (once a day per visitor), move on.
  const REF_PAGES = ['/', '/pricing', '/start', '/help', '/partners'];
  async function capture(req, res, u) {
    let code, to; const m = u.pathname.match(/^\/r\/([A-Za-z0-9-]{1,30})\/?$/);
    if (m) { code = m[1]; const t = String(u.searchParams.get('to') || ''); to = REF_PAGES.includes(t) ? t : '/'; }
    else if (req.method === 'GET' && u.searchParams.has('ref') && REF_PAGES.includes(u.pathname)) { code = u.searchParams.get('ref'); const s = new URLSearchParams(u.search); s.delete('ref'); to = u.pathname + (String(s) ? '?' + s : ''); }
    else return false;
    const a = await active(code), headers = {};
    if (a) {
      headers['set-cookie'] = h.cookie('bb_ref', a.code, A.cookieDays * 86400);
      if (auth.limit('affclick:' + h.ip(req) + ':' + a.code, 1, DAY)) await q.click.run(a.id, day(now()));
    }
    h.redirect(res, to, headers); return true;
  }
  const cookieCode = req => cleanCode(h.cookies(req).bb_ref);
  // At sign-up, before the account is made: a typed code wins over the cookie. A typed code we do not know is an error
  // (so a typo does not lose the partner their commission), unless it is just the cookie's code shown back.
  async function forSignup(req, typed, email) {
    const t = cleanCode(typed), c = cookieCode(req);
    let a = null, how = '';
    if (t) { a = await active(t); how = 'code'; if (!a && t !== c) throw Object.assign(new Error('We could not find that referral code. Check it, or leave it empty.'), { status: 400 }); }
    if (!a && c) { a = await active(c); how = 'link'; }
    if (!a || a.email.toLowerCase() === String(email || '').toLowerCase()) return null;
    return { a, how };
  }
  async function attach(wid, ref) {
    if (!ref) return;
    const r = await q.addRef.run(wid, ref.a.id, ref.how, now()); if (!r.changes) return;
    msg.sendEmail({ to: ref.a.email, subject: 'Someone you referred just joined Bookingbooster', text: 'Hi ' + ref.a.name.split(' ')[0] + ',\n\nA host you referred has just created a Bookingbooster account. You earn ' + pct + ' of everything they pay us, starting with their first payment, for as long as they stay.\n\nSee your referrals: ' + cfg.baseUrl + '/partners/dashboard\n\n' + cfg.leads.signoff, meta: { affiliate: ref.a.id } });
  }

  /* ---------- commissions ---------- */
  async function record({ workspaceId, id, kind, source, gross, refs, note }) {
    if (!workspaceId || !(gross > 0)) return null;
    const r = await q.referral.get(workspaceId); if (!r) return null;
    const a = await q.byId.get(r.affiliate_id); if (!a || a.status !== 'active') return null;
    const amount = Math.round(gross * A.rate / 100), t = now();
    const res = await q.addComm.run(id, a.id, workspaceId, KIND[kind] ? kind : 'other', source, Math.round(gross), amount, ' ' + (refs || []).filter(Boolean).join(' ') + ' ', String(note || '').slice(0, 200), t + A.holdDays * DAY, t, t);
    if (res.changes) log('partner', a.code, kind, money(amount));
    return { code: a.code, amount, created: !!res.changes };
  }
  async function reverse(c, amount, why) {
    const rev = Math.max(c.reversed, Math.min(c.amount, Math.round(amount)));
    if (rev !== c.reversed) await q.setReversed.run(rev, String(why || c.note || '').slice(0, 200), now(), c.id);
    return rev;
  }
  const str = x => typeof x === 'string' && x ? x : null;
  // Stripe events (already verified by the webhook). findWorkspace(customer) looks a host up by Stripe customer.
  async function stripeEvent(ev, findWorkspace) {
    const o = (ev.data && ev.data.object) || {};
    if (ev.type === 'invoice.paid') {
      const sd = o.subscription_details || (o.parent && o.parent.subscription_details) || {};
      const wid = (sd.metadata && sd.metadata.workspace) || (o.metadata && o.metadata.workspace) || (o.customer && await findWorkspace(o.customer));
      const pays = ((o.payments && o.payments.data) || []).map(p => p.payment || {});
      const refs = [o.id, str(o.charge), str(o.payment_intent)].concat(pays.map(p => str(p.payment_intent)), pays.map(p => str(p.charge)));
      const kind = o.subscription || /^subscription/.test(o.billing_reason || '') ? 'plan' : 'other';
      return record({ workspaceId: wid, id: 'stripe:' + o.id, kind, source: 'stripe', gross: o.amount_paid, refs });
    }
    const lost = ev.type === 'charge.dispute.closed' && o.status === 'lost';
    if (ev.type !== 'charge.refunded' && !lost) return null;
    const keys = (lost ? [o.charge, o.payment_intent] : [o.invoice, o.id, o.payment_intent]).map(str).filter(Boolean);
    let c = null;
    for (const k of keys) { c = await q.commByRef.get('% ' + k + ' %'); if (c) break; }
    if (!c && str(o.payment_intent) && stripe && stripe.enabled) { // newer Stripe API versions leave the invoice off the charge
      try { const ip = await stripe.api('GET', '/invoice_payments', { payment: { type: 'payment_intent', payment_intent: o.payment_intent }, limit: 1 }); const inv = ip.data && ip.data[0] && ip.data[0].invoice; if (inv) c = await q.comm.get('stripe:' + (typeof inv === 'string' ? inv : inv.id)); } catch (_) {}
    }
    if (!c) return null;
    const share = lost ? Math.min(1, (o.amount || c.gross) / c.gross) : Math.min(1, (o.amount_refunded || 0) / (o.amount || c.gross));
    return { id: c.id, reversed: await reverse(c, c.amount * share, lost ? 'Chargeback lost' : share >= 1 ? 'Refunded' : 'Part refunded') };
  }

  /* ---------- balances ---------- */
  async function summary(a, t = now()) {
    const comms = await q.commsFor.all(a.id), payouts = await q.payoutsFor.all(a.id), refs = await q.refsFor.all(a.id), clicks = await q.clicks.all(a.id);
    let hold = 0, cleared = 0, earned = 0;
    for (const c of comms) { const net = c.amount - c.reversed; earned += net; if (c.clears_at > t) hold += net; else cleared += net; }
    const paid = payouts.reduce((s, p) => s + Number(p.amount), 0), since = day(t - 30 * DAY);
    return { comms, payouts, refs, hold, earned, paid, due: cleared - paid, clicks: clicks.reduce((s, c) => s + Number(c.n), 0), clicks30: clicks.filter(c => c.day >= since).reduce((s, c) => s + Number(c.n), 0), paying: refs.filter(r => r.billing_status === 'active').length };
  }
  const commStatus = (c, t) => c.reversed >= c.amount ? (c.note || 'Refunded') : (c.reversed ? 'Part refunded, ' : '') + (c.clears_at > t ? 'on hold until ' + date(c.clears_at) : 'cleared');

  /* ---------- pages ---------- */
  const page = (title, inner, wide) => h.authPage(title + ' · Bookingbooster partners', inner, wide);
  const terms = '<div class="card"><b>How it works</b><ul style="margin:8px 0 0;padding-left:20px;color:var(--mut)">' +
    '<li>You get your own link and a code. Hosts who sign up through either are yours for life.</li>' +
    '<li>You earn <b>' + pct + '</b> of every plan or package payment they make to us, monthly or yearly, for as long as they keep paying.</li>' +
    '<li>Your link is remembered for ' + A.cookieDays + ' days. If a host clicks someone else\'s link later, the latest link counts. A code typed at sign-up always counts.</li>' +
    '<li>Each commission is held for ' + A.holdDays + ' days in case of a refund, then it is yours. If a payment is refunded, the same share of the commission is taken back.</li>' +
    '<li>We pay by bank transfer at the start of each month once you have ' + money(A.minPayout) + ' or more cleared.</li>' +
    '<li>You cannot refer yourself. No spam, no bidding on our name in search ads, and no promising things we do not offer. We can close an account that breaks these rules.</li></ul></div>';
  function landing(o) {
    o = o || {}; const inp = (l, n, t, ac, v) => '<label>' + l + '<input name="' + n + '" type="' + t + '" autocomplete="' + ac + '" value="' + E(v || '') + '" required></label>';
    return page('Partner programme', '<h1>Earn ' + pct + ' for every host you send us</h1><p>Recommend Bookingbooster to holiday let hosts. You earn ' + pct + ' of every plan and package payment, for as long as they stay with us.</p>' + terms +
      (o.err ? '<p class="err" role="alert">' + E(o.err) + '</p>' : '') +
      '<form class="card" method="post" action="/partners/join"><b>Join the programme</b>' + inp('Your name', 'name', 'text', 'name', o.name) + inp('Email', 'email', 'email', 'email', o.email) + inp('Password (at least 10 characters)', 'password', 'password', 'new-password') +
      '<label style="display:flex;gap:10px;align-items:flex-start;font-weight:500"><input type="checkbox" name="agree" required style="margin-top:4px">I agree to the programme rules above and the <a href="/terms" target="_blank">terms</a>.</label><button>Get my link</button></form>' +
      '<div class="links"><a href="/partners/login">Partner sign in</a><a href="/">About Bookingbooster</a></div>');
  }
  function loginPage(o) {
    o = o || {};
    return page('Partner sign in', '<h1>Partner sign in</h1><p>Your link, referrals and commission.</p>' + (o.err ? '<p class="err" role="alert">' + E(o.err) + '</p>' : '') + (o.ok ? '<p class="ok">' + E(o.ok) + '</p>' : '') +
      '<form method="post" action="/partners/login"><label>Email<input name="email" type="email" autocomplete="email" required value="' + E(o.email || '') + '"></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form>' +
      '<div class="links"><a href="/partners/forgot">Forgot your password?</a><a href="/partners">Join the programme</a></div>');
  }
  async function dashboard(a, note) {
    const t = now(), s = await summary(a, t), num = {}; s.refs.forEach((r, i) => { num[r.workspace_id] = i + 1; });
    const stat = (n, l) => '<div><div style="font:600 24px/1.1 \'Bricolage Grotesque\',sans-serif">' + n + '</div><small style="color:var(--mut)">' + l + '</small></div>';
    const tbl = (head, rows, empty) => rows.length ? '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px"><tr>' + head.map(x => '<th align="left">' + x + '</th>').join('') + '</tr>' + rows.map(r => '<tr style="border-top:1px solid var(--line)">' + r.map(x => '<td>' + x + '</td>').join('') + '</tr>').join('') + '</table>' : '<p style="margin:8px 0 0">' + empty + '</p>';
    return page('Your partner account', '<h1>Hi ' + E(a.name.split(' ')[0]) + '</h1>' + (note ? '<p class="ok">' + E(note) + '</p>' : '') + (a.status !== 'active' ? '<p class="err">Your partner account is paused, so new payments do not earn commission. Email ' + E(cfg.company.support) + ' to talk about it.</p>' : '') +
      '<div class="card"><b>Your link</b><p style="margin:6px 0 4px"><input readonly value="' + E(link(a)) + '" style="width:100%" onclick="this.select()"></p><p style="margin:0"><small>Or hosts can type your code <b>' + E(a.code) + '</b> when they sign up. Send people to a page with <code>?ref=' + E(a.code) + '</code> on the end, or to <code>' + E(link(a)) + '?to=/pricing</code>.</small></p></div>' +
      '<div class="card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:16px">' + stat(s.clicks30, 'clicks, last 30 days') + stat(s.refs.length, 'hosts signed up') + stat(s.paying, 'paying now') + stat(money(s.earned), 'earned in total') + stat(money(s.hold), 'on hold') + stat(money(Math.max(0, s.due)), 'ready to pay') + stat(money(s.paid), 'paid to you') + '</div>' +
      (s.due < 0 ? '<p><small>A refund took back ' + money(-s.due) + ' that was already paid to you. It comes off your next payout.</small></p>' : s.due > 0 && s.due < A.minPayout ? '<p><small>We pay out once ' + money(A.minPayout) + ' has cleared.</small></p>' : '') +
      '<div class="card"><b>Hosts you referred</b>' + tbl(['', 'Joined', 'Status'], s.refs.map((r, i) => ['Host ' + (i + 1), date(r.created_at), E(r.slug ? STATUS[r.billing_status] || 'Signed up' : 'Account closed')]), 'Nobody yet. Share your link to get started.') + '<p style="margin:8px 0 0"><small>To protect their privacy we do not show hosts\' names.</small></p></div>' +
      '<div class="card"><b>Commission</b>' + tbl(['Date', 'Host', 'For', 'They paid', 'You earn', 'Status'], s.comms.map(c => [date(c.created_at), 'Host ' + (num[c.workspace_id] || '?'), KIND[c.kind] || c.kind, money(c.gross), money(c.amount - c.reversed), E(commStatus(c, t))]), 'Commission shows here as soon as a host you referred pays.') + '</div>' +
      '<div class="card"><b>Payouts</b>' + tbl(['Date', 'Amount', 'Reference'], s.payouts.map(p => [date(p.created_at), money(p.amount), E(p.reference || '')]), 'No payouts yet.') + '</div>' +
      '<form class="card" method="post" action="/partners/details"><b>Your details</b><label>Your name<input name="name" value="' + E(a.name) + '" required></label>' +
      '<label>Where we pay you<textarea name="payout" rows="3" style="font:inherit;padding:12px 14px;border-radius:10px;border:1px solid #D6D5CF" placeholder="Account name, sort code and account number (or IBAN)">' + E(a.payout) + '</textarea></label><p style="margin:0"><small>Signed in as ' + E(a.email) + '. Only the Bookingbooster team sees these details.</small></p><button>Save</button></form>' +
      terms + '<form method="post" action="/partners/logout" style="margin-top:18px"><button class="sec" style="background:transparent;color:var(--p);border:1px solid var(--line)">Sign out</button></form>', 'read');
  }

  // Public and partner pages. Returns true when it handled the request.
  async function route(req, res, u, p, m) {
    if (await capture(req, res, u)) return true;
    if (!(p === '/partners' || p.startsWith('/partners/'))) return false;
    const html = (body, status) => { h.send(res, status || 200, body, 'text/html; charset=utf-8', { 'cache-control': 'no-store' }); return true; };
    const ip = h.ip(req);
    if (p === '/partners' && m === 'GET') { if (await me(req)) { h.redirect(res, '/partners/dashboard'); return true; } return html(landing()); }
    if (p === '/partners/join' && m === 'POST') {
      const f = await h.formBody(req), name = String(f.name || '').trim().slice(0, 80), email = String(f.email || '').trim().toLowerCase().slice(0, 160), pw = String(f.password || '');
      const back = err => html(landing({ err, name, email }), 400);
      if (!auth.limit('affjoin:' + ip, 6, 3600e3)) return back('Too many sign-ups from here. Try again later.');
      if (name.length < 2) return back('Enter your name.');
      if (!validEmail(email)) return back('Enter a valid email.');
      if (pw.length < 10) return back('Use a password of at least 10 characters.');
      if (!f.agree) return back('Tick the box to agree to the programme rules.');
      if (await q.byEmail.get(email)) return back('There is already a partner account for that email. Sign in instead.');
      const a = await create({ name, email, password: pw });
      msg.sendEmail({ to: a.email, subject: 'Your Bookingbooster partner link', text: 'Hi ' + name.split(' ')[0] + ',\n\nWelcome to the Bookingbooster partner programme. Your link is ' + link(a) + ' and your code is ' + a.code + '.\n\nYou earn ' + pct + ' of everything the hosts you refer pay us, for as long as they stay. Your account: ' + cfg.baseUrl + '/partners/dashboard\n\n' + cfg.leads.signoff, meta: { affiliate: a.id } });
      h.redirect(res, '/partners/dashboard', { 'set-cookie': h.cookie('bb_aff', await startSession(a.id), 30 * 86400) }); return true;
    }
    if (p === '/partners/login') {
      if (m !== 'POST') return html(loginPage());
      const f = await h.formBody(req), email = String(f.email || '').trim().toLowerCase();
      if (!auth.limit('afflogin:' + ip, 10, 900e3)) return html(loginPage({ err: 'Too many tries. Wait a few minutes.', email }), 429);
      const a = await q.byEmail.get(email);
      if (!a || !auth.checkPass(String(f.password || ''), a.pass)) return html(loginPage({ err: 'That email and password do not match.', email }), 401);
      h.redirect(res, '/partners/dashboard', { 'set-cookie': h.cookie('bb_aff', await startSession(a.id), 30 * 86400) }); return true;
    }
    if (p === '/partners/logout' && m === 'POST') { const tk = h.cookies(req).bb_aff; if (tk) await q.delSess.run(sha(tk)); h.redirect(res, '/partners/login', { 'set-cookie': h.cookie('bb_aff', '', 0) }); return true; }
    if (p === '/partners/forgot') {
      if (m !== 'POST') return html(page('Reset password', '<h1>Reset your password</h1><p>We will email you a link.</p><form method="post"><label>Email<input name="email" type="email" required></label><button>Send the link</button></form>'));
      const f = await h.formBody(req), a = auth.limit('affreset:' + ip, 5, 3600e3) && await q.byEmail.get(String(f.email || '').trim());
      if (a) { const tok = crypto.randomBytes(24).toString('base64url'); await q.kvSet.run('affreset:' + sha(tok), JSON.stringify({ id: a.id, exp: now() + 3600e3 }));
        await msg.sendEmail({ to: a.email, subject: 'Reset your Bookingbooster partner password', text: 'Choose a new password here (the link works for an hour): ' + cfg.baseUrl + '/partners/reset?t=' + tok + '\n\nIf you did not ask, ignore this email.', meta: { affiliate: a.id } }); }
      return html(loginPage({ ok: 'If there is a partner account for that email, a reset link is on its way.' }));
    }
    if (p === '/partners/reset') {
      const f = m === 'POST' ? await h.formBody(req) : { t: u.searchParams.get('t') }, k = 'affreset:' + sha(f.t || ''), row = await q.kvGet.get(k); let r = null; try { r = row && JSON.parse(row.v); } catch (_) {}
      if (!r || r.exp < now()) return html(page('Link expired', '<h1>That link has expired.</h1><p><a href="/partners/forgot">Ask for a new one</a></p>'), 400);
      if (m !== 'POST' || String(f.password || '').length < 10) return html(page('New password', '<h1>Choose a new password</h1>' + (m === 'POST' ? '<p class="err">Use at least 10 characters.</p>' : '') + '<form method="post"><input type="hidden" name="t" value="' + E(f.t) + '"><label>New password<input name="password" type="password" minlength="10" required autocomplete="new-password"></label><button>Save</button></form>'), m === 'POST' ? 400 : 200);
      await q.setPass.run(auth.hashPass(f.password), r.id); await q.delSessFor.run(r.id); await q.kvDel.run(k);
      return html(loginPage({ ok: 'Password changed. Sign in with the new one.' }));
    }
    const a = await me(req);
    if (!a) { h.redirect(res, '/partners/login'); return true; }
    if (p === '/partners/dashboard' && m === 'GET') return html(await dashboard(a));
    if (p === '/partners/details' && m === 'POST') {
      const f = await h.formBody(req), name = String(f.name || '').trim().slice(0, 80);
      await q.setDetails.run(name.length >= 2 ? name : a.name, String(f.payout || '').trim().slice(0, 500), a.id);
      return html(await dashboard(await q.byId.get(a.id), 'Saved.'));
    }
    h.notFound(res); return true;
  }

  /* ---------- team view: /admin/affiliates ---------- */
  async function renderAdmin(res, note, err, who) {
    const t = now(), list = await q.all.all(), refs = await q.allRefs.all(), comms = await q.recentComms.all(), ui = h.ui;
    const sums = await Promise.all(list.map(a => summary(a, t)));
    const tot = k => sums.reduce((s, x) => s + x[k], 0);
    const prow = list.map((a, i) => {
      const s = sums[i];
      const pay = '<form class="adm-form" method="post" action="/admin/affiliates/payout"><input type="hidden" name="id" value="' + E(a.id) + '"><div class="row"><input name="amount" type="number" step="0.01" min="0.01" value="' + (s.due > 0 ? (s.due / 100).toFixed(2) : '') + '" placeholder="£" style="width:90px"><input name="reference" placeholder="Bank reference" style="width:130px"><button class="btn sm primary"' + (s.due > 0 ? '' : ' disabled') + '>Mark paid</button></div></form>';
      const st = '<form method="post" action="/admin/affiliates/status" style="margin-top:6px"><input type="hidden" name="id" value="' + E(a.id) + '"><input type="hidden" name="status" value="' + (a.status === 'active' ? 'paused' : 'active') + '"><button class="btn sm">' + (a.status === 'active' ? 'Pause' : 'Reactivate') + '</button></form>';
      return '<tr><td><b>' + E(a.name) + '</b> ' + (a.status !== 'active' ? ui.pill('bad', 'Paused') : '') + '<br><small>' + E(a.email) + '<br>Code ' + E(a.code) + ' · joined ' + date(a.created_at) + '</small></td>' +
        '<td>' + s.clicks + ' clicks<br>' + s.refs.length + ' hosts<br>' + s.paying + ' paying</td><td>Earned ' + money(s.earned) + '<br>On hold ' + money(s.hold) + '<br><b>Due ' + money(s.due) + '</b>' + (s.due > 0 && s.due < A.minPayout ? '<br><small>under ' + money(A.minPayout) + '</small>' : '') + '<br>Paid ' + money(s.paid) + '</td>' +
        '<td><small style="white-space:pre-wrap">' + (a.payout ? E(a.payout) : 'No payout details yet') + '</small></td><td>' + pay + st + '</td></tr>';
    });
    const opts = refs.filter(r => r.slug).map(r => [r.workspace_id, r.slug + ' (' + r.code + ')']);
    const crow = comms.map(c => '<tr><td>' + date(c.created_at) + '</td><td>' + E(c.code) + '</td><td>' + E(c.slug || 'closed') + '</td><td>' + E(KIND[c.kind] || c.kind) + ' · ' + (c.source === 'bank' ? 'bank transfer' : 'card') + '</td><td>' + money(c.gross) + '</td><td>' + money(c.amount - c.reversed) + '</td><td>' + E(commStatus(c, t)) + '</td><td>' +
      (c.reversed < c.amount ? '<form method="post" action="/admin/affiliates/reverse"><input type="hidden" name="id" value="' + E(c.id) + '"><button class="btn sm">Refunded</button></form>' : '') + '</td></tr>');
    const bank = '<form class="adm-form" method="post" action="/admin/affiliates/bank">' + (opts.length ? ui.field('workspace', '', 'Host', { options: opts }) + ui.field('amount', '', 'Amount received (£, as paid)', { type: 'number', req: true, extra: ' step="0.01" min="0.01"' }) +
      ui.field('kind', 'plan', 'For', { options: [['plan', 'Plan payment'], ['setup', 'Package'], ['other', 'Other']] }) + ui.field('reference', '', 'Bank reference', { req: true }) + '<button class="btn primary">Record payment and commission</button>' : '<p>No referred hosts yet.</p>') + '</form>';
    const linkf = '<form class="adm-form" method="post" action="/admin/affiliates/link"><p class="adm-help">For a host who was referred but did not use the link or code. Only hosts without a partner can be linked, and only payments from now on earn commission.</p>' +
      ui.field('host', '', 'Host sign-in email or site address name', { req: true }) + ui.field('code', '', 'Partner code', { req: true }) + '<button class="btn">Link</button></form>';
    h.send(res, err ? 400 : 200, ui.shell({ title: 'Partners', active: 'partners', email: who, note, err,
      sub: 'Partners earn ' + pct + ' of every payment from hosts they referred, for life. Commission clears after ' + A.holdDays + ' days; pay anyone due ' + money(A.minPayout) + ' or more by bank transfer, then mark it paid here. Sign-up page: <a href="/partners">/partners</a>',
      body: '<div class="adm-kpis">' + ui.kpi('Partners', list.length, '', refs.length + ' hosts referred') + ui.kpi('Due now', money(Math.max(0, tot('due'))), '', 'cleared, not paid yet', true) + ui.kpi('On hold', money(tot('hold')), '', 'clears within ' + A.holdDays + ' days') + ui.kpi('Paid out', money(tot('paid')), '', 'all time') + '</div>' +
        ui.card('Partners', '', ui.table(['Partner', 'Referrals', 'Commission', 'Pay to', ''], prow, 'Nobody has joined yet. Share /partners.')) +
        '<div class="adm-cols">' + ui.card('Record a bank transfer from a referred host', '', bank) + ui.card('Link a host to a partner', '', linkf) + '</div>' +
        ui.card('Commission', '', '<p class="adm-help">Card refunds and lost chargebacks come back from Stripe by themselves. Use Refunded for a bank transfer you paid back.</p>' + ui.table(['Date', 'Partner', 'Host', 'For', 'Paid', 'Commission', 'Status', ''], crow, 'No commission yet.')) }), 'text/html; charset=utf-8');
    return true;
  }
  async function admin(req, res, p, m, who) {
    const adminPage = (r, note, err) => renderAdmin(r, note, err, who);
    if (p === '/admin/affiliates' && m === 'GET') return adminPage(res);
    if (m !== 'POST') return false;
    const f = await h.formBody(req), pence = v => Math.round(parseFloat(String(v || '').replace(/[£,\s]/g, '')) * 100);
    if (p === '/admin/affiliates/payout') {
      const a = await q.byId.get(String(f.id)); if (!a) return adminPage(res, null, 'Partner not found.');
      const amt = pence(f.amount), s = await summary(a);
      if (!(amt > 0)) return adminPage(res, null, 'Enter the amount you paid.');
      if (amt > s.due) return adminPage(res, null, 'That is more than the ' + money(Math.max(0, s.due)) + ' due to ' + a.name + '.');
      await q.addPayout.run(a.id, amt, String(f.reference || '').trim().slice(0, 120), now());
      msg.sendEmail({ to: a.email, subject: 'We have paid you ' + money(amt), text: 'Hi ' + a.name.split(' ')[0] + ',\n\nWe have sent you ' + money(amt) + ' in partner commission' + (f.reference ? ' (reference ' + String(f.reference).slice(0, 120) + ')' : '') + '. It should reach your account within a couple of working days.\n\nYour statement: ' + cfg.baseUrl + '/partners/dashboard\n\nThank you for sending hosts our way.\n\n' + cfg.leads.signoff, meta: { affiliate: a.id } });
      return adminPage(res, 'Marked ' + money(amt) + ' as paid to ' + a.name + '.');
    }
    if (p === '/admin/affiliates/status') {
      const a = await q.byId.get(String(f.id)); if (!a) return adminPage(res, null, 'Partner not found.');
      await q.setStatus.run(f.status === 'active' ? 'active' : 'paused', a.id); return adminPage(res, a.name + (f.status === 'active' ? ' is active again.' : ' is paused. Their link stops working and new payments earn nothing.'));
    }
    if (p === '/admin/affiliates/bank') {
      const amt = pence(f.amount), ref = String(f.reference || '').trim().slice(0, 120);
      if (!(amt > 0) || !ref) return adminPage(res, null, 'Enter the amount and the bank reference.');
      const r = await record({ workspaceId: String(f.workspace || ''), id: 'bank:' + sha(f.workspace + '|' + ref).slice(0, 20), kind: f.kind, source: 'bank', gross: amt, refs: [], note: 'Bank ref ' + ref });
      if (!r) return adminPage(res, null, 'That host has no active partner, so there is no commission to record.');
      return adminPage(res, r.created ? 'Recorded. ' + r.code + ' earns ' + money(r.amount) + '.' : 'That bank reference was already recorded for this host.');
    }
    if (p === '/admin/affiliates/reverse') {
      const c = await q.comm.get(String(f.id)); if (!c) return adminPage(res, null, 'Commission not found.');
      await reverse(c, c.amount, 'Refunded'); return adminPage(res, 'Commission taken back.');
    }
    if (p === '/admin/affiliates/link') {
      const host = String(f.host || '').trim(), a = await active(f.code);
      const w = (await q.wsByEmail.get(host)) || (await q.wsBySlug.get(host.toLowerCase()));
      if (!w) return adminPage(res, null, 'No host account found for ' + host + '.');
      if (!a) return adminPage(res, null, 'No active partner has that code.');
      const r = await q.addRef.run(w.id, a.id, 'team', now());
      return adminPage(res, r.changes ? 'Linked to ' + a.name + '.' : null, r.changes ? null : 'That host already has a partner.');
    }
    return false;
  }

  return { route, capture, cookieCode, forSignup, attach, record, stripeEvent, summary, admin, me };
};
