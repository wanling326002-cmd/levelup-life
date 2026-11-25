// Checks every language file against keys.txt: same line count, section markers on the same lines,
// the same number of # and {s} placeholders (unless {0}-style indexes are used), and no characters
// that would break the generated files.
const fs = require('fs'), dir = __dirname;
const keys = fs.readFileSync(dir + '/keys.txt', 'utf8').replace(/\n$/, '').split('\n');
const toks = s => (s.match(/#|\{s\}/g) || []).length;
let bad = 0;
for (const l of process.argv.slice(2)) {
  const t = fs.readFileSync(`${dir}/${l}.txt`, 'utf8').replace(/\n$/, '').split('\n'), errs = [];
  if (t.length !== keys.length) errs.push(`line count ${t.length} vs ${keys.length}`);
  for (let i = 0; i < Math.min(t.length, keys.length); i++) {
    const k = keys[i], v = t[i];
    if (k.startsWith('##') || v.startsWith('##')) { if (k !== v) { errs.push(`${i + 1}: section "${k}" vs "${v}"`); break; } continue; }
    if (!v.trim()) errs.push(`${i + 1}: empty`);
    if (/[`\\|]|\$\{/.test(v)) errs.push(`${i + 1}: forbidden character in "${v}"`);
    const idx = v.match(/\{(\d+)\}/g);
    if (idx) { const n = toks(k); if (idx.some(x => +x.slice(1, -1) >= n)) errs.push(`${i + 1}: index out of range "${v}"`); }
    else if (toks(k) !== toks(v)) errs.push(`${i + 1}: placeholders ${toks(k)} vs ${toks(v)}: "${k}" => "${v}"`);
  }
  console.log(l, errs.length ? 'ERRORS' : 'ok', errs.slice(0, 15).join('\n  '));
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
