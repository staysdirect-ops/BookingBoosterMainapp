// Builds supabase/functions/bb/app.mjs: the Node server bundled for Deno, with the files it reads embedded.
//   node supabase/build.js
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require(process.env.ESBUILD || 'esbuild');
const ROOT = path.join(__dirname, '..');
const EMBED = ['web/src', 'web/icons', 'web/embed', 'web/sw.js', 'server/emails'];
const TEXT = /\.(js|css|html|json|txt|svg|webmanifest)$/;

function walk(rel, out) {
  const f = path.join(ROOT, rel);
  if (fs.statSync(f).isDirectory()) { for (const n of fs.readdirSync(f)) walk(rel + '/' + n, out); return out; }
  out['/app/' + rel] = TEXT.test(rel) ? { t: fs.readFileSync(f, 'utf8') } : { b: fs.readFileSync(f).toString('base64') };
  return out;
}
const files = {}; EMBED.forEach(r => walk(r, files));

const plugin = {
  name: 'bb',
  setup(b) {
    b.onResolve({ filter: /^(node:)?fs$/ }, a => a.importer.endsWith(path.join('supabase', 'vfs.js')) ? { path: 'node:fs', external: true } : { path: path.join(__dirname, 'vfs.js') });
    b.onResolve({ filter: /^bb-embedded-files$/ }, () => ({ path: 'bb-embedded-files', namespace: 'bb' }));
    b.onLoad({ filter: /.*/, namespace: 'bb' }, () => ({ contents: 'module.exports = ' + JSON.stringify(files) + ';', loader: 'js' }));
    b.onResolve({ filter: /^(postgres|@electric-sql\/pglite)$/ }, a => ({ path: a.path, external: true }));
    // Each file sees its own folder as /app/..., matching the embedded paths.
    b.onLoad({ filter: /\.js$/ }, a => {
      const rel = path.relative(ROOT, a.path).split(path.sep).join('/');
      const dir = '/app/' + path.posix.dirname(rel);
      return { contents: 'var __dirname = ' + JSON.stringify(dir) + ', __filename = ' + JSON.stringify('/app/' + rel) + ';\n' + fs.readFileSync(a.path, 'utf8'), loader: 'js' };
    });
  },
};

esbuild.build({
  entryPoints: [path.join(__dirname, 'entry.cjs')], bundle: true, platform: 'node', format: 'esm', target: 'es2022',
  outfile: path.join(__dirname, 'functions', 'bb', 'app.mjs'), plugins: [plugin], logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { Buffer as __B } from 'node:buffer'; import __p from 'node:process';\nglobalThis.Buffer ??= __B; globalThis.process ??= __p; const require = __cr(import.meta.url);" },
}).then(() => {
  const f = path.join(__dirname, 'functions', 'bb', 'app.mjs');
  console.log('built', path.relative(ROOT, f), Math.round(fs.statSync(f).size / 1024) + ' KB,', Object.keys(files).length, 'files embedded');
});
