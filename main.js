// LevelUp Life desktop app: the website in a window, plus the game-time companion.
//  - On launch: a splash screen with the logo and a loading bar checks for updates (GitHub Releases, or the website's
//    update feed if GitHub has none) and installs them.
//  - Plug and play: right after installing, tracking is already on. Games are found automatically and tracked by
//    default, and the app starts with Windows (in the tray). Nothing needs setting up; an account is optional.
//  - In the background: tracks matched games, sends limit reminders and syncs with the website when connected.
//  - Always visible while running: a tray icon shows whether tracking is on. Closing the window keeps the tray icon;
//    "Quit" in the tray menu stops everything.
const {app, BrowserWindow, shell, Menu, Tray, Notification, ipcMain, dialog, powerMonitor, safeStorage, nativeImage} = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');

const {Tracker} = require('./companion/tracker');
const {JsonFileStore} = require('./companion/store');
const {CompanionService} = require('./companion/service');
const {createProcessSource, createFileSource, readReg} = require('./companion/processes');
const {scanAll} = require('./companion/scanners');
const {signIn, WixAuth, WixRemote, SITE_URL, setApiBase} = require('./companion/wix');
const {isExcluded} = require('./companion/matcher');
const core = require('./web/companion-core.js');
const {translator, LANGS} = require('./companion/i18n');
let t = s => s; // translates tray, notification and splash text into the language chosen in the app

const ICON = path.join(__dirname, 'web', 'icon.png');
const STARTUP_ARG = '--startup';
// Test hooks: only when running from source (npm start / automated tests), never in the installed app.
const TEST = !app.isPackaged ? {
  userData: process.env.LEVELUP_USER_DATA, processes: process.env.LEVELUP_FAKE_PROCESSES, api: process.env.LEVELUP_WIX_API,
  pollMs: Number(process.env.LEVELUP_POLL_MS) || 0, heartbeatMs: Number(process.env.LEVELUP_HEARTBEAT_MS) || 0, openExternal: process.env.LEVELUP_OPEN_EXTERNAL_HOOK === '1',
} : {};
if (TEST.userData) app.setPath('userData', TEST.userData);
if (TEST.api) setApiBase(TEST.api);
const launchedAtStartup = process.argv.includes(STARTUP_ARG);
let mainWin = null, splashWin = null, tray = null, service = null, tracker = null, source = null;
let splashShownAt = 0, quitting = false, updateReady = false, toldAboutTray = false, scanState = {running: false, last: 0, count: 0, errors: {}}, firstScan = null;

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => showMain());
  app.setAppUserModelId('app.levelup.life'); // needed for Windows notifications
  Menu.setApplicationMenu(null);
  app.whenReady().then(start);
}

/* ---------- start-up: splash, updates, companion, window ---------- */
async function start() {
  loadLang();
  startCompanion();
  const firstRun = firstRunSetup();
  if (!launchedAtStartup) splashWin = createSplash();
  const result = await checkForUpdates(state => splashState(state));
  if (result === 'downloaded') { // installs silently and opens the new version
    splashState({text: 'Installing update…', progress: 1});
    setTimeout(() => { quitting = true; require('electron-updater').autoUpdater.quitAndInstall(true, true); }, 700);
    return;
  }
  createTray();
  if (launchedAtStartup) notify('LevelUp Life is running', tracker.paused ? 'Game tracking is paused. Open the tray icon to resume.' : 'Game tracking is on. You can find LevelUp Life in the system tray.');
  else { splashState({text: 'Starting…', progress: 1, canSkip: false}); createMain(); }
  if (firstRun) Promise.resolve(firstScan).finally(() => notify('Game tracking is on', 'LevelUp Life finds your games and counts your play time automatically, even when the window is closed. See it in the Gaming tab.'));
  setInterval(() => checkForUpdates(() => {}, {background: true}), 6 * 60 * 60 * 1000); // look again every 6 hours
}

