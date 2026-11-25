// Host plan billing: new hosts pay before they set up. A yearly sign-up gets the yearly Stripe prices, add-on included, with no setup fee
// and no free month. Until it is paid the console shows only the payment page and the booking site stays offline.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

let mock, t, signedUp; const bodies = []; const sessions = {};
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { s.writeHead(200, { 'content-type': 'application/json' });
    if (q.url.startsWith('/v1/checkout/sessions/')) return s.end(JSON.stringify(sessions[q.url.split('/').pop()] || { status: 'open', metadata: {} }));
    if (q.url === '/v1/checkout/sessions') bodies.push(new URLSearchParams(raw)); s.end('{"id":"cs_1","url":"https://checkout.stripe.test/cs_1"}'); }); }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: 'http://localhost:' + mock.address().port,
    STRIPE_PRICE_GROWTH: 'price_g_m', STRIPE_PRICE_GROWTH_ANNUAL: 'price_g_y', STRIPE_PRICE_CALENDAR_SYNC: 'price_a_m', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'price_a_y', STRIPE_PRICE_SETUP: 'price_setup_ignored', STRIPE_WEBHOOK_SECRET: 'whsec_b' });
  signedUp = await t.signup({ annual: true, addon: true });
});
const wsId = () => bodies[0].get('metadata[workspace]');
const paid = () => { const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', customer: 'cus_b', metadata: { workspace: wsId(), kind: 'plan', plan: 'Growth' } } } });
  const ts = Math.floor(Date.now() / 1000), sig = crypto.createHmac('sha256', 'whsec_b').update(ts + '.' + raw).digest('hex');
  return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + sig } }); };

test('sign-up goes straight to Stripe Checkout, and setup stays locked until it is paid', async () => {
  assert.equal(signedUp.body.redirect, 'https://checkout.stripe.test/cs_1');
  assert.match(bodies[0].get('success_url'), /\/app\/pay\/done\?session=\{CHECKOUT_SESSION_ID\}$/); assert.match(bodies[0].get('cancel_url'), /\/app\/pay$/);
  const app = await t.call('/app'); assert.equal(app.status, 302); assert.equal(app.headers.get('location'), '/app/pay');
  assert.equal((await t.call('/api/state')).status, 402);
  assert.equal((await t.call('/api/act', { body: { name: 'addProperty', args: [{ name: 'Sneaky' }] } })).status, 402);
  const pay = await t.call('/app/pay'); assert.equal(pay.status, 200); assert.match(pay.body, /One step left/); assert.match(pay.body, /£1970 for your first year/); assert.doesNotMatch(pay.body, /997|setup fee today/);
  assert.equal((await t.call('/app/account')).status, 200, 'the account page stays open, so they can delete it');
  // back from Checkout before the webhook: an unfinished session keeps the lock
  const early = await t.call('/app/pay/done?session=cs_open'); assert.equal(early.headers.get('location'), '/app/pay?msg=pending');
});
test.after(() => { t.stop(); mock.close(); });

test('a yearly sign-up is billed yearly', async () => {
  assert.match((await t.call('/app/billing')).body, /£1970 a year/);
  const r = await t.call('/app/billing/start', { body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://checkout.stripe.test/cs_1');
  const b = bodies[1]; assert.equal(b.get('line_items[0][price]'), 'price_g_y'); assert.equal(b.get('line_items[1][price]'), 'price_a_y'); assert.equal(b.get('line_items[2][price]'), null, 'no setup fee'); assert.equal(b.get('subscription_data[trial_period_days]'), null, 'no free month');
  assert.match((await t.call('/app/billing')).body, /No setup fee/); assert.doesNotMatch((await t.call('/app/billing')).body, /997/);
});

test('the booking site stays offline to guests until the first payment', async () => {
  const slug = (await t.sql('SELECT slug FROM workspaces WHERE id = ?', wsId()))[0].slug; const path = '/s/' + slug + '/';
  const guest = p => fetch(t.base + p, { redirect: 'manual' });
  const before = await guest(path); assert.equal(before.status, 503); assert.match(await before.text(), /opening soon/);
  const book = await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(book.status, 403);
  assert.doesNotMatch(await (await fetch(t.base + '/sitemap.xml')).text(), new RegExp(path), 'an unpaid site stays out of the sitemap');
  const liveMail = async () => (await t.sql("SELECT count(*)::int AS n FROM outbox WHERE meta LIKE '%site-live%'"))[0].n;
  assert.equal(await liveMail(), 0, 'no "site is live" email while the site is still offline');
  // the return from Checkout confirms it with Stripe straight away, without waiting for the webhook
  sessions.cs_done = { id: 'cs_done', status: 'complete', customer: 'cus_b', metadata: { workspace: wsId(), kind: 'plan', plan: 'Growth' } };
  const done = await t.call('/app/pay/done?session=cs_done'); assert.equal(done.headers.get('location'), '/app?welcome=1');
  assert.equal((await t.call('/app')).status, 200); assert.equal((await t.call('/app/pay')).headers.get('location'), '/app');
  assert.equal((await fetch(t.base + path)).status, 200, 'the site is open to guests');
  assert.equal((await paid()).status, 200, 'the webhook arriving later is fine');
  const welcome = await t.sql("SELECT count(*)::int AS n FROM outbox WHERE subject = 'Welcome to Bookingbooster'"); assert.equal(welcome[0].n, 1, 'one welcome email, after payment');
  assert.equal(await t.until(async () => (await liveMail()) === 1), true, 'one "site is live" email, after payment');
  assert.match(await (await fetch(t.base + '/sitemap.xml')).text(), new RegExp(path), 'a paid site joins the sitemap');
  // a paid host is not sent to Checkout twice
  assert.equal((await t.call('/app/billing/start', { body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).headers.get('location'), '/app/billing');
});
