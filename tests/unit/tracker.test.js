// Session timing, sleep/resume, crash recovery, midnight resets, overlapping games and warnings (companion/tracker.js).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {Tracker} = require('../../companion/tracker');
const {setup, at, MIN, SEC, MemoryStore, FakeClock, FakeProcesses, newId} = require('./helpers');

const T0 = at('2026-11-25T18:00');
const today = (tr, game) => { const s = tr.snapshot(); return game ? s.games.find(g => g.id === game).todayMs : s.todayMs; };

test('a session starts when the game starts and stops when it closes', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  await tracker.tick();                                    // nothing running
  source.start('game1.exe', 'C:\\Games\\One\\game1.exe');
  await tracker.tick();                                    // seen at 18:00
  assert.equal(tracker.snapshot().playing.length, 1);
  await run(30 * MIN);                                     // played for 30 minutes
  assert.equal(tracker.snapshot().playing[0].sessionMs, 30 * MIN);
  source.stop('game1.exe');
  await run(5 * SEC);                                      // noticed at the next look
  assert.equal(tracker.snapshot().playing.length, 0);
  assert.equal(today(tracker), 30 * MIN);                  // the 5 seconds after it closed are not counted
  assert.equal(tracker.state.sessions.length, 1);
  await run(20 * MIN);
  assert.equal(today(tracker), 30 * MIN);                  // nothing added while it's closed
  assert.ok(clock.now() > T0);
});

test('several executables of one game make one session; launchers and anti-cheat never count', async () => {
  const {source, tracker, run} = setup({start: T0, games: [{id: 'fn', name: 'Fortnite', exes: ['FortniteClient-Win64-Shipping.exe', 'FortniteClient-Win64-Shipping_EAC.exe'], dirs: ['C:\\Program Files\\Epic Games\\Fortnite']}]});
  source.start('EpicGamesLauncher.exe', 'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe');
  source.start('EasyAntiCheat_EOS.exe', 'C:\\Program Files (x86)\\EasyAntiCheat_EOS\\EasyAntiCheat_EOS.exe');
  source.start('FortniteLauncher.exe', 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe');
  await run(10 * MIN);
  assert.equal(today(tracker), 0, 'launcher, anti-cheat and the game\'s own launcher are not play');
  source.start('FortniteClient-Win64-Shipping.exe', 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe');
  source.start('FortniteClient-Win64-Shipping_EAC.exe', 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping_EAC.exe');
  await tracker.tick();
  await run(20 * MIN);
  assert.equal(tracker.snapshot().playing.length, 1);
  assert.equal(today(tracker, 'fn'), 20 * MIN);
});

test('a game found by its install folder counts any of its programs, except helpers', async () => {
  const {source, tracker, run} = setup({start: T0, games: [{id: 'st-1', name: 'Some Steam Game', dirs: ['D:\\SteamLibrary\\steamapps\\common\\Some Game']}]});
  source.start('UnityCrashHandler64.exe', 'D:\\SteamLibrary\\steamapps\\common\\Some Game\\UnityCrashHandler64.exe');
  await run(MIN);
  assert.equal(today(tracker), 0);
  source.start('SomeGame.exe', 'd:/steamlibrary/steamapps/common/some game/SomeGame.exe'); // case and slashes don't matter
  await tracker.tick(); await run(5 * MIN);
  assert.equal(today(tracker), 5 * MIN);
});

test('time while the computer sleeps is not counted, and play after waking is', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  source.start('game1.exe'); await tracker.tick();
  await run(20 * MIN);
  clock.advance(2 * 60 * MIN);                             // asleep for 2 hours: no ticks at all
  await tracker.tick();                                    // wakes up, game still open
  await run(10 * MIN);
  assert.equal(today(tracker), 30 * MIN);
  assert.equal(tracker.state.sessions.length, 1, 'the session before sleep was closed at the last time it was seen');
});

test('Windows sleep and resume events end and restart sessions cleanly', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  source.start('game1.exe'); await tracker.tick();
  await run(15 * MIN);
  tracker.suspend();
  clock.advance(10 * SEC);                                 // a short sleep, shorter than the gap check
  tracker.resume();
  await tracker.tick(); await run(5 * MIN);
  assert.equal(today(tracker), 20 * MIN);
});

test('after a crash or restart, nothing is added for the time the app was closed', async () => {
  const store = new MemoryStore();
  const a = setup({start: T0, store});
  a.source.start('game1.exe'); await a.tracker.tick();
  await a.run(25 * MIN);                                   // then the app crashes (no clean shutdown)
  const clock = new FakeClock(a.clock.now() + 3 * 60 * MIN), source = new FakeProcesses();
  source.start('game1.exe');                               // the game is still running when the app comes back
  const b = new Tracker({clock, source, store, newId, systemTz: 'Africa/Johannesburg'});
  assert.equal(b.snapshot().todayMs, 25 * MIN, 'the open session was closed at its last checkpoint');
  await b.tick();
  for (let i = 0; i < 60; i++) { clock.advance(5 * SEC); await b.tick(); }
  assert.equal(b.snapshot().todayMs, 30 * MIN);            // 25 before + 5 after, none of the 3 hours in between
  assert.equal(b.state.sessions.length, 1);
  assert.ok(Object.keys(b.state.outbox).length >= 1, 'the recovered session is queued for upload');
});

test('the clock jumping backwards does not create or remove time', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  source.start('game1.exe'); await tracker.tick();
  await run(10 * MIN);
  clock.advance(-60 * MIN);                                // someone sets the clock back an hour
  await tracker.tick(); await run(10 * MIN);
  const s = tracker.segments().filter(x => x.end > x.start);
  assert.equal(s.reduce((a, x) => a + x.end - x.start, 0), 20 * MIN);
});

