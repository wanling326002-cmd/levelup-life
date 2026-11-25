// Test doubles: a clock we move by hand, a process list we edit by hand, an in-memory store and a fake server.
'use strict';
const {Tracker} = require('../../companion/tracker');

class FakeClock { constructor(t) { this.t = t; } now() { return this.t; } advance(ms) { this.t += ms; return this.t; } set(t) { this.t = t; } }
class FakeProcesses {
  constructor() { this.procs = []; this.fail = false; this.pid = 1000; }
  start(name, path = '') { const p = {pid: ++this.pid, name, path}; this.procs.push(p); return p; }
  stop(nameOrProc) { this.procs = this.procs.filter(p => p !== nameOrProc && p.name !== nameOrProc); }
  async list() { if (this.fail) throw new Error('process list unavailable'); return this.procs.map(p => ({...p})); }
}
class MemoryStore { constructor(data = null) { this.data = data; this.saves = 0; } load() { return this.data && JSON.parse(JSON.stringify(this.data)); } save(s) { this.data = JSON.parse(JSON.stringify(s)); this.saves++; } }
class FakeServer {
  constructor() { this.items = new Map(); this.calls = 0; this.offline = false; this.delayMs = 0; }
  async saveSegments(segs) {
    this.calls++;
    if (this.delayMs) await new Promise(r => setTimeout(r, this.delayMs));
    if (this.offline) throw new Error('offline');
    for (const s of segs) this.items.set(s.id, JSON.parse(JSON.stringify(s))); // upsert by id, like Wix Data "save"
  }
}

const MIN = 60000, SEC = 1000;
let seq = 0;
const newId = () => 'sess-' + (++seq);

// A tracker with one or more games and helpers to "play" for a while with 5-second ticks.
function setup({start, tz = 'Africa/Johannesburg', games, store = new MemoryStore(), settings = {}} = {}) {
  const clock = new FakeClock(start), source = new FakeProcesses();
  const tracker = new Tracker({clock, source, store, newId, systemTz: tz});
  for (const g of games || [{id: 'g1', name: 'Game One', exes: ['game1.exe']}]) tracker.upsertGame(g);
  if (Object.keys(settings).length) tracker.setSettings(settings);
  const notes = [];
  const run = async (ms, step = 5 * SEC) => { const end = clock.t + ms; while (clock.t < end) { clock.advance(Math.min(step, end - clock.t)); const c = await tracker.tick(); notes.push(...c.warnings); } };
  return {clock, source, tracker, store, notes, run};
}
// Local time in a timezone -> epoch ms (good enough for tests: searches the offset).
function at(iso, tz = 'Africa/Johannesburg') {
  const [d, t = '00:00:00'] = iso.split('T'); const [y, m, day] = d.split('-').map(Number); const [hh, mm, ss = 0] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm, ss);
  for (let off = -14 * 60; off <= 14 * 60; off += 15) {
    const ms = guess - off * MIN;
    const p = new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(ms));
    const g = k => p.find(x => x.type === k).value;
    if (`${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}` === `${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`) return ms;
  }
  throw new Error('no such local time: ' + iso + ' ' + tz);
}

module.exports = {FakeClock, FakeProcesses, MemoryStore, FakeServer, setup, at, MIN, SEC, newId};
