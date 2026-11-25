// Settings sync between the PC and the website, check-ins, disconnects (companion/service.js).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {CompanionService, mergeConfig, toShared} = require('../../companion/service');
const {setup, at, MIN, SEC} = require('./helpers');

function fakeRemote() {
  return {
    cfg: null, segs: new Map(), devices: new Map(), revoked: false, fail: false, heartbeats: [],
    async getConfig() { if (this.fail) throw new Error('offline'); return this.cfg && JSON.parse(JSON.stringify(this.cfg)); },
    async putConfig(id, data, updatedAt) { if (this.fail) throw new Error('offline'); this.cfg = {id: id || 'cfg-1', data: JSON.parse(JSON.stringify(data)), updatedAt}; return this.cfg.id; },
    async heartbeat(d) { if (this.fail) throw new Error('offline'); this.heartbeats.push(d); return {revoked: this.revoked}; },
    async saveSegments(s) { if (this.fail) throw new Error('offline'); for (const x of s) this.segs.set(x.id, x); },
    async markDisconnected() { this.marked = true; }, async deleteAllSessions() { this.segs.clear(); },
  };
}
function svc({start = at('2026-11-25T18:00'), connected = true, games} = {}) {
  const env = setup({start, games});
  const remote = fakeRemote(), notes = [], saved = {v: connected ? {refreshToken: 'rt', member: {id: 'm1', email: 'p@example.com'}} : null};
  const secrets = {load: () => saved.v, save: v => { saved.v = v; }, clear: () => { saved.v = null; }};
  const s = new CompanionService({tracker: env.tracker, clock: env.clock, notify: (t, b) => notes.push(t), secrets, remoteFor: () => remote, deviceId: 'dev1', deviceName: 'PC', appVersion: '1.1.0'});
  return {...env, remote, notes, saved, s};
}

test('merge: the newer edit of a game wins; folders and paths never come from the website', () => {
  const local = {settingsAt: 5, overallLimitMin: 60, games: [{id: 'a', name: 'A', limitMin: 30, editedAt: 10, dirs: ['C:\\Users\\Me\\Games\\A'], paths: [], exes: ['a.exe']}]};
  const remote = {settingsAt: 9, overallLimitMin: 90, games: [{id: 'a', name: 'A', limitMin: 45, editedAt: 20, exes: ['a.exe']}, {id: 'b', name: 'B', editedAt: 1}]};
  const m = mergeConfig(local, remote);
  assert.equal(m.overallLimitMin, 90);
  assert.equal(m.games.find(g => g.id === 'a').limitMin, 45);
  assert.deepEqual(m.games.find(g => g.id === 'a').dirs, ['C:\\Users\\Me\\Games\\A']);
  assert.ok(m.games.find(g => g.id === 'b'));
  const older = mergeConfig(local, {settingsAt: 1, overallLimitMin: 5, games: [{id: 'a', limitMin: 5, editedAt: 1}]});
  assert.equal(older.overallLimitMin, 60); assert.equal(older.games[0].limitMin, 30);
});

test('what is shared online never includes folders or full paths', () => {
  const shared = JSON.stringify(toShared({games: [{id: 'a', name: 'A', dirs: ['C:\\Users\\Thandi\\Games'], paths: ['C:\\Users\\Thandi\\Games\\a.exe'], exes: ['a.exe']}]}));
  assert.ok(!/Users|Thandi/.test(shared));
});

test('a limit changed on the website reaches the PC; a change on the PC reaches the website', async () => {
  const {s, remote, clock} = svc();
  await s.cycle();
  assert.equal(remote.cfg.data.games[0].id, 'g1');
  remote.cfg.data.games[0].limitMin = 50; remote.cfg.data.games[0].editedAt = clock.now() + 1;  // edited on the website
  clock.advance(MIN); await s.cycle();
  assert.equal(s.tracker.games[0].limitMin, 50);
  s.setSettings({overallLimitMin: 100}); clock.advance(SEC); await s.cycle();
  assert.equal(remote.cfg.data.overallLimitMin, 100);
});

test('removing a game on one side removes it on the other', async () => {
  const {s, remote, clock} = svc({games: [{id: 'a', name: 'A', exes: ['a.exe']}, {id: 'b', name: 'B', exes: ['b.exe']}]});
  await s.cycle();
  s.removeGame('a'); clock.advance(SEC); await s.cycle();
  assert.equal(remote.cfg.data.games.find(g => g.id === 'a').deleted, true);
  remote.cfg.data.games.find(g => g.id === 'b').deleted = true; remote.cfg.data.games.find(g => g.id === 'b').editedAt = clock.now() + 5;
  clock.advance(MIN); await s.cycle();
  assert.equal(s.tracker.games.find(g => g.id === 'b').deleted, true);
  assert.deepEqual(s.tracker.snapshot().games.map(g => g.id), [], 'deleted games are not listed or tracked');
});

test('check-ins report what is playing; a disconnect from the website stops syncing and tells the user', async () => {
  const {s, remote, source, tracker, run, notes, saved} = svc();
  source.start('game1.exe'); await tracker.tick(); await run(MIN);
  await s.cycle();
  assert.equal(remote.heartbeats.at(-1).playing[0].game, 'g1');
  assert.equal(remote.heartbeats.at(-1).tracking, true);
  remote.revoked = true;
  await s.cycle();
  assert.equal(s.status.state, 'disconnected'); assert.equal(saved.v, null, 'the saved sign-in is deleted');
  assert.ok(notes.includes('Disconnected'));
  await run(MIN);
  assert.equal(tracker.snapshot().playing.length, 1, 'tracking carries on locally');
});

test('offline: the status says so and uploads wait; back online they go through', async () => {
  const {s, remote, source, tracker, run} = svc();
  source.start('game1.exe'); await tracker.tick(); await run(2 * MIN);
  remote.fail = true; await s.cycle();
  assert.equal(s.status.state, 'offline');
  remote.fail = false; await s.cycle();
  assert.equal(s.status.state, 'connected');
  assert.ok(remote.segs.size >= 1);
});

test('the launcher scan adds new games but never brings back one the user removed', () => {
  const {s} = svc({connected: false, games: []});
  assert.equal(s.mergeScan([{id: 'steam-1', name: 'One', source: 'steam', dirs: ['D:\\S\\One'], exes: []}]), 1);
  s.removeGame('steam-1');
  assert.equal(s.mergeScan([{id: 'steam-1', name: 'One', source: 'steam', dirs: ['D:\\S\\One'], exes: []}]), 0);
  assert.equal(s.tracker.games.find(g => g.id === 'steam-1').deleted, true);
});

test('pausing is reported to the website as tracking off', async () => {
  const {s, remote} = svc();
  s.tracker.setPaused(true); await s.cycle();
  assert.equal(remote.heartbeats.at(-1).tracking, false);
});
