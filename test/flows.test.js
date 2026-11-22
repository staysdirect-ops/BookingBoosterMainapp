// Sales automation flows (server/flows.js): unfinished sign-up, first 30 days, keep and win back, lead to call,
// call to paid, the team's to-dos, the on/off switches and pause instead of cancel.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

const SECRET = 'whsec_test_flows', DAY = 864e5, HOUR = 36e5;
const mails = [], stripeCalls = [];
let mock, t, created;
const runAt = at => t.call('/admin/flows/run', { body: { at } });
const to = (addr, re) => mails.filter(m => [].concat(m.to).includes(addr) && (!re || re.test(m.subject)));
const team = re => mails.filter(m => /^Team to-do/.test(m.subject) && (!re || re.test(m.subject + m.text)));
const form = (p, o) => t.call(p, { body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const lead = body => fetch(t.base + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://booking-booster.co.uk' }, body: JSON.stringify(body) });
const clean = m => assert.doesNotMatch(m.html + m.text, /\{[a-z_]+\}|undefined|NaN|null/, 'no unfilled fields in ' + m.subject);
const hook = event => {
  const raw = JSON.stringify(event), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');
  return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + sig } });
};

test.before(async () => {
  mock = http.createServer((q, s) => {
    let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
      let out = { id: 'x' };
      if (q.url === '/emails') { try { mails.push(JSON.parse(raw)); } catch (_) {} out = { id: 'm_' + mails.length }; }
      if (q.url.startsWith('/v1/subscriptions')) { stripeCalls.push(q.method + ' ' + q.url + ' ' + raw); out = q.method === 'GET' ? { data: [{ id: 'sub_1', status: 'active' }] } : { id: 'sub_1' }; }
      s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify(out));
    });
  }).listen(0);
  const base = 'http://localhost:' + mock.address().port;
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: base, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: base, STRIPE_WEBHOOK_SECRET: SECRET, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' });
  await t.signup();
  const page = await t.call('/admin/flows', { method: 'GET' });
  assert.match(page.body, /Off/, 'flows start off');
  for (const id of ['lead_call', 'call_paid', 'signup', 'onboard', 'retain']) await form('/admin/flows/' + id + '/toggle', { on: '1' });
  created = (await t.sql("SELECT created_at FROM workspaces WHERE kind = 'live' ORDER BY created_at DESC LIMIT 1"))[0].created_at;
});
test.after(() => { t.stop(); mock.close(); });

test('unfinished sign-up: reminders at 1 hour, 1 day and 3 days, then the team hears', async () => {
  await runAt(created + 30 * 6e4);
  assert.equal(to('host@example.co.uk', /one step away/).length, 0, 'not before the hour');
  await runAt(created + HOUR + 6e4);
  const s1 = await t.until(() => to('host@example.co.uk', /one step away/)[0]);
  assert.ok(s1, '1 hour reminder'); assert.equal(s1.subject, 'Your site for Gull Cottage is one step away'); assert.match(s1.html, /\/app\/pay/); clean(s1);
  await runAt(created + HOUR + 2 * 6e4);
  assert.equal(to('host@example.co.uk', /one step away/).length, 1, 'sent once');
  await runAt(created + DAY + 6e4);
  assert.ok(await t.until(() => to('host@example.co.uk', /waiting for Gull Cottage/)[0]), '1 day reminder');
  await runAt(created + 3 * DAY + 2 * HOUR);
  const s3 = await t.until(() => to('host@example.co.uk', /Can we help you finish/)[0]); assert.ok(s3, '3 day reminder'); clean(s3);
  assert.ok(await t.until(() => team(/Unfinished sign-up/)[0]), 'team alert on day 3');
});

test('first 30 days: the email names the next missing setup step', async () => {
  await t.sql("UPDATE workspaces SET billing_status = 'active', stripe_customer = 'cus_f1' WHERE created_at = ?", created);
  await runAt(created + 5 * DAY + HOUR);
  const o1 = await t.until(() => to('host@example.co.uk', /^Next up for Gull Cottage/)[0]);
  assert.ok(o1, 'day 5 next step'); assert.match(o1.html, /of the 4 setup steps/); clean(o1);
  assert.equal(to('host@example.co.uk', /one step away|Can we help you finish/).length, 2, 'no more sign-up reminders once paid');
});

