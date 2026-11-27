// The weekly AI visibility check asks Claude with web search too, and reads the sites it cites.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

test('Claude answers are checked for the home by name and by link', async () => {
  let seen;
  const mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    seen = { url: q.url, key: q.headers['x-api-key'], body: JSON.parse(raw) };
    s.writeHead(200, { 'content-type': 'application/json' });
    s.end(JSON.stringify({ stop_reason: 'end_turn', content: [
      { type: 'server_tool_use', id: 't1', name: 'web_search', input: { query: 'x' } },
      { type: 'web_search_tool_result', tool_use_id: 't1', content: [{ type: 'web_search_result', url: 'https://www.airbnb.co.uk/rooms/1', title: 'Airbnb' }, { type: 'web_search_result', url: 'https://gullcottage.co.uk/', title: 'Gull Cottage' }] },
      { type: 'text', text: 'Try Gull Cottage in Whitby.', citations: [{ type: 'web_search_result_location', url: 'https://gullcottage.co.uk/', title: 'Gull Cottage' }] },
    ] }));
  }); }).listen(0);
  try {
    const ai = require('../server/ai')({ ai: { anthropic: 'k', anthropicBase: 'http://localhost:' + mock.address().port, anthropicModel: 'claude-sonnet-5-5' } });
    assert.deepEqual(ai.available(), ['claude']);
    const { results } = await ai.check([{ q: 'cottage in whitby', propertyId: 'g' }], [{ id: 'g', name: 'Gull Cottage', domain: 'gullcottage.co.uk' }]);
    assert.equal(seen.url, '/v1/messages'); assert.equal(seen.key, 'k');
    assert.equal(seen.body.tools[0].type, 'web_search_20260209');
    assert.equal(results[0].engines.claude, true);
    assert.equal(results[0].cited.claude, true);
    assert.deepEqual(results[0].sources.claude, ['gullcottage.co.uk', 'airbnb.co.uk']);
  } finally { mock.close(); }
});