test('if the process list cannot be read, no time is added', async () => {
  const {source, tracker, run} = setup({start: T0});
  source.start('game1.exe'); await tracker.tick(); await run(10 * MIN);
  source.fail = true; await run(2 * MIN);                  // short failure: session stays open but doesn't grow
  assert.equal(today(tracker), 10 * MIN);
  source.fail = false; await run(5 * MIN);
  // a new session starts at the first good look (5 s into the 5 minutes); the 2 failed minutes are not counted
  assert.equal(today(tracker), 15 * MIN - 5 * SEC);
});

test('pausing stops counting and resuming starts again', async () => {
  const {source, tracker, run} = setup({start: T0});
  source.start('game1.exe'); await tracker.tick(); await run(10 * MIN);
  tracker.setPaused(true); await run(30 * MIN);
  assert.equal(tracker.snapshot().paused, true);
  assert.equal(today(tracker), 10 * MIN);
  tracker.setPaused(false); await tracker.tick(); await run(5 * MIN);
  assert.equal(today(tracker), 15 * MIN);
});

test('midnight: totals reset and a session crossing midnight is split between days', async () => {
  const {source, tracker, run} = setup({start: at('2026-11-25T23:40')});
  source.start('game1.exe'); await tracker.tick();
  await run(50 * MIN);                                     // 23:40 -> 00:30
  const snap = tracker.snapshot();
  assert.equal(snap.day, '2026-11-26');
  assert.equal(snap.todayMs, 30 * MIN, 'today only has the part after midnight');
  const y = snap.week.find(d => d.day === '2026-11-25');
  assert.equal(y.overallMs, 20 * MIN, 'yesterday keeps the part before midnight');
  const segs = tracker.segments();
  assert.deepEqual(segs.map(s => s.day), ['2026-11-25', '2026-11-26']);
  assert.equal(new Set(segs.map(s => s.id)).size, 2, 'each day piece has its own id');
});

test('midnight follows the chosen timezone', async () => {
  const {source, tracker, run} = setup({start: at('2026-11-25T23:40', 'Europe/London'), tz: 'Europe/London'});
  tracker.setSettings({tz: 'Africa/Johannesburg'}); // 23:40 London = 01:40 Johannesburg, already the next day there
  source.start('game1.exe'); await tracker.tick(); await run(30 * MIN);
  assert.equal(tracker.snapshot().day, '2026-11-26');
  assert.equal(tracker.snapshot().todayMs, 30 * MIN);
});