// The first start after installing: launching with Windows is switched on, so tracking just works from then on
// (it can be turned off in Settings or the tray menu).
function firstRunSetup() {
  const f = path.join(app.getPath('userData'), 'companion', 'first-run.json');
  if (fs.existsSync(f)) return false;
  try { fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, JSON.stringify({at: Date.now(), version: app.getVersion()})); } catch {}
  if (app.isPackaged && process.platform === 'win32') setStartup(true);
  return true;
}
function langFile() { return path.join(app.getPath('userData'), 'companion', 'lang.json'); }
function loadLang() { try { setLang(JSON.parse(fs.readFileSync(langFile(), 'utf8')).lang, false); } catch {} }
function setLang(code, save = true) {
  const lang = LANGS.includes(code) ? code : 'en';
  t = translator(lang, path.join(__dirname, 'web'));
  if (save) { try { fs.mkdirSync(path.dirname(langFile()), {recursive: true}); fs.writeFileSync(langFile(), JSON.stringify({lang})); } catch {} }
  refreshTray();
}
function createSplash() {
  const w = new BrowserWindow({width: 440, height: 340, frame: false, resizable: false, maximizable: false, fullscreenable: false, show: false, center: true,
    backgroundColor: '#06060b', title: 'LevelUp Life', icon: ICON, skipTaskbar: false, webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true}});
  w.loadFile(path.join(__dirname, 'companion', 'ui', 'splash.html'));
  w.once('ready-to-show', () => { w.show(); splashShownAt = Date.now(); splashState({version: t(`Version ${app.getVersion()}`), tag: t('Level up your day'), skip: t('Start without updating'), text: t(pendingSplash.text || 'Starting…')}); });
  w.on('closed', () => { if (splashWin === w) splashWin = null; });
  return w;
}
let pendingSplash = {};
function splashState(s) {
  if (s.text) s = {...s, text: t(s.text)};
  pendingSplash = {...pendingSplash, ...s};
  if (splashWin && !splashWin.isDestroyed() && splashWin.webContents && !splashWin.webContents.isLoading()) splashWin.webContents.executeJavaScript(`setState(${JSON.stringify(pendingSplash)})`).catch(() => {});
}

// Updates come from the latest GitHub release. If GitHub can't be reached or has no release, the website's own feed
// (SITE_URL/updates/latest.yml, which may point at an installer hosted anywhere) is tried instead.
const UPDATE_FEEDS = [{provider: 'github', owner: 'wanling326002-cmd', repo: 'levelup-life'}, {provider: 'generic', url: SITE_URL + 'updates/'}];
// Resolves 'none' | 'downloaded' | 'skipped' | 'error' | 'dev'. Never blocks start-up for long without a way out.
function checkForUpdates(show, {background = false} = {}) {
  if (!app.isPackaged || process.env.LEVELUP_NO_UPDATES) return Promise.resolve('dev');
  const {autoUpdater} = require('electron-updater');
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.removeAllListeners();
  return new Promise(resolve => {
    let settled = false, skipTimer = null, checking = true;
    const done = v => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(skipTimer); if (splashWin) splashWin.removeAllListeners('page-title-updated'); resolve(v); };
    const timer = setTimeout(() => done('timeout'), 12000); // slow or no internet: start anyway
    if (splashWin) splashWin.on('page-title-updated', (_e, t) => { if (t === 'skip') done('skipped'); });
    autoUpdater.on('checking-for-update', () => show({text: 'Checking for updates…', progress: null}));
    autoUpdater.on('update-not-available', () => done('none'));
    autoUpdater.on('error', () => { if (!checking) done('error'); }); // errors while checking: try the next feed
    autoUpdater.on('update-available', info => {
      clearTimeout(timer);
      show({text: `Downloading update ${info.version}…`, progress: 0});
      skipTimer = setTimeout(() => show({canSkip: true}), 20000); // a slow download can be skipped; it installs on the next quit
    });
    autoUpdater.on('download-progress', p => show({text: `Downloading update… ${Math.round(p.percent || 0)}%`, progress: (p.percent || 0) / 100}));
    autoUpdater.on('update-downloaded', () => {
      if (background) { updateReady = true; refreshTray(); notify('Update ready', 'A new version of LevelUp Life will be installed the next time it starts. Use "Restart to update" in the tray to do it now.'); }
      done('downloaded');
    });
    (async () => {
      for (const feed of UPDATE_FEEDS) {
        if (settled) return;
        try { autoUpdater.setFeedURL(feed); const r = await autoUpdater.checkForUpdates(); checking = false; if (r || settled) return; } catch { /* next feed */ }
      }
      checking = false; done('error');
    })();
  }).then(r => (background && r === 'downloaded') ? 'ready' : r);
}

