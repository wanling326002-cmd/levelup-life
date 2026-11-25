// The desktop companion's engine room: runs the tracker on a timer, uploads sessions, checks in with the website and
// keeps games/limits in step with the website. Electron-specific pieces are passed in, so this can be tested:
//   notify(title, body), secrets: {load(), save(obj), clear()}, openExternal(url), remoteFor(refreshToken) -> WixRemote
'use strict';
const {Sync} = require('./sync');

const EDITABLE = ['name', 'enabled', 'limitMin'];
// Only these game fields leave the computer. Install folders and full paths can contain the Windows user name, so
// they stay local.
const SHARED_FIELDS = ['id', 'name', 'source', 'enabled', 'limitMin', 'exes', 'editedAt', 'deleted'];
const shareGame = g => Object.fromEntries(SHARED_FIELDS.filter(k => g[k] !== undefined).map(k => [k, g[k]]));

/* Merge two copies of the settings (this PC and the website). Per game, the copy edited last wins; a removed game
   is kept as a "deleted" marker so the removal reaches the other side. Folders and paths always come from this PC. */
function mergeConfig(local, remote) {
  if (!remote) return {...local};
  const out = {...local};
  if ((remote.settingsAt || 0) > (local.settingsAt || 0)) for (const k of ['overallLimitMin', 'tz', 'notify', 'settingsAt']) if (k in remote) out[k] = remote[k];
  const byId = new Map((local.games || []).map(g => [g.id, g]));
  for (const r of remote.games || []) {
    const l = byId.get(r.id);
    if (!l) { if (!r.deleted) byId.set(r.id, {exes: [], dirs: [], paths: [], ...r}); else byId.set(r.id, r); continue; }
    if ((r.editedAt || 0) > (l.editedAt || 0)) byId.set(r.id, {...l, ...Object.fromEntries(['deleted', 'editedAt', ...EDITABLE].filter(k => k in r).map(k => [k, r[k]]))});
  }
  out.games = [...byId.values()];
  return out;
}
const sameShared = (a, b) => JSON.stringify(toShared(a)) === JSON.stringify(toShared(b));
function toShared(c) { return {overallLimitMin: c.overallLimitMin || 0, tz: c.tz || '', notify: c.notify !== false, settingsAt: c.settingsAt || 0, games: (c.games || []).map(shareGame).sort((x, y) => x.id.localeCompare(y.id))}; }

class CompanionService {
  constructor({tracker, clock, notify, secrets, remoteFor, deviceId, deviceName, appVersion, heartbeatMs = 60000, onStatus = () => {}}) {
    Object.assign(this, {tracker, clock, notify, secrets, remoteFor, deviceId, deviceName, appVersion, heartbeatMs, onStatus});
    this.remote = null; this.sync = null; this.member = null;
    this.status = {connected: false, member: null, lastSync: 0, lastHeartbeat: 0, error: '', state: 'local'}; // local | connected | offline | signedOut | disconnected
    this.cfg = this.tracker.state.cfg || {id: null, settingsAt: 0};
    this.timers = []; this.cycleBusy = null; this.soon = null;
    const saved = secrets && secrets.load();
    if (saved && saved.refreshToken) this._attach(saved.refreshToken, saved.member);
  }
  _attach(refreshToken, member) {
    this.remote = this.remoteFor(refreshToken, t => this.secrets.save({refreshToken: t, member: this.member}));
    this.remote.deviceId = this.deviceId;
    this.sync = new Sync({tracker: this.tracker, remote: this.remote, clock: this.clock});
    this.member = member || null;
    this._setStatus({connected: true, member: this.member, state: 'connected', error: ''});
  }
  _setStatus(p) { Object.assign(this.status, p); this.onStatus({...this.status}); }

  /* ---------- running ---------- */
  start() {
    const tick = async () => {
      const c = await this.tracker.tick();
      for (const w of c.warnings) this.notify(w.title, w.body);
      if (c.started.length || c.stopped.length) this.syncSoon(); // the website should see "now playing" quickly
    };
    this.timers.push(setInterval(() => { tick().catch(() => {}); }, this.tracker.state.settings.pollMs));
    this.timers.push(setInterval(() => { this.cycle().catch(() => {}); }, this.heartbeatMs));
    tick().catch(() => {}); setTimeout(() => this.cycle().catch(() => {}), 3000);
  }
  stop() { this.timers.forEach(clearInterval); this.timers = []; clearTimeout(this.soon); }
  syncSoon(ms = 3000) { clearTimeout(this.soon); this.soon = setTimeout(() => this.cycle().catch(() => {}), ms); }