test('failed payment: a reminder 3 days after the account went past due', async () => {
  const T = created + 6 * DAY;
  await t.sql("UPDATE workspaces SET billing_status = 'past_due' WHERE created_at = ?", created);
  await runAt(T);
  await runAt(T + 3 * DAY + HOUR);
  const p1 = await t.until(() => to('host@example.co.uk', /please update your card/)[0]);
  assert.ok(p1, 'day 3 reminder'); assert.match(p1.html, /\/app\/billing/); clean(p1);
  await t.sql("UPDATE workspaces SET billing_status = 'active' WHERE created_at = ?", created);
});

test('asked to cancel: a pause is offered, and the pause link pauses the plan in Stripe', async () => {
  const r = await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_f1', cancel_at_period_end: true, current_period_end: Math.floor(Date.now() / 1000) + 20 * 86400 } } });
  assert.equal(r.status, 200);
  const c1 = await t.until(() => to('host@example.co.uk', /pause instead/)[0]);
  assert.ok(c1, 'pause offer sent'); clean(c1);
  const link = c1.html.match(/href="([^"]*\/u\/pause\/[^"]+)"/)[1].replace(/&amp;/g, '&');
  const path = new URL(link).pathname;
  assert.equal((await t.call(path)).status, 200);
  assert.equal((await t.call(path.replace(/.$/, 'x'))).status, 404, 'link is signed');
  const done = await form(path, { months: '2' });
  assert.match(done.body, /Your plan is paused/);
  assert.ok(stripeCalls.some(c => /^POST \/v1\/subscriptions\/sub_1 .*cancel_at_period_end=false.*pause_collection%5Bbehavior%5D=void/.test(c)), 'Stripe asked to pause and keep the plan');
  await runAt(Date.now() + 10 * 6e4);
  assert.equal(team(/asked to cancel/).length, 0, 'paused straight away: no need to alert the team');
});

test('lead to call: a nudge on day 12, and the team switch stops a flow', async () => {
  assert.equal((await lead({ email: 'fee@example.co.uk', name: 'Fay Lee', page: 'fee-leak', rate: 200, nights: 10 })).status, 200);
  const at = (await t.sql("SELECT created_at FROM leads WHERE email = 'fee@example.co.uk'"))[0].created_at;
  await runAt(at + 11 * DAY);
  assert.equal(to('fee@example.co.uk', /15 minutes on your numbers/).length, 0);
  await runAt(at + 12 * DAY + HOUR);
  const n1 = await t.until(() => to('fee@example.co.uk', /15 minutes on your numbers/)[0]);
  assert.ok(n1, 'day 12 nudge'); assert.match(n1.subject, /Fay/); assert.match(n1.html, /\/u\/lead\//, 'unsubscribe link'); clean(n1);
  const off = await form('/admin/flows/lead_call/toggle', { on: '0' });
  assert.match(off.body, /Lead to call is off/);
  await runAt(at + 19 * DAY + HOUR);
  assert.equal(to('fee@example.co.uk', /Last one from me/).length, 0, 'switched off: nothing sent');
});

test('call to paid: the team marks a no-show and the rebook email goes out', async () => {
  const d = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
  await lead({ email: 'bea@example.co.uk', name: 'Bea', phone: '07700900123', d, t: '10:30', page: 'funnel-2-ai-audit/04-book-call' });
  const id = (await t.sql("SELECT id FROM leads WHERE email = 'bea@example.co.uk'"))[0].id;
  const r = await form('/admin/flows/calls/' + id + '/noshow', {});
  assert.match(r.body, /no-show/);
  const r1 = await t.until(() => to('bea@example.co.uk', /Sorry we missed you/)[0]);
  assert.ok(r1, 'rebook email'); clean(r1);
});

test('the flows page shows every flow with its switch and numbers, and previews each email', async () => {
  const r = await t.call('/admin/flows');
  assert.equal(r.status, 200);
  for (const n of ['Lead to call', 'Call to paid', 'Unfinished sign-up', 'First 30 days', 'Keep and win back', 'Team to-dos from the flows']) assert.ok(r.body.includes(n), n);
  assert.match(r.body, /aria-pressed="false" aria-label="Switch on Lead to call"/);
  const pv = await t.call('/admin/flows/preview/retain/C1');
  assert.equal(pv.status, 200); assert.match(pv.body, /pause instead/i);
  const pv2 = await t.call('/admin/flows/preview/onboard/O2');
  assert.match(pv2.body, /<li[^>]*>Photos, 10 or more<\/li>/);
  const out = await fetch(t.base + '/admin/flows');
  assert.equal(out.status, 404, 'team only');
});
