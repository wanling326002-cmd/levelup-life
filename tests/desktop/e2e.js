// End-to-end test of the desktop app (Electron), driven by Playwright.
// Uses the test hooks that only work when running from source: a fake process list (a JSON file), a fake Wix server,
// a separate data folder and short timers. Runs on Windows directly, or on Linux under a virtual display (xvfb-run).
// Usage: node tests/desktop/e2e.js
'use strict';
const {_electron: electron} = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const {startMockWix} = require('./mock-wix');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.env.LEVELUP_TEST_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-desktop-out-'));
const results = [];
const ok = (name, cond, extra = '') => { results.push(cond); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${cond ? '' : extra}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 250) { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await fn(); if (v) return v; } catch {} await sleep(step); } return v; }

(async () => {
  const wix = await startMockWix();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-desktop-'));
  const procsFile = path.join(userData, 'processes.json');
  const setProcs = list => fs.writeFileSync(procsFile, JSON.stringify(list));
  const GAME = {pid: 4242, name: 'MyGame.exe', path: 'D:\\Games\\MyGame\\MyGame.exe'};
  const LAUNCHER = {pid: 77, name: 'EpicGamesLauncher.exe', path: 'C:\\Program Files (x86)\\Epic Games\\Launcher\\EpicGamesLauncher.exe'};
  setProcs([LAUNCHER, {pid: 5, name: 'notepad.exe', path: 'C:\\Windows\\notepad.exe'}]);

  const launch = () => electron.launch({
    executablePath: require(path.join(ROOT, 'node_modules', 'electron')),
    args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: {...process.env, LEVELUP_USER_DATA: userData, LEVELUP_FAKE_PROCESSES: procsFile, LEVELUP_WIX_API: wix.url,
      LEVELUP_POLL_MS: '1000', LEVELUP_HEARTBEAT_MS: '2000', LEVELUP_OPEN_EXTERNAL_HOOK: '1'},
  });
  const mainOf = async app => until(() => app.windows().find(w => /web\/index\.html/.test(w.url().replace(/\\/g, '/'))), 20000);
  const notes = app => app.evaluate(() => global.__levelupNotes || []);
  const text = async (p, sel = '#main') => (await p.textContent(sel)).replace(/\s+/g, ' ');

  let app = await launch();
  const errs = [];
  // splash
  await app.firstWindow();
  const splash = await until(() => app.windows().find(w => /splash\.html$/.test(w.url())), 5000, 50); // shown for at least 0.9 s
  await splash.waitForLoadState('domcontentloaded');
  const sp = {url: splash.url(), logo: await splash.isVisible('img.logo').catch(e => e.message), h1: await splash.textContent('h1').catch(e => e.message), bar: await splash.isVisible('#bar').catch(e => e.message)};
  ok('a splash screen opens first, with the logo, the name and a loading bar',
    /splash\.html$/.test(splash.url()) && await splash.isVisible('img.logo') && (await splash.textContent('h1')) === 'LevelUp Life' && await splash.isVisible('#bar'), JSON.stringify(sp));
  await splash.screenshot({path: path.join(OUT, 'splash.png')}).catch(() => {});
  let win = await mainOf(app);
  win.on('pageerror', e => errs.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  await until(() => win.isVisible('#guestBtn').catch(() => false), 8000);
  if (await win.isVisible('#guestBtn')) await win.click('#guestBtn');
  ok('the splash closes once the app window is ready', await until(() => app.windows().length === 1, 8000));

  // plug and play: no Game Time tab and no download button in the app; tracking is built into Gaming and Settings
  ok('the app has no Game Time tab and no download button', !(await win.$('#nav [data-route="companion"], #navMoreMenu [data-route="companion"]')) && !(await win.$('#dlBtn')) && !(await win.$('#sheetGrid a[href="#companion"]')));
  ok('on the first start, a notification says game tracking is already on', !!await until(async () => (await notes(app)).some(n => n.title === 'Game tracking is on'), 8000));
  await win.evaluate(() => { location.hash = '#companion'; }); // an old link to the Game Time tab
  ok('an old link to the Game Time tab opens Gaming', !!await until(() => win.evaluate(() => location.hash === '#gaming'), 5000));
  await until(async () => (await text(win)).includes('Tracking on'));
  let t = await text(win);
  ok('the Gaming tab shows tracking is on and that this PC is not connected', t.includes('Tracking on') && t.includes('Not connected: this PC only') && t.includes('Tracked games'));
  ok('the tray menu is available while the app runs', await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().length >= 1));

  // add a game from the running programs list
  await win.click('#gtAddProc');
  await until(() => win.isVisible('.gt-picker'));
  t = await text(win, '.gt-picker');
  ok('the running-programs picker lists programs and marks launchers, without Windows system programs',
    t.includes('MyGame.exe') === false && t.includes('EpicGamesLauncher.exe') && t.includes('launcher or helper') && !t.includes('notepad.exe'));
  setProcs([LAUNCHER, GAME]);
  await win.click('#gtPickCancel'); await win.click('#gtAddProc');
  await until(async () => (await text(win, '.gt-picker')).includes('MyGame.exe'));
  await win.fill('#gtPickName', 'My Game');
  const idx = await win.$$eval('.gt-picker li', lis => lis.findIndex(li => li.textContent.includes('MyGame.exe')));
  await win.click(`[data-gtpick="${idx}"]`);
  await until(async () => (await text(win, '.gt-games')).includes('My Game'));
  ok('a running program can be added as a game with its own name', (await text(win, '.gt-games')).includes('My Game'));

  // it is tracked while it runs
  await until(async () => (await win.$('.gt-playing')) && (await text(win, '.gt-playing')).includes('My Game'), 8000);
  const c1 = await win.textContent('.gt-clock'); await sleep(2200); const c2 = await win.textContent('.gt-clock');
  ok('the game shows as playing with a running session clock', c1 !== c2 && /^00:00:\d\d$/.test(c2), `${c1} -> ${c2}`);
  ok('the launcher running at the same time is not counted', (await app.evaluate(() => 0)) === 0 && !(await text(win, '.gt-games')).includes('Epic'));

  // a 1-minute limit: "Daily limit reached" and exactly one notification (no 30/10-minute warnings for a 1-minute limit)
  const gid = await win.getAttribute('[data-gtlimit]', 'data-gtlimit');
  await win.fill(`[data-gtlimit="${gid}"]`, '1'); await win.press(`[data-gtlimit="${gid}"]`, 'Tab');
  ok('reaching the limit shows "Daily limit reached" and keeps counting', !!await until(async () => (await text(win)).includes('Daily limit reached'), 75000, 1000));
  const n1 = (await notes(app)).filter(n => n.title === 'Daily limit reached');
  ok('one "Daily limit reached" reminder, and no 30 or 10 minute reminders for a 1-minute limit', n1.length === 1 && !(await notes(app)).some(n => /minutes left/.test(n.title)), JSON.stringify(await notes(app)));
  await sleep(2500);
  ok('the reminder is not repeated', (await notes(app)).filter(n => n.title === 'Daily limit reached').length === 1);
  ok('the game is still running and counting (reminders only)', (await text(win, '.gt-games')).includes('overtime'));
  ok('tracked minutes count in the Gaming and Balance stats too', !!await until(() => win.evaluate(() => Object.keys(localStorage).some(k => { try { return (JSON.parse(localStorage.getItem(k)).log || []).some(e => e.ref && e.ref.startsWith('gt:') && e.g === 'My Game' && e.m >= 1); } catch { return false; } })), 8000));
  ok('the app stays on the same page while it updates (no jumping or reloads)', await win.evaluate(() => location.hash === '#gaming'));

  // pause / resume
  await win.click('#gtPause');
  ok('pausing shows "Tracking paused" and stops the session', !!await until(async () => (await text(win)).includes('Tracking paused') && !(await win.$('.gt-playing'))));
  await win.click('#gtPause');
  ok('resuming shows "Tracking on" again', !!await until(async () => (await text(win)).includes('Tracking on')));

  // settings live in Settings; the Balance gaming limit is the same as the app's overall limit
  await win.evaluate(() => { location.hash = '#options'; });
  await until(async () => (await text(win)).includes('Game tracking'));
  ok('Settings has the game tracking settings, without any install or download buttons', (await text(win)).includes('Launch at Windows startup') && !(await win.$('#installBtn')) && !/Install app|Download for Windows/.test(await text(win)));
  ok('the overall daily limit starts as the Balance gaming limit', !!await until(async () => (await win.inputValue('#gtOverall')) === '120', 8000));
  await win.evaluate(() => { location.hash = '#balance'; });
  await win.fill('[data-goal="play"]', '90'); await win.press('[data-goal="play"]', 'Tab');
  await win.evaluate(() => { location.hash = '#options'; });
  ok('changing the gaming limit in Balance changes the app\'s daily limit', !!await until(async () => (await win.inputValue('#gtOverall')) === '90', 8000));

  // connect to the (fake) website
  await win.click('#gtConnect');
  ok('connecting signs in through the browser page and shows the account', !!await until(async () => (await text(win)).includes('player@example.com'), 20000));
  ok('the PC checks in with what is playing', !!await until(() => { const d = [...wix.state.devices.values()][0]; return d && JSON.parse(d.data.playing || '[]').some(p => p.name === 'My Game'); }, 10000));
  ok('sessions are uploaded', !!await until(() => [...wix.state.sessions.values()].some(s => s.data.name === 'My Game'), 10000));
  const cfgItem = await until(() => [...wix.state.config.values()][0], 10000);
  const cfgText = cfgItem ? cfgItem.data.data : '';
  ok('settings are shared without folders or full paths', cfgText.includes('My Game') && !cfgText.includes('D:\\\\Games') && !/"paths"|"dirs"/.test(cfgText), cfgText.slice(0, 200));
  const sent = JSON.stringify(wix.state.calls.map(c => c.body));
  ok('no other program names ever leave the PC', !/notepad|EpicGamesLauncher/i.test(sent));

  // a limit changed on the website reaches the PC
  await win.evaluate(() => { location.hash = '#gaming'; });
  const cfg = JSON.parse(cfgItem.data.data); const g = cfg.games.find(x => x.name === 'My Game'); g.limitMin = 45; g.editedAt = Date.now() + 1000;
  cfgItem.data.data = JSON.stringify(cfg); cfgItem.data.updatedAt = Date.now();
  ok('a limit changed on the website reaches the PC', !!await until(async () => (await win.inputValue(`[data-gtlimit="${gid}"]`)) === '45', 12000));

  // the game closes
  setProcs([LAUNCHER]);
  ok('closing the game ends the session', !!await until(async () => !(await win.$('.gt-playing')), 8000));
  ok('the closed session is uploaded as closed', !!await until(() => [...wix.state.sessions.values()].filter(s => s.data.name === 'My Game').every(s => s.data.open === false), 10000));

  // disconnected from the website
  await win.evaluate(() => { location.hash = '#options'; });
  const dev = [...wix.state.devices.values()][0]; dev.data.revoked = true;
  ok('a disconnect from the website is noticed and explained', !!await until(async () => (await text(win)).includes('disconnected from the website'), 12000));
  ok('the user is told with a notification', (await notes(app)).some(n => n.title === 'Disconnected'));

  // accessibility of the pages with game tracking
  await win.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
  const axeRun = () => win.evaluate(async () => { // first let the cards finish fading in: half-faded text is not what people read
    for (let i = 0; i < 40 && document.getAnimations().some(x => x.playState === 'running'); i++) await new Promise(r => setTimeout(r, 50));
    return (await axe.run(document.querySelector('#main'), {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa']}, resultTypes: ['violations']})).violations.map(x => `${x.id} [${x.nodes.slice(0, 3).map(n => n.target.join(' ') + (n.any[0] && n.any[0].data && n.any[0].data.contrastRatio ? ` ${n.any[0].data.contrastRatio} ${n.any[0].data.fgColor}/${n.any[0].data.bgColor}` : '')).join('; ')}]`); }); // which element and colours, so a failure can be fixed from the log
  let v = await axeRun();
  await win.screenshot({path: path.join(OUT, 'desktop-settings.png'), fullPage: true});
  await win.evaluate(() => { location.hash = '#gaming'; }); await until(async () => (await text(win)).includes('Tracked games'));
  v = v.concat(await axeRun());
  ok('no accessibility problems on the desktop Gaming and Settings pages', v.length === 0, v.join(', '));
  await win.screenshot({path: path.join(OUT, 'desktop-gaming.png'), fullPage: true});

  // closing the window keeps the app (and tracking) running in the tray
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].close());
  await sleep(800);
  ok('closing the window keeps the app running in the tray, and says so', await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().length === 1 && !BrowserWindow.getAllWindows()[0].isVisible()) && (await notes(app)).some(n => /tray/i.test(n.title)));
  await app.close();

  // restart: history and games are still there
  app = await launch();
  win = await mainOf(app);
  await win.waitForLoadState('domcontentloaded'); await sleep(1200);
  await win.evaluate(() => { location.hash = '#gaming'; });
  await until(async () => (await text(win)).includes('My Game'));
  t = await text(win);
  ok('the "tracking is on" welcome is only shown on the first start', !(await notes(app)).some(n => n.title === 'Game tracking is on'));
  ok('after a restart the game, its limit and today\'s time are still there', t.includes('My Game') && (await win.inputValue(`[data-gtlimit="${gid}"]`)) === '45' && !/Played today 0m/.test(t));
  await app.close();

  ok('the app reports its own version', (await (async () => { const a2 = await launch(); const v = await a2.evaluate(({app}) => app.getVersion()); await a2.close(); return v; })()) === require(path.join(ROOT, 'package.json')).version);
  ok('no errors in the app page', errs.length === 0, errs.join(' | '));
  wix.close();
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} desktop checks passed${failed ? '' : ''}. Screenshots: ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('CRASH:', e && e.stack || e); process.exit(1); });
