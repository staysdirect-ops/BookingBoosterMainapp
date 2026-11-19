// The search writer against a stand-in Messages API: facts in, drafts back, and AI credit metered.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

let mock, t, lastBody, reply = '';
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { lastBody = JSON.parse(raw); s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ content: [{ type: 'text', text: reply }], model: 'claude-test', usage: { input_tokens: 400, output_tokens: 90 } })); }); }).listen(0);
  t = await start({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_API_BASE: 'http://localhost:' + mock.address().port });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('writes a summary, a title and FAQ answers from the home facts only', async () => {
  const { p } = await t.home();
  await t.act('updateProperty', p.id, { parking: 'One space on the quay', amenities: ['Harbour view', 'Fast Wi-Fi'] });
  reply = 'Gull Cottage is a 2-bedroom cottage in Whitby that sleeps 4, from £140 a night.';
  let r = await t.call('/api/seo/write', { body: { propertyId: p.id, what: 'summary' } });
  assert.equal(r.status, 200); assert.equal(r.body.by, 'claude'); assert.match(r.body.draft, /Gull Cottage/);
  const prompt = JSON.stringify(lastBody); assert.match(prompt, /One space on the quay/); assert.match(prompt, /Never invent/);

  reply = 'Title: Harbour view cottage in Whitby\nDescription: A 2-bedroom harbour view cottage in Whitby that sleeps 4. Book direct from £140 a night and skip the platform fees.';
  r = await t.call('/api/seo/write', { body: { propertyId: p.id, what: 'meta' } });
  assert.equal(r.body.draft.title, 'Harbour view cottage in Whitby'); assert.match(r.body.draft.description, /book direct/i);

  reply = 'Q: Is there parking?\nA: Yes, one space on the quay.\nQ: What is the nearest pub?\nA: ASK HOST';
  r = await t.call('/api/seo/write', { body: { propertyId: p.id, what: 'faqs', questions: ['Is there parking?', 'What is the nearest pub?'] } });
  assert.deepEqual(r.body.draft, [{ q: 'Is there parking?', a: 'Yes, one space on the quay.', needs: false }, { q: 'What is the nearest pub?', a: '', needs: true }]);

  const c = await t.call('/api/credits'); assert.equal(c.status, 200);
  assert.ok((c.body.recent || []).some(x => x.feature === 'seo'), 'the drafts are metered as AI credit: ' + JSON.stringify(c.body.recent).slice(0, 300));
});