test('two games at once: each game gets its full time, the overall limit counts the overlap once', async () => {
  const {source, tracker, run} = setup({start: T0, games: [{id: 'a', name: 'A', exes: ['a.exe']}, {id: 'b', name: 'B', exes: ['b.exe']}], settings: {overallLimitMin: 120}});
  source.start('a.exe'); await tracker.tick(); await run(30 * MIN);
  source.start('b.exe'); await run(30 * MIN);              // both open for 30 minutes
  source.stop('a.exe'); await run(30 * MIN);
  const s = tracker.snapshot();
  assert.equal(s.games.find(g => g.id === 'a').todayMs, 60 * MIN);
  assert.equal(s.games.find(g => g.id === 'b').todayMs, 60 * MIN - 5 * SEC); // b was first seen one look after it started
  assert.equal(s.todayMs, 90 * MIN);
  assert.equal(s.overall.remainingMs, 30 * MIN);
});

test('warnings at 30, 10 and 0 minutes left, each once, for a game and overall', async () => {
  const {source, tracker, notes, run} = setup({start: T0, games: [{id: 'g1', name: 'Game One', exes: ['game1.exe'], limitMin: 60}], settings: {overallLimitMin: 90}});
  source.start('game1.exe'); await tracker.tick();
  await run(29 * MIN); assert.equal(notes.length, 0);
  await run(2 * MIN);  assert.deepEqual(notes.map(n => [n.target, n.threshold]), [['game:g1', 30]]);
  await run(20 * MIN); assert.deepEqual(notes.map(n => n.threshold), [30, 10]);
  await run(10 * MIN); assert.deepEqual(notes.map(n => [n.target, n.threshold]), [['game:g1', 30], ['game:g1', 10], ['game:g1', 0], ['overall', 30]]);
  assert.equal(notes[2].title, 'Daily limit reached');
  await run(30 * MIN);                                     // 91 minutes: overall 10 and 0 come in turn
  assert.deepEqual(notes.filter(n => n.target === 'overall').map(n => n.threshold), [30, 10, 0]);
  const snap = tracker.snapshot();
  assert.equal(snap.games[0].limit.reached, true);
  assert.equal(snap.games[0].limit.overtimeMs, snap.games[0].todayMs - 60 * MIN, 'keeps counting as overtime');
  await run(60 * MIN);
  assert.equal(notes.length, 6, 'no repeats the same day');
});

test('a warning already sent is not sent again after a restart the same day', async () => {
  const store = new MemoryStore();
  const a = setup({start: T0, store, games: [{id: 'g1', name: 'Game One', exes: ['game1.exe'], limitMin: 40}]});
  a.source.start('game1.exe'); await a.tracker.tick(); await a.run(12 * MIN);
  assert.deepEqual(a.notes.map(n => n.threshold), [30]);
  const clock = new FakeClock(a.clock.now() + MIN), source = new FakeProcesses(); source.start('game1.exe');
  const b = new Tracker({clock, source, store, newId, systemTz: 'Africa/Johannesburg'});
  const got = []; await b.tick(); for (let i = 0; i < 12; i++) { clock.advance(5 * SEC); got.push(...(await b.tick()).warnings); }
  assert.deepEqual(got, []);
});

test('a 20-minute limit gets no 30-minute warning, and warnings reset at midnight', async () => {
  const {source, tracker, notes, run} = setup({start: at('2026-11-25T23:30'), games: [{id: 'g1', name: 'Game One', exes: ['game1.exe'], limitMin: 20}]});
  source.start('game1.exe'); await tracker.tick();
  await run(25 * MIN);                                     // 23:30 -> 23:55
  assert.deepEqual(notes.map(n => n.threshold), [10, 0]);
  await run(35 * MIN);                                     // next day 00:00 -> 00:30: a fresh allowance
  assert.deepEqual(notes.map(n => n.threshold), [10, 0, 10, 0]);
});

test('if the app was closed past several thresholds, only the most urgent warning is shown', async () => {
  const store = new MemoryStore();
  const a = setup({start: T0, store, games: [{id: 'g1', name: 'Game One', exes: ['game1.exe'], limitMin: 60}]});
  // 50 minutes already played earlier today on this device (before any warning was due)
  a.tracker.state.sessions.push({sid: 'old', game: 'g1', name: 'Game One', start: T0 - 120 * MIN, end: T0 - 70 * MIN});
  a.source.start('game1.exe'); const c = await a.tracker.tick();
  assert.deepEqual(c.warnings.map(n => n.threshold), [10]);
});
