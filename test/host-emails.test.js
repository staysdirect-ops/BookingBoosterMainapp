// Emails to hosts about their own account: setup checklist, week-3 tips, Monday report and failed payments.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const start = require('./harness');

const SECRET = 'whsec_test_123', DAY = 864e5;
const mails = [];
let mock, t, created;
const host = () => mails.filter(m => [].concat(m.to).includes('host@example.co.uk') && /^(Day 2|Week 3|Your week|Action needed)/.test(m.subject));
const runAt = at => t.call('/admin/hostmail/run', { body: { at } });
const form = (p, o) => t.call(p, { body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const sql = (q, ...a) => t.sql(q, ...a);
const uk = ms => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date(ms)); return { hour: +f.find(x => x.type === 'hour').value % 24, wd: f.find(x => x.type === 'weekday').value }; };
const ukAt = (from, ok) => { let x = Math.ceil(from / 36e5) * 36e5; while (!ok(uk(x))) x += 36e5; return x; };
const filled = m => {
  assert.doesNotMatch(m.html + m.text, /\{\{|\[\[|undefined|NaN|\bSam\b/, 'no unfilled fields in ' + m.subject);
  assert.match(m.html, /\/email-img\/brand\/logo\.png/, 'logo served by the app');
  assert.ok(m.html.includes('<title>' + m.subject + '</title>'), 'title matches the subject');
};

test.before(async () => {
  mock = http.createServer((q, s) => {
    let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
      let out = { id: 'x' };
      if (q.url === '/emails') { try { mails.push(JSON.parse(raw)); } catch (_) {} out = { id: 'm_' + mails.length }; }
      if (q.url.startsWith('/v1/invoices/in_1')) out = { id: 'in_1', payment_intent: { payment_method: { card: { brand: 'visa', last4: '4242' } }, last_payment_error: { decline_code: 'insufficient_funds' } } };
      s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify(out));
    });
  }).listen(0);
  const base = 'http://localhost:' + mock.address().port;
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: base, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: base, STRIPE_WEBHOOK_SECRET: SECRET, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' });
  await t.signup();
  await sql("UPDATE workspaces SET stripe_customer = 'cus_1' WHERE stripe_customer IS NULL AND created_at > ?", Date.now() - DAY);
  created = (await sql("SELECT created_at FROM workspaces WHERE stripe_customer = 'cus_1'"))[0].created_at;
});
test.after(() => { t.stop(); mock.close(); });

test('day 2 brings the setup checklist once, after 9am', async () => {
  const at = ukAt(created + 2 * DAY, u => u.hour === 10);
  await runAt(ukAt(created + 2 * DAY, u => u.hour === 3));
  assert.equal(host().length, 0, 'not in the night');
  await runAt(at);
  const m = await t.until(async () => host().find(x => /^Day 2/.test(x.subject)));
  assert.ok(m, 'checklist sent');
  assert.equal(m.subject, 'Day 2: the 15-minute checklist for Gull Cottage');
  assert.match(m.html, /Hi Test,/);
  assert.match(m.html, /of 6 done/);
  assert.match(m.html, /Payouts/);
  assert.ok(m.headers['List-Unsubscribe'], 'optional email has an unsubscribe header');
  filled(m);
  await runAt(at + 36e5);
  assert.equal(host().filter(x => /^Day 2/.test(x.subject)).length, 1, 'only once');
});

test('the Monday report covers last week, and stops when the host turns it off', async () => {
  const { p } = await t.home();
  const b = await t.act('createBooking', { propertyId: p.id, checkIn: t.dateIn(10), checkOut: t.dateIn(12), adults: 2, name: 'Pat Guest', email: 'pat@example.co.uk', pay: 'manual', channel: 'direct' });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  // the Monday after today, so the week just ended includes the booking
  const monday = ukAt(Date.now() + 36e5, u => u.wd === 'Mon' && u.hour === 20);
  await runAt(monday);
  const m = await t.until(async () => host().find(x => /^Your week/.test(x.subject)));
  assert.ok(m, 'report sent');
  assert.match(m.subject, /^Your week: £\d[\d,]* direct, £\d[\d,]* in fees kept$/);
  assert.match(m.html, /Every new booking this week came direct/);
  assert.match(m.html, /Where visitors came from/);
  assert.ok(m.headers['List-Unsubscribe']);
  filled(m);
  await runAt(monday + 36e5);
  assert.equal(host().filter(x => /^Your week/.test(x.subject)).length, 1, 'once a week');

  const acct = await t.call('/app/account'); assert.match(acct.body, /Emails from us/);
  const saved = await form('/app/account/emails', { setup: 'on' });
  assert.equal(saved.status, 302);
  await sql("UPDATE kv SET v = (v::jsonb - 'report')::text WHERE k LIKE 'hostmail:%'");
  await runAt(monday);
  assert.equal(host().filter(x => /^Your week/.test(x.subject)).length, 1, 'no report once turned off');
  assert.equal(host().filter(x => /^Day 2/.test(x.subject)).length, 1, 'checklist still only once');
  await form('/app/account/emails', { setup: 'on', report: 'on' });
});

test('the unsubscribe link turns the email off', async () => {
  const m = host().find(x => /^Your week/.test(x.subject));
  const link = m.headers['List-Unsubscribe'].replace(/^<|>$/g, '').replace(/^https?:\/\/[^/]+/, '');
  assert.match(link, /^\/u\/host\/[^/]+\/report\//);
  assert.equal((await t.call(link)).status, 200);
  assert.equal((await t.call(link, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' })).status, 200);
  assert.doesNotMatch((await t.call('/app/account')).body, /name="report" checked/);
  assert.equal((await t.call(link.replace(/[^/]+$/, 'forged'))).status, 404);
  await form('/app/account/emails', { setup: 'on', report: 'on' });
});

test('week 3 brings campaign and automation tips', async () => {
  await runAt(ukAt(created + 21 * DAY, u => u.hour === 10));
  const m = await t.until(async () => host().find(x => /^Week 3/.test(x.subject)));
  assert.ok(m, 'week 3 sent');
  assert.match(m.html, /empty nights|gap/i);
  filled(m);
});

test('a failed plan payment emails the host and marks the account, and paying clears it', async () => {
  const hook = event => {
    const raw = JSON.stringify(event), ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');
    return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + sig } });
  };
  const now = Math.floor(Date.now() / 1000);
  const r = await hook({ type: 'invoice.payment_failed', data: { object: { id: 'in_1', customer: 'cus_1', amount_due: 20000, billing_reason: 'subscription_cycle', created: now, next_payment_attempt: now + 3 * 86400 } } });
  assert.equal(r.status, 200);
  const m = await t.until(async () => host().find(x => /^Action needed/.test(x.subject)));
  assert.ok(m, 'payment failed email sent');
  assert.match(m.html, /£200/);
  assert.match(m.html, /Visa/);
  assert.match(m.html, /4242/);
  assert.match(m.html, /insufficient funds/);
  assert.ok(!m.headers || !m.headers['List-Unsubscribe'], 'account email, no unsubscribe');
  filled(m);
  assert.equal((await sql("SELECT billing_status FROM workspaces WHERE stripe_customer = 'cus_1'"))[0].billing_status, 'past_due');
  assert.match((await t.call('/app/billing')).body, /Payment failed/);
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_1', customer: 'cus_1' } } });
  assert.equal((await sql("SELECT billing_status FROM workspaces WHERE stripe_customer = 'cus_1'"))[0].billing_status, 'active');
});
