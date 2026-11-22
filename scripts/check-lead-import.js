// Checks a lead CSV against the bulk import rules on a throwaway in-memory database, without touching any real data.
//   node scripts/check-lead-import.js --source scraped list.csv [--rejects rejects.csv]
// Prints how many rows would load and why the others would be rejected. The real import is on /admin/leads.
'use strict';
const fs = require('node:fs');
const { open } = require('../server/db');
const leadImport = require('../server/lead-import');

(async () => {
  const a = process.argv.slice(2), opt = n => { const i = a.indexOf('--' + n); return i >= 0 ? a.splice(i, 2)[1] : ''; };
  const source = opt('source'), rejectsOut = opt('rejects'), file = a[0];
  if (!file || !source) { console.error('Usage: node scripts/check-lead-import.js --source ' + leadImport.SOURCES.join('|') + ' list.csv [--rejects rejects.csv]'); process.exit(2); }
  const db = open({}); await db.ready; // PGlite in memory: nothing is saved anywhere
  const r = await leadImport({ db }).importCsv(fs.readFileSync(file, 'utf8'), { source });
  if (r.error) { console.error(r.error); process.exit(1); }
  console.log(JSON.stringify(Object.assign({}, r, { rejects: undefined, batch: undefined, dryRun: undefined }), null, 2));
  if (rejectsOut) fs.writeFileSync(rejectsOut, 'row,reason,detail\n' + r.rejects.map(x => [x.row, leadImport.REASONS[x.reason], x.detail].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n') + '\n');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
