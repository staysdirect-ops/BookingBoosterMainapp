// Bundle entry: loading is delayed until the Deno side has handed over postgres.js.
'use strict';
module.exports = function load(opts) {
  const app = require('../server/index.js');
  const proxyKey = opts.proxyKey || (async () => { await app.db.ready; const r = await app.db.prepare('SELECT v FROM kv WHERE k = ?').get('config:proxy_key'); return r ? r.v : ''; });
  return require('./adapter.js')(app, Object.assign({}, opts, { proxyKey }));
};
module.exports.tickOf = () => require('../server/index.js').tick;