  // One round with the website: settings, check-in, uploads. Calls during a round share it.
  cycle() {
    if (!this.remote) return Promise.resolve({skipped: 'not connected'});
    if (this.cycleBusy) return this.cycleBusy;
    this.cycleBusy = (async () => {
      try {
        await this.syncConfig();
        const snap = this.tracker.snapshot();
        const hb = await this.remote.heartbeat({device: this.deviceId, name: this.deviceName, appVersion: this.appVersion, lastSeen: this.clock.now(),
          tracking: !snap.paused, playing: snap.playing.map(p => ({game: p.game, name: p.name, since: p.since}))});
        if (hb.revoked) { await this.disconnect({fromWebsite: true}); return {revoked: true}; }
        const r = await this.sync.flush({force: true});
        if (r.error) throw new Error(r.error);
        this._setStatus({state: 'connected', lastSync: this.clock.now(), lastHeartbeat: this.clock.now(), error: ''});
        return {ok: true};
      } catch (e) {
        if (e && e.signedOut) { this._setStatus({state: 'signedOut', error: 'Please connect again: the sign-in expired.'}); return {signedOut: true}; }
        this._setStatus({state: 'offline', error: String(e && e.message || e)});
        return {error: String(e && e.message || e)};
      }
    })().finally(() => { this.cycleBusy = null; });
    return this.cycleBusy;
  }

  localConfig() { const s = this.tracker.state.settings; return {overallLimitMin: s.overallLimitMin, tz: s.tz, notify: s.notify, settingsAt: this.cfg.settingsAt || 0, games: this.tracker.state.games}; }
  async syncConfig() {
    const remote = await this.remote.getConfig();
    if (remote && remote.id) this.cfg.id = remote.id;
    const local = this.localConfig(), merged = mergeConfig(local, remote && remote.data);
    this._applyConfig(merged);
    if (!remote || !sameShared(merged, remote.data || {})) this.cfg.id = await this.remote.putConfig(this.cfg.id, toShared(merged), this.clock.now());
  }
  _applyConfig(c) {
    const st = this.tracker.state;
    st.settings.overallLimitMin = c.overallLimitMin || 0; st.settings.tz = c.tz || ''; st.settings.notify = c.notify !== false;
    this.cfg.settingsAt = c.settingsAt || 0; st.cfg = this.cfg;
    st.games = c.games;
    for (const g of st.games) if (g.deleted && st.open[g.id]) { this.tracker._close(st.open[g.id]); delete st.open[g.id]; }
    this.tracker._persist();
  }

  /* ---------- changes from the app's window ---------- */
  editGame(id, patch) {
    const g = this.tracker.games.find(x => x.id === id); if (!g) return;
    const p = {};
    for (const k of EDITABLE) if (k in patch) p[k] = k === 'limitMin' ? Math.max(0, Math.min(1440, Math.round(Number(patch[k]) || 0))) : k === 'enabled' ? !!patch[k] : String(patch[k]).slice(0, 80);
    this.tracker.upsertGame({...g, ...p, editedAt: this.clock.now()}); this.syncSoon();
  }
  addGame(g) { this.tracker.upsertGame({...g, editedAt: this.clock.now()}); this.syncSoon(); }
  removeGame(id) { // keeps a "deleted" marker so the website removes it too
    const g = this.tracker.games.find(x => x.id === id); if (!g) return;
    this.tracker.upsertGame({id, name: g.name, source: g.source, deleted: true, enabled: false, exes: [], dirs: [], paths: [], editedAt: this.clock.now()});
    this.syncSoon();
  }
  setSettings(p) {
    this.tracker.setSettings(p); this.cfg.settingsAt = this.clock.now(); this.tracker.state.cfg = this.cfg; this.tracker._persist(); this.syncSoon();
  }
  // Games found by the launcher scan: new ones are added (tracked by default); known ones get fresher folders/names,
  // but a game the member removed stays removed.
  mergeScan(found) {
    const known = new Map(this.tracker.games.map(g => [g.id, g]));
    let added = 0;
    for (const f of found) {
      const k = known.get(f.id);
      if (!k) { this.tracker.upsertGame({...f, enabled: true, limitMin: 0, editedAt: 0}); added++; }
      else if (!k.deleted) this.tracker.upsertGame({...k, dirs: f.dirs, exes: [...new Set([...(k.exes || []), ...(f.exes || [])])]});
    }
    if (added) this.syncSoon();
    return added;
  }

  /* ---------- connecting ---------- */
  async connect(signIn) {
    const r = await signIn();
    this.secrets.save({refreshToken: r.refreshToken, member: r.member});
    this._attach(r.refreshToken, r.member);
    await this.cycle();
    return r.member;
  }
  async disconnect({fromWebsite = false} = {}) {
    if (this.remote && !fromWebsite) await this.remote.markDisconnected(this.deviceId);
    this.secrets.clear(); this.remote = null; this.sync = null; this.member = null;
    this._setStatus({connected: false, member: null, state: fromWebsite ? 'disconnected' : 'local', error: ''});
    if (fromWebsite) this.notify('Disconnected', 'This PC was disconnected from your account on the website. Tracking continues on this PC only.');
  }
  async deleteHistory({online = true} = {}) {
    this.tracker.deleteHistory();
    if (online && this.remote) await this.remote.deleteAllSessions();
  }
}

module.exports = {CompanionService, mergeConfig, toShared, shareGame, SHARED_FIELDS};