function createMain() {
  mainWin = new BrowserWindow({
    width: 1440, height: 920, minWidth: 380, minHeight: 600, show: false,
    backgroundColor: '#06060b', title: 'LevelUp Life', autoHideMenuBar: true, icon: ICON,
    webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js')},
  });
  mainWin.loadFile(path.join(__dirname, 'web', 'index.html'));
  mainWin.once('ready-to-show', () => {
    const wait = Math.max(0, splashShownAt + 900 - Date.now()); // the splash stays at least 0.9 s, so it never just flashes
    setTimeout(() => { mainWin.show(); if (splashWin) { splashWin.close(); splashWin = null; } }, wait);
  });
  // Open external links (lessons, YouTube, charities, the website) in the user's normal browser.
  mainWin.webContents.setWindowOpenHandler(({url}) => { if (/^https?:/.test(url)) shell.openExternal(url); return {action: 'deny'}; });
  mainWin.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  mainWin.on('close', e => { // keep tracking in the tray, and say so
    if (quitting) return;
    e.preventDefault(); mainWin.hide();
    if (!toldAboutTray) { toldAboutTray = true; notify('Still tracking in the tray', tracker.paused ? 'Tracking is paused. Right-click the LevelUp Life tray icon to resume or quit.' : 'LevelUp Life keeps tracking your games. Right-click the tray icon to pause or quit.'); }
  });
  mainWin.on('closed', () => { mainWin = null; });
}
function showMain() {
  if (!mainWin) createMain();
  else { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
}

/* ---------- the companion ---------- */
function startCompanion() {
  const dir = path.join(app.getPath('userData'), 'companion');
  const store = new JsonFileStore(dir);
  source = TEST.processes ? createFileSource(TEST.processes) : createProcessSource();
  tracker = new Tracker({clock: {now: () => Date.now()}, source, store, newId: () => crypto.randomUUID(), systemTz: Intl.DateTimeFormat().resolvedOptions().timeZone});
  if (TEST.pollMs) tracker.state.settings.pollMs = TEST.pollMs;
  service = new CompanionService({
    tracker, clock: {now: () => Date.now()}, notify,
    secrets: secretStore(dir), deviceId: deviceId(dir), deviceName: os.hostname(), appVersion: app.getVersion(),
    remoteFor: (refreshToken, onRefreshToken) => new WixRemote({auth: new WixAuth({refreshToken, onRefreshToken})}),
    ...(TEST.heartbeatMs ? {heartbeatMs: TEST.heartbeatMs} : {}),
    onStatus: () => { refreshTray(); push(); },
  });
  tracker.onChange = () => { refreshTray(); push(); };
  service.start();
  setInterval(() => { refreshTray(); push(); }, 5000);
  firstScan = rescan(); setInterval(rescan, 6 * 60 * 60 * 1000);
  powerMonitor.on('suspend', () => tracker.suspend());
  powerMonitor.on('resume', () => tracker.resume());
  powerMonitor.on('shutdown', () => tracker.suspend());
}
async function rescan() {
  if (process.platform !== 'win32' || scanState.running) return scanState;
  scanState.running = true; push();
  try {
    const env = {fs, readReg, drives: driveLetters(), programData: process.env.ProgramData || 'C:\\ProgramData', programFilesX86: process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'};
    const r = await scanAll(env);
    scanState.count = service.mergeScan(r.games); scanState.errors = r.errors; scanState.last = Date.now();
  } finally { scanState.running = false; push(); }
  return scanState;
}
function driveLetters() { const out = []; for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':'; try { fs.accessSync(d + '\\'); out.push(d); } catch {} } return out; }
function deviceId(dir) {
  const f = path.join(dir, 'device.json');
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (/^[0-9a-f]{24}$/.test(j.id)) return j.id; } catch {}
  const id = crypto.randomBytes(12).toString('hex'); fs.writeFileSync(f, JSON.stringify({id})); return id;
}
// The website sign-in is kept encrypted with Windows' own protection for the signed-in Windows user (DPAPI, via
// Electron safeStorage). If that isn't available, it is kept in memory only and never written in plain text.
function secretStore(dir) {
  const f = path.join(dir, 'auth.bin'); let memory = null;
  return {
    load() { try { if (!safeStorage.isEncryptionAvailable()) return memory; return JSON.parse(safeStorage.decryptString(fs.readFileSync(f))); } catch { return memory; } },
    save(v) { memory = v; try { if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(f, safeStorage.encryptString(JSON.stringify(v))); } catch {} },
    clear() { memory = null; try { fs.rmSync(f, {force: true}); } catch {} },
  };
}

