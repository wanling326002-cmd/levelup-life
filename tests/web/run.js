// Runs the browser suites one after another and fails if any check fails, any page throws, or a suite crashes.
// Usage: node tests/web/run.js [suite names...]   e.g.  node tests/web/run.js suite17 suite20
// A suite that fails is run once more: a few checks depend on timing on slow machines. Both runs are reported.
const {spawnSync} = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');

const dir = __dirname;
const all = fs.readdirSync(dir).filter(f => /^(suite\d+|axe)\.js$/.test(f)).sort().map(f => f.replace(/\.js$/, ''));
const pick = process.argv.slice(2);
const suites = pick.length ? all.filter(s => pick.includes(s)) : all;
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-web-'));

function runOnce(name) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, name + '.js')], {encoding: 'utf8', env: {...process.env, LEVELUP_TEST_DIR: runDir}, timeout: 10 * 60 * 1000});
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = (out.match(/^PASS/gm) || []).length, fail = (out.match(/^FAIL.*$/gm) || []);
  const jsErr = /JS errors:\s*(?!none)\S/.test(out), axeBad = /axe found ([1-9]\d*) kinds/.test(out), crash = /^CRASH:|Error:|TypeError|ReferenceError/m.test(out) && r.status !== 0;
  const ok = r.status === 0 && fail.length === 0 && !jsErr && !axeBad && !crash && !/ISSUES FOUND: [1-9]/.test(out);
  return {ok, pass, fail, out, secs: Math.round((Date.now() - t0) / 1000), status: r.status};
}

let bad = 0;
for (const s of suites) {
  let r = runOnce(s), note = '';
  if (!r.ok) { const first = r; r = runOnce(s); note = r.ok ? ` (passed on retry; first run: ${first.fail.length} failed${first.status ? ', exit ' + first.status : ''})` : ''; if (!r.ok) r.first = first; }
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${s.padEnd(8)} ${String(r.pass).padStart(3)} checks  ${r.secs}s${note}`);
  if (!r.ok) { bad++; console.log(r.out.split('\n').filter(l => /^FAIL|JS errors|CRASH|Error|axe found|ISSUES/.test(l)).slice(0, 15).map(l => '       ' + l).join('\n')); }
}
fs.rmSync(runDir, {recursive: true, force: true});
console.log(bad ? `\n${bad} of ${suites.length} suites failed` : `\nAll ${suites.length} suites passed`);
process.exit(bad ? 1 : 0);
