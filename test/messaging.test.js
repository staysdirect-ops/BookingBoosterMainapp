// Email through a stand-in Resend API: welcome email, guest emails, a campaign, and one-click unsubscribe.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

const mails = [];
let mock, t;
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"em_1"}'); }); }).listen(0);
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('the host gets a welcome email on sign-up', async () => {
  const m = await t.until(async () => mails.find(x => [].concat(x.to).includes('host@example.co.uk')));
  assert.ok(m, 'welcome email sent'); assert.ok(m.html && m.html.length > 500, 'uses the designed template');
  assert.doesNotMatch(m.html, /\{\{\s*\w+\s*\}\}/, 'no unfilled merge tags');
});

test('a booking request emails the guest', async () => {
  const { p, slug } = await t.home();
  const r = await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(50), checkOut: t.dateIn(53), adults: 2, name: 'Sam Guest', email: 'sam@example.co.uk' } }) });
  assert.equal(r.status, 200);
  const m = await t.until(async () => mails.find(x => [].concat(x.to).includes('sam@example.co.uk')));
  assert.ok(m, 'guest emailed');
});

test('a campaign reaches past guests and they can unsubscribe in one click', async () => {
  const { p } = await t.home();
  const imp = await t.act('importGuests', [{ name: 'Kim Past', email: 'kim@example.co.uk', lastStay: t.dateIn(-40) }, { name: 'No Email', email: 'nope' }, { name: 'Lee Quiet', email: 'lee@example.co.uk', lastStay: t.dateIn(-90) }], { consent: true });
  assert.deepEqual(imp.body.result, { added: 2, updated: 0, skipped: 1 });
  const st = (await t.call('/api/state')).body.state; const g = st.guests.find(x => x.email === 'kim@example.co.uk'); assert.ok(g && g.subscribed, 'imported with consent');
  const lee = st.guests.find(x => x.email === 'lee@example.co.uk'); await t.act('unsubscribe', lee.id);
  const again = await t.act('importGuests', [{ name: 'Lee Quiet', email: 'lee@example.co.uk' }], { consent: true });
  assert.equal(again.body.state.guests.find(x => x.email === 'lee@example.co.uk').subscribed, false, 'a re-import never resubscribes someone who opted out');
  const saved = await t.act('saveCampaign', { name: 'Winter', subject: 'Winter breaks at Gull Cottage', segment: 'past', body: { heading: 'Come back this winter', text: 'We have a few winter weekends left.', cta: 'See dates', propertyId: p.id } });
  const id = saved.body.result; assert.ok(id);
  await t.act('sendCampaign', id, {});
  const m = await t.until(async () => mails.find(x => x.subject === 'Winter breaks at Gull Cottage' && [].concat(x.to).includes('kim@example.co.uk')));
  assert.ok(m, 'campaign email delivered');
  assert.ok(!mails.some(x => x.subject === 'Winter breaks at Gull Cottage' && [].concat(x.to).includes('lee@example.co.uk')), 'unsubscribed guests are left out');
  assert.ok(m.headers && m.headers['List-Unsubscribe'], 'has a List-Unsubscribe header');
  const click = (m.html.match(/href="(http[^"]+\/c\/[^"]+)"/) || [])[1]; assert.ok(click, 'button link is tracked');
  const go = await fetch(click.replace(/&amp;/g, '&').replace(/^https?:\/\/[^/]+/, t.base), { redirect: 'manual' }); assert.equal(go.status, 302); assert.match(go.headers.get('location'), /utm_campaign=/);
  const pix = (m.html.match(/src="(http[^"]+\/o\/[^"]+\.gif)"/) || [])[1]; assert.ok(pix, 'has an open pixel');
  await fetch(pix.replace(/^https?:\/\/[^/]+/, t.base));
  const camp = await t.until(async () => { const c = (await t.call('/api/state')).body.state.campaigns.find(x => x.id === id); return c && c.clicks === 1 ? c : null; });
  assert.ok(camp, 'click counted'); assert.equal(camp.opens, 1, 'one open per guest');
  const url = (m.headers['List-Unsubscribe'].match(/<(http[^>]+)>/) || [])[1]; assert.ok(url);
  const u = await fetch(url.replace(/^https?:\/\/[^/]+/, t.base), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  assert.equal(u.status, 200);
  const g2 = (await t.call('/api/state')).body.state.guests.find(x => x.email === 'kim@example.co.uk'); assert.equal(g2.subscribed, false);
  const forged = await fetch(url.replace(/^https?:\/\/[^/]+/, t.base).replace(/[^/]+$/, 'forged'), { method: 'POST' }); assert.notEqual(forged.status, 200);
});
