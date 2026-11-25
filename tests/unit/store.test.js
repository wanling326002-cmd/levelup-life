// The on-disk store (companion/store.js): survives restarts, broken files and keeps history writes rare.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const {JsonFileStore} = require('../../companion/store');
const {Tracker} = require('../../companion/tracker');
const {FakeClock, FakeProcesses, newId, at, SEC, MIN} = require('./helpers');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-store-'));

test('a tracker restarted from disk keeps its games, history and queue', async () => {
  const dir = tmp(), clock = new FakeClock(at('2026-11-25T18:00')), source = new FakeProcesses();
  const a = new Tracker({clock, source, store: new JsonFileStore(dir), newId, systemTz: 'Africa/Johannesburg'});
  a.upsertGame({id: 'g1', name: 'Game One', exes: ['game1.exe'], limitMin: 45});
  source.start('game1.exe'); await a.tick();
  for (let i = 0; i < 120; i++) { clock.advance(5 * SEC); await a.tick(); }
  const b = new Tracker({clock, source: new FakeProcesses(), store: new JsonFileStore(dir), newId, systemTz: 'Africa/Johannesburg'});
  assert.equal(b.games[0].limitMin, 45);
  assert.equal(b.snapshot().todayMs, 10 * MIN);
  assert.equal(Object.keys(b.state.outbox).length, 1);
});

test('history is only rewritten when it changes; the live checkpoint every time', async () => {
  const dir = tmp(), store = new JsonFileStore(dir);
  const writes = {main: 0, live: 0}, orig = JsonFileStore.write;
  JsonFileStore.write = (f, t) => { writes[f.endsWith('-live.json') ? 'live' : 'main']++; orig(f, t); };
  try {
    const clock = new FakeClock(at('2026-11-25T18:00')), source = new FakeProcesses();
    const t = new Tracker({clock, source, store, newId, systemTz: 'UTC'});
    t.upsertGame({id: 'g1', name: 'G', exes: ['g.exe']});
    source.start('g.exe');
    const before = writes.main;
    for (let i = 0; i < 50; i++) { clock.advance(5 * SEC); await t.tick(); }
    assert.ok(writes.live >= 50);
    assert.ok(writes.main - before <= 2, `history written ${writes.main - before} times while only the open session changed`);
  } finally { JsonFileStore.write = orig; }
});

test('a damaged history file falls back to the previous copy', () => {
  const dir = tmp(), store = new JsonFileStore(dir);
  store.save({games: [{id: 'a'}], sessions: [], open: {}, lastTick: 1});
  store.save({games: [{id: 'a'}, {id: 'b'}], sessions: [], open: {}, lastTick: 2});
  fs.writeFileSync(path.join(dir, 'companion.json'), '{"games": [');   // cut off mid-write by a power cut
  const s = new JsonFileStore(dir).load();
  assert.deepEqual(s.games.map(g => g.id), ['a']);
  assert.equal(s.lastTick, 2);
});

test('an empty folder loads as a fresh start', () => {
  assert.equal(new JsonFileStore(tmp()).load(), null);
});