function notify(title, body) {
  title = t(title); body = t(body);
  if (!app.isPackaged) (global.__levelupNotes ||= []).push({title, body, at: Date.now()}); // lets automated tests check reminders
  if (!Notification.isSupported()) return;
  const n = new Notification({title, body, icon: ICON, silent: false});
  n.on('click', () => showMain());
  n.show();
}

/* ---------- tray: always shows whether tracking is on ---------- */
function statusLine() {
  if (!tracker) return t('Starting…');
  const s = tracker.snapshot();
  if (s.paused) return t('Tracking paused');
  if (s.playing.length) return t('Tracking on · {s}').replace('{s}', s.playing.map(p => `${p.name} ${core.fmtDuration(p.sessionMs)}`).join(', '));
  return t('Tracking on · no game running');
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({width: 32, height: 32}));
  tray.on('click', () => showMain());
  refreshTray();
}
function refreshTray() {
  if (!tray) return;
  const s = tracker.snapshot(), st = service.status;
  const sync = t(st.state === 'connected' ? 'Connected to your account' : st.state === 'offline' ? 'Offline: will sync later' : st.state === 'signedOut' ? 'Sign-in expired: connect again' : 'Not connected (this PC only)');
  tray.setToolTip(`LevelUp Life\n${statusLine()}\n${t('Today: {s}').replace('{s}', core.fmtDuration(s.todayMs) + (s.overall.hasLimit ? ' / ' + core.fmtDuration(s.overall.limitMs) : ''))}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label: 'LevelUp Life', enabled: false},
    {label: statusLine(), enabled: false},
    {label: sync, enabled: false},
    {type: 'separator'},
    {label: t('Open LevelUp Life'), click: () => showMain()},
    {label: t(s.paused ? 'Resume tracking' : 'Pause tracking'), click: () => { service.tracker.setPaused(!s.paused); service.syncSoon(500); refreshTray(); push(); }},
    {label: t('Launch at Windows startup'), type: 'checkbox', checked: startupOn(), click: i => setStartup(i.checked)},
    ...(updateReady ? [{label: t('Restart to update'), click: () => { quitting = true; require('electron-updater').autoUpdater.quitAndInstall(true, true); }}] : []),
    {type: 'separator'},
    {label: t('Quit (stops tracking)'), click: () => { quitting = true; app.quit(); }},
  ]));
}
const startupOn = () => app.getLoginItemSettings({args: [STARTUP_ARG]}).openAtLogin;
function setStartup(on) { app.setLoginItemSettings({openAtLogin: !!on, args: [STARTUP_ARG]}); refreshTray(); push(); }

/* ---------- what the app's Companion page sees ---------- */
function payload() {
  const snap = tracker.snapshot();
  return {
    snap, status: service.status, version: app.getVersion(), startup: startupOn(), updateReady,
    device: {name: os.hostname()}, processReader: source.kind, scan: {...scanState},
    settings: {tz: tracker.state.settings.tz, systemTz: tracker.systemTz, overallLimitMin: tracker.state.settings.overallLimitMin, notify: tracker.state.settings.notify},
    games: tracker.games.filter(g => !g.deleted).map(g => ({id: g.id, name: g.name, source: g.source, enabled: g.enabled !== false, limitMin: g.limitMin || 0, exes: g.exes || [], files: (g.paths || []).length, folders: (g.dirs || []).length})),
  };
}
let pushTimer = null;
function push() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => { pushTimer = null; if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) mainWin.webContents.send('cmp:update', payload()); }, 300);
}

const handle = (name, fn) => ipcMain.handle('cmp:' + name, async (e, ...args) => {
  if (!mainWin || e.sender !== mainWin.webContents) throw new Error('not allowed'); // only the app's own window
  return fn(...args);
});
handle('snapshot', () => payload());
handle('setLang', code => { setLang(String(code)); return true; });
handle('setPaused', p => { tracker.setPaused(!!p); service.syncSoon(500); refreshTray(); return payload(); });
handle('editGame', (id, patch) => { service.editGame(String(id), patch && typeof patch === 'object' ? patch : {}); return payload(); });
handle('removeGame', id => { service.removeGame(String(id)); return payload(); });
handle('setSettings', s => {
  const p = {};
  if (s && 'overallLimitMin' in s) p.overallLimitMin = s.overallLimitMin;
  if (s && 'tz' in s) p.tz = typeof s.tz === 'string' ? s.tz : '';
  if (s && 'notify' in s) p.notify = !!s.notify;
  service.setSettings(p); return payload();
});
handle('setStartup', on => { setStartup(!!on); return payload(); });
handle('rescan', async () => { await rescan(); return payload(); });
handle('addGameFromFile', async () => {
  const r = await dialog.showOpenDialog(mainWin, {title: t("Choose the game's program (.exe)"), properties: ['openFile', 'multiSelections'], filters: [{name: t('Programs'), extensions: ['exe']}]});
  if (r.canceled || !r.filePaths.length) return {payload: payload(), added: null};
  const files = r.filePaths, first = path.win32.basename(files[0]).replace(/\.exe$/i, '');
  const g = {id: 'm-' + crypto.randomUUID(), name: first, source: 'manual', enabled: true, limitMin: 0, paths: files, exes: files.map(f => path.win32.basename(f).toLowerCase()), dirs: []};
  service.addGame(g);
  return {payload: payload(), added: {id: g.id, name: g.name, warning: files.some(f => isExcluded(path.win32.basename(f))) ? 'This looks like a launcher or helper. It will be counted because you chose it.' : ''}};
});
handle('listRunning', async () => { // stays on this PC: shown in the "running programs" picker only
  const list = await source.list().catch(() => []);
  const seen = new Set(), out = [];
  for (const p of list) {
    const k = (p.name + '|' + (p.path || '')).toLowerCase();
    if (seen.has(k) || /^c:\\windows\\/i.test(p.path || '') || !/\.exe$/i.test(p.name)) continue;
    seen.add(k); out.push({name: p.name, path: p.path || '', helper: isExcluded(p.name)});
  }
  return out.sort((a, b) => a.helper - b.helper || a.name.localeCompare(b.name));
});
handle('addGameFromProcess', (proc, name) => {
  if (!proc || typeof proc.name !== 'string' || !/\.exe$/i.test(proc.name)) throw new Error('Pick a program from the list.');
  const g = {id: 'm-' + crypto.randomUUID(), name: (name || proc.name.replace(/\.exe$/i, '')).slice(0, 80), source: 'manual', enabled: true, limitMin: 0,
    exes: [proc.name.toLowerCase()], paths: proc.path ? [String(proc.path)] : [], dirs: []};
  service.addGame(g); return {payload: payload(), added: {id: g.id, name: g.name}};
});
handle('addExeToGame', async id => {
  const g = tracker.games.find(x => x.id === String(id)); if (!g) return payload();
  const r = await dialog.showOpenDialog(mainWin, {title: t('Add another program for {s}').replace('{s}', g.name), properties: ['openFile', 'multiSelections'], filters: [{name: t('Programs'), extensions: ['exe']}]});
  if (!r.canceled && r.filePaths.length) service.addGame({...g, paths: [...new Set([...(g.paths || []), ...r.filePaths])], exes: [...new Set([...(g.exes || []), ...r.filePaths.map(f => path.win32.basename(f).toLowerCase())])]});
  return payload();
});
handle('connect', async () => {
  // (in tests the "browser" is a plain request to the address the sign-in page would return to)
  const open = TEST.openExternal ? async url => { const u = new URL(url); setTimeout(() => fetch(`${u.searchParams.get('redirectUri')}?code=TESTCODE&state=${u.searchParams.get('state')}`).catch(() => {}), 50); } : url => shell.openExternal(url);
  const member = await service.connect(() => signIn({openExternal: open}));
  showMain(); return {payload: payload(), member};
});
handle('disconnect', async () => { await service.disconnect(); return payload(); });
handle('deleteHistory', async online => { await service.deleteHistory({online: !!online}); return payload(); });
handle('openWebsite', hash => shell.openExternal(SITE_URL + (hash ? '#' + String(hash).replace(/[^a-z0-9-]/gi, '') : '')));

/* ---------- quitting: end open sessions where they were last seen and try one last upload ---------- */
let finalSyncDone = false;
app.on('before-quit', e => {
  quitting = true;
  if (finalSyncDone || !service) return;
  e.preventDefault(); finalSyncDone = true;
  service.stop(); tracker.suspend();
  Promise.race([service.cycle(), new Promise(r => setTimeout(r, 3000))]).finally(() => app.quit());
});
app.on('window-all-closed', () => { /* keep running in the tray */ });
