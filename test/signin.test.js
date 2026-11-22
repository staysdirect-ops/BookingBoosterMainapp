// Sign-in by email: magic link and code (single use, 15 minutes, wrong-code limit) and the branded password reset email.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');

let t;
// A visitor with no session cookie, the way a host on a new device arrives.
const post = (p, o, headers) => fetch(t.base + p, { method: 'POST', redirect: 'manual', headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, headers || {}), body: new URLSearchParams(o).toString() });
const mails = async (template, to) => (await t.sql("SELECT recipient, subject, body, html, meta FROM outbox WHERE meta LIKE ? AND recipient = ? ORDER BY id", '%"template":"' + template + '"%', to));
const last = async (template, to) => (await mails(template, to)).pop();
const linkOf = m => m.body.match(/\/login\/link\?t=([A-Za-z0-9_-]+)/)[1];
const codeOf = m => m.body.match(/code: (\d{3} \d{3})/)[1];
const signedIn = async (r, to = '/app') => {
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), to);
  const c = r.headers.get('set-cookie').split(';')[0];
  return (await fetch(t.base + '/api/state', { headers: { cookie: c } })).status === 200;
};
// Each test signs in as its own host, because one address can only get 3 sign-in emails in 15 minutes.
let n = 0;
async function host() {
  const email = 'host' + (++n) + '@example.co.uk';
  const r = await fetch(t.base + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.9.' + n }, body: JSON.stringify({ plan: 'Growth',
    account: { name: 'Robin Host', business: 'Test Stays', email, password: 'correcthorse1' }, property: { name: 'Gull Cottage', theme: 'lake', nightly: 140, maxGuests: 4, bedrooms: 2, area: 'Whitby' } }) });
  assert.equal(r.status, 200, 'signup ' + email);
  return email;
}
const ask = (email, ua, extra) => post('/login/email', { email }, Object.assign({ 'user-agent': ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 250) }, extra));

test.before(async () => { t = await start({}); });
test.after(() => t.stop());

test('the sign-in page offers an emailed link', async () => {
  assert.match(await fetch(t.base + '/login').then(r => r.text()), /href="\/login\/email"/);
  assert.match(await fetch(t.base + '/login/email').then(r => r.text()), /Email me a sign-in link/);
});

