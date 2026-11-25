// The real Windows process reader. Runs on Windows only (for example the GitHub Actions Windows runner).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {createWin32Source, createTasklistSource, createProcessSource, readReg} = require('../../companion/processes');
const win = process.platform === 'win32';

test('on other systems the process list is empty instead of failing', {skip: win}, async () => {
  assert.deepEqual(await createProcessSource().list(), []);
});

test('lists running programs with names and full paths, including this one', {skip: !win}, async () => {
  const src = createWin32Source();
  const list = await src.list();
  assert.ok(list.length > 10, 'a normal Windows system runs many processes');
  const me = list.find(p => p.pid === process.pid);
  assert.ok(me, 'finds its own process');
  assert.equal(me.name.toLowerCase(), require('path').basename(process.execPath).toLowerCase());
  assert.equal(me.path.toLowerCase(), process.execPath.toLowerCase());
  const again = await src.list();                     // the second call uses the path cache
  assert.equal(again.find(p => p.pid === process.pid).path.toLowerCase(), process.execPath.toLowerCase());
});

test('the names-only backup lists this process too', {skip: !win}, async () => {
  const list = await createTasklistSource().list();
  assert.ok(list.some(p => p.pid === process.pid));
});

test('the registry can be read', {skip: !win}, async () => {
  const out = await readReg('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion');
  assert.match(out, /ProductName/);
});
