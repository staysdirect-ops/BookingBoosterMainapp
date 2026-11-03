// Assembles web/src into the bundles the server sends: one for the real app and one for the clickable demo.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = path.join(__dirname, 'src');
const rd = f => fs.existsSync(path.join(S, f)) ? fs.readFileSync(path.join(S, f), 'utf8') : '';
const MODS = ['site', 'app', 'app-grow', 'mobile', 'property', 'guest'];
function build() {
  const css = [rd('core.css'), rd('shell.css'), rd('shell-prod.css')].concat(MODS.map(m => rd(m + '.css')), [rd('site-calm.css')]).join('\n');
  const core = [rd('store.js'), rd('store-ext.js'), rd('ui.js')].concat(MODS.map(m => rd(m + '.js')));
  const prodJs = core.concat([rd('sync.js'), rd('shell-prod.js')]).join('\n;\n');
  const demoJs = core.concat([rd('sync.js'), rd('shell.js')]).join('\n;\n');
  const h = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
  return { css, prodJs, demoJs, hash: { css: h(css), prod: h(prodJs), demo: h(demoJs) } };
}
module.exports = build;
if (require.main === module) { const b = build(); console.log('css', b.css.length, 'prod', b.prodJs.length, 'demo', b.demoJs.length); }
