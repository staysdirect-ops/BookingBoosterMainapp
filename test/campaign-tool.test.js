// The team's campaign tool in /admin/campaigns: custom campaigns to leads and hosts, scheduling, tracking and unsubscribes.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

const mails = [];
let mock, t;
const to = e => mails.filter(m => [].concat(m.to).includes(e));
const lead = body => fetch(t.base + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://booking-booster.co.uk' }, body: JSON.stringify(body) });
const form = (p, o) => t.call(p, { body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const idFrom = r => r.headers.get('location').match(/\/admin\/campaigns\/([a-z0-9-]+)/)[1];
const local = u => u.replace(/^https?:\/\/[^/]+/, '').replace(/&amp;/g, '&');

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"m_' + mails.length + '"}'); }); }).listen(0);
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' });
  await t.signup();
  await lead({ email: 'webby@example.co.uk', name: 'Webby Lane', page: 'webinar', kind: 'webinar' });
  await lead({ email: 'feeby@example.co.uk', name: 'Fee Bee', rate: '180', nights: '15', page: 'funnel-1-fee-leak/02-optin' });
  await lead({ email: 'enquiry@example.co.uk', name: 'Just Asking', kind: 'contact' });
  await t.until(async () => to('feeby@example.co.uk')[0]);
});
test.after(() => { t.stop(); mock.close(); });

