// The playtime tracker: turns "which games are running right now" into sessions, totals, limits and warnings.
// Everything it needs from the outside is passed in, so tests can drive it with a fake clock and process list:
//   clock:   {now(): ms}
//   source:  {list(): Promise<[{pid, name, path}]>}   (the matched-games-only rule is enforced here, not there)
//   store:   {load(): object|null, save(object)}       (a JSON file on Windows, memory in tests)
//   newId:   () => unique string                       (session ids)
// Rules that keep the numbers honest:
//   - A session only grows while the game is seen. If the tracker itself stops seeing the world for longer than
//     gapMs (sleep, hibernate, a frozen PC, the app was closed or crashed), open sessions end at the last time
//     the game was actually seen, and a new session starts if the game is still running afterwards.
//   - The clock going backwards (manual time change) is treated the same way.
//   - Each session has a unique id; uploads are keyed by session id + day, so sending twice never counts twice.
'use strict';
const core = require('../web/companion-core.js');
const {matchProcesses} = require('./matcher');

const DEFAULTS = {tz: '', overallLimitMin: 0, pollMs: 5000, gapMs: 30000, notify: true, paused: false, keepDays: 120};

class Tracker {
  constructor({clock, source, store, newId, systemTz = 'UTC', onChange = () => {}}) {
    this.clock = clock; this.source = source; this.store = store; this.newId = newId; this.onChange = onChange;
    this.systemTz = core.validTz(systemTz) ? systemTz : 'UTC';
    const saved = (store && store.load()) || {};
    this.state = {
      v: 1,
      games: Array.isArray(saved.games) ? saved.games : [],
      settings: {...DEFAULTS, ...(saved.settings || {})},
      open: saved.open && typeof saved.open === 'object' ? saved.open : {},
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      warned: saved.warned && typeof saved.warned === 'object' ? saved.warned : {}, // {day: {target: [thresholds]}}
      outbox: saved.outbox && typeof saved.outbox === 'object' ? saved.outbox : {},   // {sid: rev}
      lastTick: Number(saved.lastTick) || 0,
    };
    // Recover from a crash or a normal quit: whatever was open ends where it was last seen. Nothing is added for
    // the time the app wasn't running.
    for (const o of Object.values(this.state.open)) this._close(o);
    this.state.open = {};
    this.running = false;
    this._persist();
  }

  get tz() { const t = this.state.settings.tz; return t && core.validTz(t) ? t : this.systemTz; }
  get games() { return this.state.games; }
  get paused() { return !!this.state.settings.paused; }

  _persist() { if (this.store) this.store.save(this.state); }
  _close(o) { // even a zero-length session is kept and queued, so a copy the server saw while it was open gets closed
    this.state.sessions.push({sid: o.sid, game: o.game, name: o.name, start: o.start, end: Math.max(o.start, o.lastSeen)});
    this.state.outbox[o.sid] = Math.max(o.start, o.lastSeen) + 0.5; // +0.5: a closed revision always differs from the open one
  }
  _closeAll() { for (const o of Object.values(this.state.open)) this._close(o); this.state.open = {}; }

  // One look at the running processes. Returns what changed (for the UI and notifications).
  async tick() {
    const now = this.clock.now(), st = this.state, last = st.lastTick;
    // A long silence (sleep, hibernate, the PC froze) or the clock jumping backwards: end what was open at the
    // moment it was last seen.
    if (last && (now - last > st.settings.gapMs || now < last)) this._closeAll();
    st.lastTick = now;
    const started = [], stopped = [];
    if (this.paused) {
      if (Object.keys(st.open).length) { stopped.push(...Object.values(st.open).map(o => o.game)); this._closeAll(); }
    } else {
      let procs = [];
      try { procs = await this.source.list(); } catch { procs = null; }
      if (!procs) st.lastTick = last; // a failed look doesn't count as seeing anything: a long failure ends sessions like a sleep would
      else {
        const matched = matchProcesses(st.games, procs);
        for (const [gid, o] of Object.entries(st.open)) if (!matched.has(gid)) { this._close(o); delete st.open[gid]; stopped.push(gid); }
        for (const [gid, m] of matched) {
          const o = st.open[gid];
          if (o) { o.lastSeen = now; o.name = m.game.name; }
          else { st.open[gid] = {sid: this.newId(), game: gid, name: m.game.name, start: now, lastSeen: now}; started.push(gid); }
        }
      }
    }
    this._prune(now);
    const warnings = st.settings.notify ? this._warnings(now) : [];
    this._persist();
    const change = {now, started, stopped, warnings};
    if (started.length || stopped.length || warnings.length) this.onChange(change);
    return change;
  }

  // The computer is about to sleep (Windows tells us): end sessions now rather than waiting for the gap check.
  suspend() { this._closeAll(); this.state.lastTick = 0; this._persist(); }
  resume() { this.state.lastTick = 0; this._persist(); } // the next tick starts fresh sessions for games still open

  setPaused(p) {
    this.state.settings.paused = !!p;
    if (p) this._closeAll();
    this.state.lastTick = 0; this._persist(); this.onChange({now: this.clock.now(), started: [], stopped: [], warnings: [], paused: !!p});
  }

