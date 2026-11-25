// Finds installed games by reading the files and registry entries that game launchers leave behind.
// Read-only: nothing here starts, opens or changes a game. Every source is optional: a launcher that isn't
// installed (or a file in an unexpected format) is simply skipped.
// env: {fs (node:fs-like), readReg(keyPath) -> Promise<text of `reg query <key> /s`>, drives: ['C:', 'D:'], programData, programFilesX86}
'use strict';
const path = require('path').win32;
const {isExcluded} = require('./matcher');

/* ---------- small parsers ---------- */
// Valve's KeyValues text format (libraryfolders.vdf, appmanifest_*.acf) -> nested object
function parseVdf(text) {
  const root = {}, stack = [root];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  let m, key = null;
  while ((m = re.exec(text))) {
    const cur = stack[stack.length - 1];
    if (m[2] === '{') { const o = {}; if (key !== null) cur[key] = o; stack.push(o); key = null; }
    else if (m[2] === '}') { stack.pop(); key = null; if (!stack.length) break; }
    else { const s = m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'); if (key === null) key = s; else { cur[key] = s; key = null; } }
  }
  return root;
}
// `reg query KEY /s` output -> {keyPath: {valueName: data}}
function parseRegQuery(text) {
  const out = {}; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (/^HKEY_/i.test(line)) { cur = out[line] = {}; continue; }
    const m = line.match(/^\s{2,}(.*?)\s{4}(REG_[A-Z_]+)\s{4}(.*)$/) || line.match(/^\s{2,}(.*?)\s{4}(REG_[A-Z_]+)$/);
    if (m && cur) cur[m[1] === '(Default)' ? '' : m[1]] = m[3] === undefined ? '' : m[3];
  }
  return out;
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
async function readText(env, p) { try { return await env.fs.promises.readFile(p, 'utf8'); } catch { return null; } }
async function readBuf(env, p) { try { return await env.fs.promises.readFile(p); } catch { return null; } }
async function list(env, p) { try { return await env.fs.promises.readdir(p); } catch { return []; } }
async function exists(env, p) { try { await env.fs.promises.access(p); return true; } catch { return false; } }

/* ---------- Steam ---------- */
const STEAM_TOOLS = new Set(['228980', '1070560', '1391110', '1493710', '1628350', '250820', '1826330', '2180100', '1887720', '961940', '1580130', '2348590']); // redistributables, runtimes, Proton, SteamVR
async function scanSteam(env) {
  const roots = new Set();
  const reg = parseRegQuery(await env.readReg('HKCU\\Software\\Valve\\Steam').catch(() => ''));
  for (const k of Object.values(reg)) if (k.SteamPath) roots.add(path.normalize(k.SteamPath));
  roots.add(path.join(env.programFilesX86 || 'C:\\Program Files (x86)', 'Steam'));
  const libs = new Map(); // Windows paths ignore case: the same folder can be spelled several ways
  const addLib = p => { const n = path.normalize(p).replace(/\\+$/, ''); if (!libs.has(n.toLowerCase())) libs.set(n.toLowerCase(), n); };
  for (const r of roots) {
    const vdf = await readText(env, path.join(r, 'steamapps', 'libraryfolders.vdf'));
    if (!vdf) continue;
    addLib(r);
    const lf = parseVdf(vdf).libraryfolders || {};
    for (const v of Object.values(lf)) { const p = typeof v === 'string' ? v : v && v.path; if (p) addLib(p); }
  }
  const games = [];
  for (const lib of libs.values()) {
    const apps = path.join(lib, 'steamapps');
    for (const f of await list(env, apps)) {
      if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
      const st = (parseVdf(await readText(env, path.join(apps, f)) || '').AppState) || {};
      if (!st.appid || !st.installdir || STEAM_TOOLS.has(String(st.appid))) continue;
      if (/redistributable|runtime|proton|steamworks|soundtrack|dedicated server|\bsdk\b/i.test(st.name || '')) continue;
      games.push({id: 'steam-' + st.appid, name: st.name || st.installdir, source: 'steam', dirs: [path.join(apps, 'common', st.installdir)], exes: []});
    }
  }
  return games;
}

/* ---------- Epic Games ---------- */
async function scanEpic(env) {
  const dir = path.join(env.programData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const games = [];
  for (const f of await list(env, dir)) {
    if (!/\.item$/i.test(f)) continue;
    let m; try { m = JSON.parse(await readText(env, path.join(dir, f))); } catch { continue; }
    if (!m || !m.InstallLocation || !m.DisplayName) continue;
    const cats = (m.AppCategories || []).map(String);
    if (cats.length && !cats.includes('games')) continue; // engines, plugins and other add-ons
    if (m.bIsIncompleteInstall) continue;
    const exe = m.LaunchExecutable ? path.basename(m.LaunchExecutable).toLowerCase() : '';
    games.push({id: 'epic-' + slug(m.AppName || m.DisplayName), name: m.DisplayName, source: 'epic', dirs: [path.normalize(m.InstallLocation)], exes: exe && !isExcluded(exe) ? [exe] : []});
  }
  return games;
}

/* ---------- Xbox app / PC Game Pass ----------
   Only games installed in an "XboxGames" folder can be found: older Game Pass installs live in the protected
   WindowsApps folder, which normal programs can't read. Those can be added by hand while they run. */
async function gamingRoots(env) {
  const roots = new Set();
  for (const d of env.drives || ['C:']) {
    const buf = await readBuf(env, d + '\\.GamingRoot'); // the Xbox app's pointer to its install folder on this drive
    if (buf && buf.length > 8) {
      const rel = Buffer.from(buf.subarray(8)).toString('utf16le').replace(/\0+$/, '').replace(/\0/g, '');
      if (rel) roots.add(path.join(d + '\\', rel));
    }
    roots.add(d + '\\XboxGames');
  }
  return [...roots];
}
async function scanXbox(env) {
  const games = [];
  for (const root of await gamingRoots(env)) {
    for (const name of await list(env, root)) {
      if (name.startsWith('.') || /^gameSave/i.test(name)) continue;
      const content = path.join(root, name, 'Content');
      const cfg = await readText(env, path.join(content, 'MicrosoftGame.config'));
      if (!cfg && !(await exists(env, content))) continue;
      const exes = cfg ? [...cfg.matchAll(/<Executable\b[^>]*\bName\s*=\s*"([^"]+)"/gi)].map(m => path.basename(m[1]).toLowerCase()).filter(e => !isExcluded(e)) : [];
      const title = cfg && ((cfg.match(/DefaultDisplayName\s*=\s*"([^"]+)"/i) || [])[1] || (cfg.match(/<ShellVisuals[^>]*\bDefaultDisplayName="([^"]+)"/i) || [])[1]);
      games.push({id: 'xbox-' + slug(name), name: title && !/^ms-resource:/i.test(title) ? title : name, source: 'xbox', dirs: [content], exes});
    }
  }
  return games;
}

/* ---------- GOG Galaxy ---------- */
async function scanGog(env) {
  const reg = parseRegQuery(await env.readReg('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games').catch(() => ''));
  const games = [];
  for (const [key, v] of Object.entries(reg)) {
    if (!v.path || !(v.gameName || v.GAMENAME)) continue;
    const exe = v.exe ? path.basename(v.exe).toLowerCase() : '';
    games.push({id: 'gog-' + (v.gameID || slug(key.split('\\').pop())), name: v.gameName || v.GAMENAME, source: 'gog', dirs: [path.normalize(v.path)], exes: exe && !isExcluded(exe) ? [exe] : []});
  }
  return games;
}

/* ---------- EA app, Ubisoft Connect, Battle.net, Riot, Rockstar and other publishers ----------
   These launchers register their games in Windows' list of installed programs. Only entries from known game
   publishers are used, and the launchers themselves are left out. */
const PUBLISHERS = [
  [/electronic arts|\bea\b/i, 'ea'], [/ubisoft/i, 'ubisoft'], [/blizzard/i, 'battlenet'], [/riot games/i, 'riot'],
  [/rockstar games/i, 'rockstar'], [/bethesda/i, 'bethesda'], [/activision/i, 'battlenet'], [/mojang|microsoft studios/i, 'other'],
  [/cd projekt/i, 'other'], [/square enix/i, 'other'], [/bandai namco/i, 'other'], [/sega/i, 'other'], [/wargaming/i, 'other'],
  [/hoyoverse|cognosphere|mihoyo/i, 'other'], [/epic games/i, 'epic'],
];
const LAUNCHER_NAMES = /(launcher|ea app|\bconnect\b|battle\.net|riot client|social club|uplay|desktop app|anti-?cheat|redistributable|runtime|update|vc\+\+|directx|\.net)/i;
async function scanUninstall(env) {
  const keys = ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'];
  const games = [];
  for (const k of keys) {
    const reg = parseRegQuery(await env.readReg(k).catch(() => ''));
    for (const v of Object.values(reg)) {
      const name = v.DisplayName, dir = (v.InstallLocation || '').replace(/^"|"$/g, ''), pub = v.Publisher || '';
      if (!name || !dir || LAUNCHER_NAMES.test(name) || v.SystemComponent === '0x1') continue;
      const hit = PUBLISHERS.find(([re]) => re.test(pub));
      if (!hit) continue;
      const icon = (v.DisplayIcon || '').replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '');
      const exe = /\.exe$/i.test(icon) && icon.toLowerCase().startsWith(dir.toLowerCase()) ? path.basename(icon).toLowerCase() : '';
      games.push({id: hit[1] + '-' + slug(name), name, source: hit[1], dirs: [path.normalize(dir)], exes: exe && !isExcluded(exe) ? [exe] : []});
    }
  }
  return games;
}

/* ---------- all together ---------- */
const SCANNERS = {steam: scanSteam, epic: scanEpic, xbox: scanXbox, gog: scanGog, other: scanUninstall};
async function scanAll(env) {
  const found = [], errors = {};
  for (const [name, fn] of Object.entries(SCANNERS)) {
    try { found.push(...await fn(env)); } catch (e) { errors[name] = String(e && e.message || e); }
  }
  // The same folder found by two sources (for example a Steam game that also registered itself) is one game.
  const byDir = new Map();
  for (const g of found) {
    const k = (g.dirs[0] || '').toLowerCase().replace(/\\+$/, '');
    if (!k || ['c:', 'c:\\program files', 'c:\\program files (x86)'].includes(k)) continue; // never treat a whole drive as a game
    if (!byDir.has(k)) byDir.set(k, g);
  }
  return {games: [...byDir.values()].sort((a, b) => a.name.localeCompare(b.name)), errors};
}

module.exports = {parseVdf, parseRegQuery, scanSteam, scanEpic, scanXbox, scanGog, scanUninstall, scanAll, slug};
