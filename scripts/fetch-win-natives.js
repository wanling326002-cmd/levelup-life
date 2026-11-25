// When the Windows app is built on Linux or macOS, npm only installs native parts for the build machine.
// This downloads the Windows x64 part of koffi (the process-list helper) so the installer includes it.
// On Windows it does nothing: npm already installed the right one.
'use strict';
const {execFileSync} = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');

if (process.platform === 'win32') process.exit(0);
const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'node_modules', 'koffi', 'package.json')).version;
const name = '@koromix/koffi-win32-x64', dest = path.join(root, 'node_modules', '@koromix', 'koffi-win32-x64');
try { if (require(path.join(dest, 'package.json')).version === version) { console.log(`${name}@${version} already present`); process.exit(0); } } catch {}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'koffi-win-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const file = execFileSync(npm, ['pack', `${name}@${version}`, '--silent'], {cwd: tmp, encoding: 'utf8'}).trim().split('\n').pop();
fs.rmSync(dest, {recursive: true, force: true}); fs.mkdirSync(dest, {recursive: true});
execFileSync('tar', ['-xzf', path.join(tmp, file), '-C', dest, '--strip-components=1']);
fs.rmSync(tmp, {recursive: true, force: true});
console.log(`installed ${name}@${version} for the Windows build`);