test('a custom campaign to hosts: write, test, send, then opens, clicks and unsubscribes are counted', async () => {
  let r = await form('/admin/campaigns/new', { name: 'Winter host news', audience: 'hosts:all' });
  assert.equal(r.status, 302); const id = idFrom(r);
  r = await t.call('/admin/campaigns/' + id);
  assert.match(r.body, /Write the email|Add a subject/);
  r = await form('/admin/campaigns/' + id + '/send', { confirm: '1' });
  assert.match(r.body, /Add a subject|Send yourself a test first/);
  r = await form('/admin/campaigns/' + id + '/test', { name: 'Winter host news', audience: 'hosts:all', subject: 'Winter tips for {{first_name}}', preview: 'Three quick wins', heading: 'Fill your winter gaps',
    body: 'Hi {{first_name}},\n\nHere is what is new:\n\n- **Gap night** offers\n- Faster check-in\n\nRead more at [our guide](https://booking-booster.co.uk/guides/direct-booking-playbook.pdf).', button_label: 'Open your console', button_url: 'https://booking-booster.co.uk/app' });
  assert.match(r.body, /Test sent to host@example\.co\.uk/);
  const testMail = to('host@example.co.uk').find(m => m.subject === '[Test] Winter tips for Test');
  assert.ok(testMail, 'test uses the first recipient’s details');
  assert.match(testMail.html, /<b>Gap night<\/b>/); assert.match(testMail.html, /<li/); assert.match(testMail.html, /Open your console/);
  assert.doesNotMatch(testMail.html, /\/t\/m\//, 'tests are not tracked');

  const p = await t.call('/admin/campaigns/' + id + '/preview');
  assert.match(p.body, /Fill your winter gaps/);
  r = await t.call('/admin/campaigns/' + id);
  const n = +r.body.match(/Type (\d+) to confirm/)[1]; assert.equal(n, 1);
  r = await form('/admin/campaigns/' + id + '/send', { confirm: '1' });
  assert.match(r.body, /Sent to 1/);
  const got = to('host@example.co.uk').filter(m => m.subject === 'Winter tips for Test');
  assert.equal(got.length, 1);
  const m = got[0];
  assert.ok(m.headers['List-Unsubscribe'].includes('/u/host/'), 'one-click unsubscribe for hosts');
  assert.match(m.html, /\/t\/m\/[a-z0-9-]+\/h[^/]+\/[^/]+\/o\.gif/, 'open pixel');
  const click = m.html.match(/href="([^"]*\/t\/m\/[^"]*\/c\?u=[^"]*)"/g).map(h => h.slice(6, -1));
  assert.ok(click.length >= 2, 'links go through tracking');
  assert.ok(m.html.includes('/u/host/'), 'unsubscribe link stays direct');

  // open, click (twice: counted once), and a tampered link that must not redirect elsewhere
  await fetch(t.base + local(m.html.match(/src="([^"]*o\.gif)"/)[1]));
  const c1 = await t.call(local(click[0]));
  assert.equal(c1.status, 302); assert.match(c1.headers.get('location'), /^https:\/\/booking-booster\.co\.uk\//);
  await t.call(local(click[0]));
  const evil = local(click[0]).replace(/u=[^&]+/, 'u=' + encodeURIComponent('https://evil.example/'));
  const c2 = await t.call(evil); assert.doesNotMatch(c2.headers.get('location'), /evil/);
  const bad = await t.call(local(click[0]).replace(/\/c\?/, 'x/c?'));
  assert.notEqual(bad.headers.get('location') || '', 'https://booking-booster.co.uk/guides/direct-booking-playbook.pdf');

  // the unsubscribe link from this campaign is credited to it, and the host gets no more news
  const unsub = local(m.headers['List-Unsubscribe'].slice(1, -1));
  await t.call(unsub, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
  r = await t.call('/admin/campaigns/' + id);
  assert.match(r.body, /<b>1<\/b><small>delivered/); assert.match(r.body, /<b>100%<\/b><small>1 opened/); assert.match(r.body, /<b>100%<\/b><small>1 clicked/); assert.match(r.body, /<b>1<\/b><small>unsubscribed/);
  assert.match(r.body, /Links clicked/);
  r = await form('/admin/campaigns/' + id + '/send', { confirm: '1' });
  assert.match(r.body, /already gone out/);
  const list = await t.call('/admin/campaigns');
  assert.match(list.body, /Winter host news/); assert.match(list.body, /100% <small class="cm-help">opened/);

  r = await form('/admin/campaigns/new', { name: 'Second host email', audience: 'hosts:all' });
  r = await t.call('/admin/campaigns/' + idFrom(r));
  assert.match(r.body, /<b>0<\/b> can get it now · left out: 1 turned off news and offers/);
  const acct = await t.call('/app/account');
  assert.doesNotMatch(acct.body, /name="news" checked/, 'the account page shows news switched off');
});

test('a scheduled campaign to one lead form goes out from the background job, and enquiries are never included', async () => {
  let r = await form('/admin/campaigns/new', { name: 'Demo follow-up', audience: 'leads:webinar' });
  const id = idFrom(r);
  await form('/admin/campaigns/' + id + '/test', { subject: 'Missed the demo, {{first_name}}?', body: 'Hi {{first_name}},\n\nThe replay is up: {{demo_url}}', audience: 'leads:webinar' });
  r = await t.call('/admin/campaigns/' + id);
  assert.match(r.body, /Type 1 to confirm/);
  const day = t.dateIn(2);
  r = await form('/admin/campaigns/' + id + '/schedule', { confirm: '1', day, time: '09:30' });
  assert.match(r.body, /Scheduled for/);
  await t.call('/admin/campaigns/run', { body: { at: Date.now() } });
  assert.equal(to('webby@example.co.uk').filter(m => /Missed the demo/.test(m.subject)).length, 0, 'not before its time');
  await t.call('/admin/campaigns/run', { body: { at: Date.now() + 3 * 864e5 } });
  const got = to('webby@example.co.uk').filter(m => /Missed the demo/.test(m.subject));
  assert.equal(got.length, 1); assert.equal(got[0].subject, 'Missed the demo, Webby?');
  assert.equal(to('feeby@example.co.uk').filter(m => /Missed the demo/.test(m.subject)).length, 0, 'other forms are left out');
  r = await t.call('/admin/campaigns/' + id); assert.match(r.body, /cm-badge sent/);

  r = await form('/admin/campaigns/new', { name: 'Everyone', audience: 'everyone' });
  r = await t.call('/admin/campaigns/' + idFrom(r));
  assert.match(r.body, /<b>2<\/b> can get it now/, 'the two leads who asked for emails; the enquiry and the unsubscribed host are not counted');
});

test('drafts can be copied, cancelled and deleted; designed campaigns stay', async () => {
  let r = await form('/admin/campaigns/digest/duplicate', {});
  const id = idFrom(r);
  r = await t.call('/admin/campaigns/' + id); assert.match(r.body, /Direct Booking Digest \(copy\)/);
  r = await form('/admin/campaigns/' + id + '/delete', {}); assert.equal(r.status, 302);
  r = await t.call('/admin/campaigns/' + id); assert.equal(r.status, 404);
  r = await form('/admin/campaigns/digest/delete', {}); assert.match(r.body, /designed campaigns stay/);
  const anon = await fetch(t.base + '/admin/campaigns/digest'); assert.equal(anon.status, 404);
});
