// Saves the tracker's state on disk so nothing is lost if the app or the computer stops suddenly.
// Two files: a small "live" checkpoint written every few seconds (what's running and when it was last seen) and the
// full history, written only when it changes. Writes go to a temporary file first and are then renamed into place,
// so a crash mid-write can't leave a half-written file; the previous history is kept as a .bak copy.
'use strict';
const fs = require('fs'), path = require('path');

const LIVE_KEYS = ['open', 'lastTick', 'warned'];

class JsonFileStore {
  constructor(dir, name = 'companion') {
    this.dir = dir; fs.mkdirSync(dir, {recursive: true});
    this.main = path.join(dir, name + '.json'); this.live = path.join(dir, name + '-live.json');
    this.lastMain = '';
  }
  static read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
  static write(file, text) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  }
  load() {
    const main = JsonFileStore.read(this.main) || JsonFileStore.read(this.main + '.bak');
    const live = JsonFileStore.read(this.live);
    if (!main && !live) return null;
    const out = {...(main || {})};
    if (live) for (const k of LIVE_KEYS) if (k in live) out[k] = live[k];
    this.lastMain = main ? JSON.stringify(main) : '';
    return out;
  }
  save(state) {
    const live = {}, main = {};
    for (const [k, v] of Object.entries(state)) (LIVE_KEYS.includes(k) ? live : main)[k] = v;
    JsonFileStore.write(this.live, JSON.stringify(live));
    const text = JSON.stringify(main);
    if (text !== this.lastMain) {
      try { if (fs.existsSync(this.main)) fs.copyFileSync(this.main, this.main + '.bak'); } catch {}
      JsonFileStore.write(this.main, text);
      this.lastMain = text;
    }
  }
}

module.exports = {JsonFileStore};
