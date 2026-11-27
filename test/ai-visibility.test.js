// What ChatGPT search, Copilot and other AI crawlers see on our own marketing site.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');
const seo = require('../server/seo');
const mkt = require('../server/marketing');

test('AI crawlers are welcome but kept out of private paths', () => {
  const groups = seo.robots('https://x.example/sitemap.xml').split('\n\n').join('\n').split(/(?=User-agent: )/);
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'Bingbot']) {
    const g = groups.find(x => x.startsWith('User-agent: ' + bot + '\n'));
    assert.ok(g, bot + ' has its own group');
    assert.match(g, /Allow: \//); assert.match(g, /Disallow: \/app/); assert.match(g, /Disallow: \/trip\//); assert.match(g, /Disallow: \/api\//);
  }
});

test('extra profiles join the company sameAs', () => {
  const org = mkt.jsonLd('https://x.example', { support: 'help@x.example', profiles: ['https://uk.trustpilot.com/review/x.example'] })['@graph'][0];
  assert.ok(org.sameAs.includes('https://uk.trustpilot.com/review/x.example'));
  assert.ok(org.sameAs.some(u => /instagram/.test(u)));
});

test('Bing verification tag and profile links on the home page', async () => {
  const s = await start({ BING_SITE_VERIFICATION: 'ABC123"><script>', PROFILE_LINKS: 'https://www.linkedin.com/company/bookingbooster, javascript:alert(1)' });
  try {
    const home = await s.call('/');
    assert.match(home.body, /<meta name="msvalidate\.01" content="ABC123script">/);
    assert.match(home.body, /linkedin\.com\/company\/bookingbooster/);
    assert.doesNotMatch(home.body, /javascript:alert/);
  } finally { s.stop(); }
});
