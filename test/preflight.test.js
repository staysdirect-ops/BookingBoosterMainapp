// The launch check: a bare setup lists what is missing, a full live setup says ready.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const run = env => new Promise(res => execFile(process.execPath, [path.join(__dirname, '..', 'server', 'preflight.js')], { env: Object.assign({ PATH: process.env.PATH, DATA_DIR: path.join(os.tmpdir(), 'bb-pre') }, env) }, (e, out) => res({ code: e ? e.code : 0, out })));

test('lists missing launch settings', async () => {
  const r = await run({}); assert.equal(r.code, 1); assert.match(r.out, /NEED Stripe/); assert.match(r.out, /NEED Legal review/);
});
test('says ready when every required setting is there', async () => {
  const r = await run({ BASE_URL: 'https://booking-booster.co.uk', APP_SECRET: 'a'.repeat(64), ADMIN_EMAILS: 'team@booking-booster.co.uk', COMPANY_ADDRESS: '1 High Street, York, YO1 1AA', COMPANY_NUMBER: '12345678',
    RESEND_API_KEY: 're_x', STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_a', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_b',
    STRIPE_PRICE_GROWTH: 'p2', STRIPE_PRICE_SETUP: 'p3', STRIPE_PRICE_CALENDAR_SYNC: 'p4',
    STRIPE_PRICE_GROWTH_ANNUAL: 'p6', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'p8', LEGAL_REVIEWED: '2026-11-01' });
  assert.equal(r.code, 0, r.out); assert.match(r.out, /Ready for launch/);
});