test('the magic link email is the branded template, filled in, and signs in once', async () => {
  const email = await host();
  const r = await ask(email, undefined, { 'cf-ipcountry': 'GB' });
  assert.equal(r.status, 200); assert.match(await r.text(), /enter the 6-digit code/);
  const m = await last('magic-link', email);
  assert.equal(m.subject, 'Your Bookingbooster sign-in link');
  assert.ok(m.html.includes('<title>' + m.subject + '</title>'));
  assert.doesNotMatch(m.html, /\{\{|undefined|NaN/);
  assert.match(m.html, /Hi Robin,/); assert.match(m.html, /Safari on iPhone/); assert.match(m.html, /United Kingdom/);
  assert.match(m.html, /\/email-img\/brand\/logo\.png/);
  const tok = linkOf(m), code = codeOf(m);
  assert.ok(m.html.includes('/login/link?t=' + tok)); assert.ok(m.html.includes(code));

  // Opening the link (as an email scanner would) does not use it up.
  const page = await fetch(t.base + '/login/link?t=' + tok);
  assert.equal(page.status, 200); assert.equal(page.headers.get('set-cookie'), null);
  assert.ok(await signedIn(await post('/login/link', { t: tok })), 'link signs in');
  assert.equal((await post('/login/link', { t: tok })).status, 400, 'link works only once');
  assert.equal((await post('/login/code', { email, code })).status, 401, 'using the link voids the code');
  assert.equal((await t.sql('SELECT verified FROM users WHERE email = ?', email))[0].verified, 1, 'email marked verified');
});

test('the code signs in on another device, once, and voids the link', async () => {
  const email = await host();
  await ask(email, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
  const m = await last('magic-link', email); assert.match(m.html, /Chrome on Windows/); assert.match(m.html, /Not available/);
  assert.ok(await signedIn(await post('/login/code', { email: email.toUpperCase(), code: codeOf(m).replace(' ', '') })));
  assert.equal((await post('/login/code', { email, code: codeOf(m) })).status, 401, 'code works only once');
  assert.equal((await post('/login/link', { t: linkOf(m) })).status, 400, 'using the code voids the link');
});

test('a new email replaces the old link, and links expire after 15 minutes', async () => {
  const email = await host();
  await ask(email); const first = await last('magic-link', email);
  await ask(email); const second = await last('magic-link', email);
  assert.notEqual(linkOf(first), linkOf(second));
  assert.equal((await post('/login/link', { t: linkOf(first) })).status, 400, 'older link no longer works');
  const uid = (await t.sql('SELECT id FROM users WHERE email = ?', email))[0].id;
  await t.sql('UPDATE resets SET expires_at = ? WHERE user_id = ?', Date.now() - 1000, uid);
  assert.equal((await post('/login/link', { t: linkOf(second) })).status, 400, 'expired link');
  assert.equal((await post('/login/code', { email, code: codeOf(second) })).status, 401, 'expired code');
});

test('five wrong codes void the right one', async () => {
  const email = await host();
  await ask(email); const m = await last('magic-link', email);
  const good = codeOf(m).replace(' ', ''), bad = String((+good + 1) % 1e6).padStart(6, '0');
  for (let i = 0; i < 5; i++) assert.equal((await post('/login/code', { email, code: bad }, { 'x-forwarded-for': '10.1.1.' + i })).status, 401);
  assert.equal((await post('/login/code', { email, code: good })).status, 401, 'the right code no longer works');
  await ask(email); const again = await last('magic-link', email);
  assert.ok(await signedIn(await post('/login/code', { email, code: codeOf(again) })), 'a new code works');
});

test('sign-in emails are rate limited, and unknown addresses get the same answer', async () => {
  const r = await post('/login/email', { email: 'nobody@example.co.uk' }, { 'x-forwarded-for': '10.2.2.2' });
  assert.equal(r.status, 200); assert.match(await r.text(), /If there is an account/);
  assert.equal((await t.sql("SELECT count(*)::int AS n FROM outbox WHERE recipient = 'nobody@example.co.uk'"))[0].n, 0);
  const email = await host();
  for (let i = 0; i < 5; i++) await ask(email);
  assert.equal((await mails('magic-link', email)).length, 3, 'at most 3 emails to one address in 15 minutes');
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) limited = (await post('/login/email', { email: 'x' + i + '@example.co.uk' }, { 'x-forwarded-for': '10.3.3.3' })).status === 429;
  assert.ok(limited, 'at most 10 requests an hour from one address');
});

test('the password reset email is branded and the link works once', async () => {
  const email = await host();
  await post('/forgot', { email }, { 'x-forwarded-for': '10.4.4.4', 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15' });
  const m = await t.until(() => last('reset', email));
  assert.equal(m.subject, 'Reset your Bookingbooster password');
  assert.ok(m.html.includes('<title>' + m.subject + '</title>'));
  assert.doesNotMatch(m.html, /\{\{|undefined|NaN/);
  assert.match(m.html, /Hi Robin\./); assert.match(m.html, /Safari on Mac/); assert.match(m.html, /\/email-img\/brand\/logo\.png/);
  const tok = m.body.match(/\/reset\?t=([A-Za-z0-9_-]+)/)[1];
  assert.ok(m.html.includes('/reset?t=' + tok));
  assert.equal((await post('/reset', { t: tok, password: 'brand-new-pass-1' })).status, 302);
  assert.equal((await post('/reset', { t: tok, password: 'another-pass-22' })).status, 400, 'reset link works only once');
  assert.equal((await post('/login', { email, password: 'brand-new-pass-1' }, { 'x-forwarded-for': '10.5.5.5' })).status, 302);
});
