// Offline queueing, reconnecting, duplicate prevention and idempotent uploads (companion/sync.js + tracker bookkeeping).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../../web/companion-core.js');
const {Tracker} = require('../../companion/tracker');
const {Sync} = require('../../companion/sync');
const {setup, at, MIN, SEC, MemoryStore, FakeServer, FakeClock, FakeProcesses, newId} = require('./helpers');

const T0 = at('2026-11-25T18:00');
const serverToday = (server, day) => core.dayTotals([...server.items.values()], day).overallMs;

test('playing offline keeps everything locally, and it all uploads once the connection is back', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  const server = new FakeServer(); server.offline = true;
  const sync = new Sync({tracker, remote: server, clock});
  source.start('game1.exe'); await tracker.tick(); await run(20 * MIN);
  source.stop('game1.exe'); await run(5 * SEC);
  const r1 = await sync.flush();
  assert.ok(r1.error, 'upload failed while offline');
  assert.equal(Object.keys(tracker.state.outbox).length, 1, 'the session stays queued');
  server.offline = false;
  clock.advance(10 * MIN);                                   // past the retry delay
  const r2 = await sync.flush();
  assert.equal(r2.sent, 1);
  assert.equal(Object.keys(tracker.state.outbox).length, 0);
  assert.equal(serverToday(server, '2026-11-25'), 20 * MIN);
});

test('the queue survives an app restart while offline', async () => {
  const store = new MemoryStore();
  const a = setup({start: T0, store});
  a.source.start('game1.exe'); await a.tracker.tick(); await a.run(15 * MIN);
  a.source.stop('game1.exe'); await a.run(5 * SEC);
  const clock = new FakeClock(a.clock.now() + 60 * MIN);
  const b = new Tracker({clock, source: new FakeProcesses(), store, newId, systemTz: 'Africa/Johannesburg'});
  const server = new FakeServer();
  await new Sync({tracker: b, remote: server, clock}).flush();
  assert.equal(serverToday(server, '2026-11-25'), 15 * MIN);
});

test('uploading the same sessions twice does not double count', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  const server = new FakeServer(), sync = new Sync({tracker, remote: server, clock});
  source.start('game1.exe'); await tracker.tick(); await run(10 * MIN);
  await sync.flush({force: true});                           // uploaded while still open
  await run(10 * MIN);
  await sync.flush({force: true});                           // the same session again, now longer
  source.stop('game1.exe'); await run(5 * SEC);
  await sync.flush({force: true});
  const replay = tracker.segments();                         // a retry that re-sends everything already sent
  await server.saveSegments(replay); await server.saveSegments(replay);
  assert.equal(server.items.size, 1, 'one item per session per day');
  assert.equal(serverToday(server, '2026-11-25'), 20 * MIN);
  assert.equal([...server.items.values()][0].open, false, 'the server copy is closed once the game closes');
});

test('two uploads started at the same time share one request', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  const server = new FakeServer(); server.delayMs = 30;
  const sync = new Sync({tracker, remote: server, clock});
  source.start('game1.exe'); await tracker.tick(); await run(5 * MIN);
  const [a, b] = await Promise.all([sync.flush({force: true}), sync.flush({force: true})]);
  assert.equal(server.calls, 1);
  assert.deepEqual(a, b);
});

test('a session that changes during an upload is sent again afterwards', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  const server = new FakeServer(); server.delayMs = 20;
  const sync = new Sync({tracker, remote: server, clock});
  source.start('game1.exe'); await tracker.tick(); await run(5 * MIN);
  source.stop('game1.exe'); await run(5 * SEC);              // closed: queued
  const flushing = sync.flush({force: true});
  source.start('game1.exe'); await tracker.tick(); await run(MIN); source.stop('game1.exe'); await run(5 * SEC); // a second session closes mid-upload
  await flushing;
  assert.equal(Object.keys(tracker.state.outbox).length, 1, 'only the session sent in that upload was cleared');
  await sync.flush({force: true});
  assert.equal(Object.keys(tracker.state.outbox).length, 0);
  assert.equal(serverToday(server, '2026-11-25'), 6 * MIN);
});

test('failed uploads back off instead of retrying constantly', async () => {
  const {clock, tracker, source, run} = setup({start: T0});
  const server = new FakeServer(); server.offline = true;
  const sync = new Sync({tracker, remote: server, clock, minDelayMs: 5000, maxDelayMs: 60000});
  source.start('game1.exe'); await tracker.tick(); await run(MIN);
  await sync.flush(); await sync.flush(); await sync.flush();
  assert.equal(server.calls, 1, 'waits before trying again');
  for (let i = 0; i < 10; i++) { clock.advance(61 * SEC); await sync.flush(); }
  assert.equal(server.calls, 11);
  assert.ok(sync.nextTry - clock.now() <= 60000, 'never waits more than the maximum');
});

test('sessions crossing midnight upload as two day pieces that add up to the session', async () => {
  const {clock, source, tracker, run} = setup({start: at('2026-11-25T23:45')});
  const server = new FakeServer(), sync = new Sync({tracker, remote: server, clock});
  source.start('game1.exe'); await tracker.tick(); await run(30 * MIN);
  source.stop('game1.exe'); await run(5 * SEC);
  await sync.flush({force: true});
  assert.equal(serverToday(server, '2026-11-25'), 15 * MIN);
  assert.equal(serverToday(server, '2026-11-26'), 15 * MIN);
});

test('only matched games are uploaded, never other programs', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  const server = new FakeServer(), sync = new Sync({tracker, remote: server, clock});
  source.start('chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  source.start('secret-work-app.exe', 'C:\\Work\\secret-work-app.exe');
  source.start('game1.exe'); await tracker.tick(); await run(2 * MIN);
  await sync.flush({force: true});
  const sent = JSON.stringify([...server.items.values()]);
  assert.ok(!/chrome|secret|Work/i.test(sent));
  assert.deepEqual(Object.keys([...server.items.values()][0]).sort(), ['day', 'end', 'game', 'id', 'name', 'open', 'rev', 'sid', 'start']);
});

test('deleting history clears local sessions and the upload queue', async () => {
  const {clock, source, tracker, run} = setup({start: T0});
  source.start('game1.exe'); await tracker.tick(); await run(5 * MIN); source.stop('game1.exe'); await run(5 * SEC);
  tracker.deleteHistory();
  assert.equal(tracker.state.sessions.length, 0);
  assert.equal(tracker.pendingUpload().segments.length, 0);
  assert.equal(tracker.snapshot().todayMs, 0);
  assert.ok(clock.now() > T0);
});