  // All sessions (closed, plus open ones up to when they were last seen), split into per-day segments.
  segments(filterSids) {
    const out = [], tz = this.tz;
    const add = (s, open) => {
      if (filterSids && !filterSids.has(s.sid)) return;
      const end = open ? s.lastSeen : s.end;
      const parts = end > s.start ? core.splitByDay(s.start, end, tz) : [{day: core.dayKey(s.start, tz), start: s.start, end: s.start}];
      for (const p of parts) out.push({id: `${s.sid}_${p.day}`, sid: s.sid, game: s.game, name: s.name, day: p.day, start: p.start, end: p.end, open: !!open, rev: open ? end : end + 0.5}); // a closed copy beats an open copy of the same moment
    };
    for (const s of this.state.sessions) add(s, false);
    for (const o of Object.values(this.state.open)) add(o, true);
    return out;
  }

  // Everything the window, the tray and the website need for "today".
  snapshot(now = this.clock.now()) {
    const tz = this.tz, day = core.dayKey(now, tz), segs = this.segments(), totals = core.dayTotals(segs, day);
    const games = this.state.games.filter(g => !g.deleted).map(g => {
      const used = (totals.perGame[g.id] || {ms: 0}).ms, o = this.state.open[g.id];
      return {id: g.id, name: g.name, source: g.source, enabled: g.enabled !== false, limitMin: g.limitMin || 0, playing: !!o,
        sessionMs: o ? o.lastSeen - o.start : 0, todayMs: used, limit: core.limitStatus(used, g.limitMin)};
    });
    return {now, day, tz, paused: this.paused, overall: core.limitStatus(totals.overallMs, this.state.settings.overallLimitMin),
      todayMs: totals.overallMs, playing: Object.values(this.state.open).map(o => ({game: o.game, name: o.name, sessionMs: o.lastSeen - o.start, since: o.start})),
      games, week: core.history(segs, day, 7), hist: core.history(segs, day, 14)};
  }

  _warnings(now) {
    const day = core.dayKey(now, this.tz), segs = this.segments(), totals = core.dayTotals(segs, day);
    const w = this.state.warned[day] || (this.state.warned[day] = {}), out = [];
    const check = (key, usedMs, limitMin, name, overall) => {
      const due = core.warningsDue(usedMs, limitMin, w[key]);
      if (!due.mark.length) return;
      w[key] = [...new Set([...(w[key] || []), ...due.mark])];
      for (const t of due.send) out.push({target: key, threshold: t, ...core.warningText(t, name, overall)});
    };
    // Only warn about games that are being played today; a limit on an untouched game needs no warning.
    for (const g of this.state.games) if (!g.deleted && g.limitMin > 0 && totals.perGame[g.id]) check('game:' + g.id, totals.perGame[g.id].ms, g.limitMin, g.name, false);
    if (this.state.settings.overallLimitMin > 0 && totals.overallMs > 0) check('overall', totals.overallMs, this.state.settings.overallLimitMin, 'gaming', true);
    return out;
  }

  _prune(now) {
    const keep = now - this.state.settings.keepDays * core.DAY;
    if (this.state.sessions.length && this.state.sessions[0].end < keep) this.state.sessions = this.state.sessions.filter(s => s.end >= keep || this.state.outbox[s.sid] !== undefined);
    const today = core.dayKey(now, this.tz);
    for (const d of Object.keys(this.state.warned)) if (d < core.addDays(today, -2)) delete this.state.warned[d];
  }

  /* ---------- games and settings ---------- */
  upsertGame(g) {
    const i = this.state.games.findIndex(x => x.id === g.id);
    if (i >= 0) this.state.games[i] = {...this.state.games[i], ...g}; else this.state.games.push({enabled: true, limitMin: 0, exes: [], dirs: [], paths: [], ...g});
    this._persist(); this.onChange({now: this.clock.now(), started: [], stopped: [], warnings: []});
  }
  removeGame(id) {
    if (this.state.open[id]) { this._close(this.state.open[id]); delete this.state.open[id]; }
    this.state.games = this.state.games.filter(g => g.id !== id); this._persist();
  }
  setSettings(patch) {
    const s = this.state.settings;
    if ('tz' in patch) s.tz = patch.tz && core.validTz(patch.tz) ? patch.tz : '';
    if ('overallLimitMin' in patch) s.overallLimitMin = Math.max(0, Math.min(1440, Math.round(Number(patch.overallLimitMin) || 0)));
    if ('notify' in patch) s.notify = !!patch.notify;
    this._persist();
  }
  deleteHistory() { this._closeAll(); this.state.sessions = []; this.state.outbox = {}; this.state.warned = {}; this._persist(); }

  /* ---------- sync bookkeeping ---------- */
  // Segments that still need uploading, with the revision each was queued at.
  pendingUpload() {
    const sids = new Set(Object.keys(this.state.outbox));
    for (const o of Object.values(this.state.open)) sids.add(o.sid); // open sessions are refreshed on every upload
    return {segments: this.segments(sids), revs: {...this.state.outbox}};
  }
  // After a successful upload: forget sessions that haven't changed since they were sent.
  markUploaded(revs) {
    for (const [sid, rev] of Object.entries(revs)) if (this.state.outbox[sid] === rev) delete this.state.outbox[sid];
    this._persist();
  }
}

module.exports = {Tracker, DEFAULTS};
