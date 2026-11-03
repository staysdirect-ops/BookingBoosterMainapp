// The marketing site's explainer video and demo screenshot: served whole, and in byte ranges for video players.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const start = require('./harness');

let t;
test.before(async () => { t = await start(); });
test.after(() => t && t.stop());

test('serves the explainer video whole and in byte ranges', async () => {
  const size = fs.statSync(path.join(__dirname, '..', 'web', 'media', 'explainer.mp4')).size;
  const whole = await fetch(t.base + '/media/explainer.mp4');
  assert.equal(whole.status, 200); assert.equal(whole.headers.get('content-type'), 'video/mp4');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes'); assert.equal((await whole.arrayBuffer()).byteLength, size);
  const part = await fetch(t.base + '/media/explainer.mp4', { headers: { range: 'bytes=0-99' } });
  assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), 'bytes 0-99/' + size);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  const tail = await fetch(t.base + '/media/explainer.mp4', { headers: { range: 'bytes=-10' } });
  assert.equal(tail.status, 206); assert.equal((await tail.arrayBuffer()).byteLength, 10);
  const past = await fetch(t.base + '/media/explainer.mp4', { headers: { range: 'bytes=' + size + '-' } });
  assert.equal(past.status, 416);
});

test('serves the demo screenshot and refuses other names', async () => {
  const img = await fetch(t.base + '/media/demo-site.jpg');
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(t.base + '/media/missing.mp4')).status, 404);
  assert.equal((await fetch(t.base + '/media/..%2Fserver%2Fconfig.js')).status, 404);
});
