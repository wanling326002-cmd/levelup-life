// The Download app button under the profile: where the download comes from (downloads.json, then the latest GitHub
// release, else "coming soon"), the SmartScreen message next to it, the web-app option, no old install buttons,
// keyboard and Escape, phone layout and accessibility.
const {chromium} = require('playwright'); const fs = require('fs'); const {spawn} = require('child_process');
const H = require('./harness'); const D = H.OUT;
const SITE = D + 'served22/'; H.copySite(SITE);
fs.writeFileSync(SITE + 'downloads.json', JSON.stringify({github: 'wanling326002-cmd/levelup-life', windows: {url: '', version: '', size: 0, all: ''}})); // start with nothing published
const PORT = 8773, BASE = `http://localhost:${PORT}/app.html`; // the app (the front page is the landing page)
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, [H.SERVE, SITE, String(PORT)], {stdio: 'ignore'}); process.on('exit', () => srv.kill()); await sleep(600);
  const b = await chromium.launch(); const res = [], errs = [];
  const ok = (t, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${t} ${c ? '' : x}`);
  let github = {status: 404, body: {message: 'Not Found'}}, ghCalls = 0;
  const open = async (opts = {}) => {
    const ctx = await b.newContext({viewport: opts.viewport || {width: 1440, height: 950}, userAgent: opts.ua || WIN_UA, serviceWorkers: 'block', ...(opts.mobile ? {isMobile: true, hasTouch: true} : {})});
    await ctx.route('https://api.github.com/**', r => { ghCalls++; r.fulfill({status: github.status, headers: {'content-type': 'application/json', 'access-control-allow-origin': '*'}, body: JSON.stringify(github.body)}); });
    await ctx.route(/wixapis\.com|wix\.com/, r => r.fulfill({status: 404, body: '{}', headers: {'access-control-allow-origin': '*'}}));
    if (opts.installed) await ctx.addInitScript(() => { // the website opened as an installed app (display-mode: standalone)
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? {matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}} : mm(q);
    });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE); await p.click('#guestBtn'); await p.waitForTimeout(200);
    return p;
  };
  const panelText = async p => (await p.textContent('#dlPanel')).replace(/\s+/g, ' ');

  // 1. nothing published yet: "coming soon", never a broken link
  let p = await open();
  const pr = await p.$eval('.profile', e => e.getBoundingClientRect().toJSON()), dr = await p.$eval('#dlBtn', e => e.getBoundingClientRect().toJSON());
  ok('the Download app button sits right under the profile button', dr.top >= pr.bottom && dr.top - pr.bottom < 16 && Math.abs((dr.left + dr.right) / 2 - (pr.left + pr.right) / 2) < 30, JSON.stringify({pr, dr}));
  ok('the button says what it is', (await p.textContent('#dlBtn')).includes('Download app') && (await p.getAttribute('#dlBtn', 'aria-expanded')) === 'false');
  await p.click('#dlBtn');
  await p.waitForFunction(() => document.querySelector('#dlPanel') && !document.querySelector('#dlPanel').hidden && /Coming soon|Download for Windows/.test(document.querySelector('#dlPanel').textContent));
  let t = await panelText(p);
  ok('with no release anywhere, the panel says "coming soon" and has no download link', t.includes('Coming soon') && !(await p.$('#dlGo')), t.slice(0, 200));
  ok('the SmartScreen message is right next to the download', t.includes('Windows protected your PC') && t.includes('More info') && t.includes('Run anyway') && t.includes('code-signed'));
  ok('the panel explains what the app does, and that there is no setup', t.includes('tracks your play time automatically') && t.includes('No setup needed'));
  ok('the panel also offers the web app for phones and Macs', t.includes('On a phone, tablet, Mac or Chromebook?'));
  ok('the button reports the panel is open', (await p.getAttribute('#dlBtn', 'aria-expanded')) === 'true');
  await p.keyboard.press('Escape');
  ok('Escape closes the panel and returns focus to the button', await p.$eval('#dlPanel', e => e.hidden) && await p.evaluate(() => document.activeElement.id === 'dlBtn'));
  await p.click('#dlBtn'); await p.waitForTimeout(150); await p.click('.pagehead');
  ok('clicking elsewhere closes the panel', await p.$eval('#dlPanel', e => e.hidden));

  // 2. no old download or install buttons anywhere on the website
  await p.goto(BASE + '#options'); await p.waitForTimeout(300);
  ok('Settings has no install card any more', !(await p.$('#installBtn')) && !(await p.textContent('#main')).includes('To install: in Chrome'));
  // Settings are listed like an account settings page: header, grouped menu on the left, every setting on the right
  const menu = await p.$$eval('.set-nav [data-setsec]', bs => bs.map(b => b.textContent.trim()));
  ok('Settings has a header with the profile and a grouped menu on the left', await p.isVisible('.set-head .set-av') && (await p.textContent('.set-head')).includes('Guest profile on this device')
    && JSON.stringify(menu) === JSON.stringify(['Public profile', 'Account', 'Appearance', 'Healthy habits', 'Owner or admin key', 'Your data']) && (await p.textContent('.set-nav h2')) === 'Access & data', JSON.stringify(menu));
  const nav = await p.$eval('.set-nav', e => e.getBoundingClientRect().toJSON()), main = await p.$eval('.set-main', e => e.getBoundingClientRect().toJSON());
  ok('the menu is on the left and the settings on the right', nav.right <= main.left && nav.width > 150);
  ok('every setting is still there', ['#stName', '#stLang', '#stTheme', '#stSeason', '#stThumbs', '#stNotify', '#stBreak', '#stEp', '#stExport', '#stImport', '#stWipe', '#ownForm'].every(Boolean) && (await p.$$eval('#stName, #stLang, #stTheme, #stSeason, #stThumbs, #stNotify, #stBreak, #stEp, #stExport, #stImport, #stWipe, #ownForm', els => els.length)) === 12);
  await p.click('[data-setsec="data"]'); await p.waitForTimeout(1200);
  ok('a menu item jumps to its section and is marked as current', (await p.getAttribute('[data-setsec="data"]', 'aria-current')) === 'true' && await p.evaluate(() => { const r = document.getElementById('set-data').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 100; }));
  await p.mouse.move(700, 600); await p.mouse.wheel(0, -20000); await p.waitForTimeout(900);
  ok('scrolling back up marks the first section again', (await p.getAttribute('[data-setsec="profile"]', 'aria-current')) === 'true');
  await p.goto(BASE + '#help'); await p.waitForTimeout(300);
  ok('Help has no "Install the app" button, and points to the Download app button', !(await p.textContent('#main')).includes('Install the app') && (await p.textContent('#main')).includes('Download app button'));
  await p.goto(BASE + '#companion'); await p.waitForTimeout(800);
  t = (await p.textContent('#main')).replace(/\s+/g, ' ');
  ok('the Game Time setup has no download buttons and points to the Download app button', !(await p.$('#main a[href*="github.com"]')) && !t.includes('All versions') && t.includes('Download app') && t.includes('Run anyway'));
  await p.goto(BASE + '#home'); await p.waitForTimeout(200);
  await p.keyboard.press('Control+k'); await p.fill('#paletteInput', 'download the app'); await p.waitForTimeout(150); await p.keyboard.press('Enter');
  ok('search (Ctrl+K) can open the download panel', !!await p.waitForFunction(() => !document.querySelector('#dlPanel').hidden, null, {timeout: 3000}).catch(() => null));
  await p.context().close();

  // 3. the latest GitHub release is found automatically (fixed-name installer preferred)
  github = {status: 200, body: {tag_name: 'v1.2.0', html_url: 'https://github.com/wanling326002-cmd/levelup-life/releases/tag/v1.2.0', assets: [
    {name: 'LevelUp-Life-Setup-1.2.0.exe', size: 1, browser_download_url: 'https://github.com/x/y/releases/download/v1.2.0/LevelUp-Life-Setup-1.2.0.exe'},
    {name: 'LevelUp-Life-Setup.exe', size: 88080384, browser_download_url: 'https://github.com/wanling326002-cmd/levelup-life/releases/download/v1.2.0/LevelUp-Life-Setup.exe'}]}};
  p = await open();
  await p.click('#dlBtn'); await p.waitForSelector('#dlGo');
  t = await panelText(p);
  ok('a published GitHub release is used without changing the website', (await p.getAttribute('#dlGo', 'href')).endsWith('/v1.2.0/LevelUp-Life-Setup.exe') && t.includes('1.2.0') && t.includes('84 MB') && t.includes('All versions'), t.slice(0, 300));
  ok('on Windows the Windows download comes first', await p.evaluate(() => { const s = [...document.querySelectorAll('#dlPanel h3')].map(h => h.textContent); return s[0] === 'LevelUp Life for Windows'; }));
  ok('focus moves into the panel, onto the download', await p.evaluate(() => document.activeElement && document.activeElement.id === 'dlGo'));
  await p.addScriptTag({path: H.AXE});
  const v = await p.evaluate(async () => (await axe.run(document.querySelector('#dlPanel'), {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa']}})).violations.map(x => x.id));
  ok('no accessibility problems in the panel', v.length === 0, v.join(', '));
  await p.screenshot({path: D + 'download-panel.png'});
  await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await p.screenshot({path: D + 'download-panel-light.png'});
  await p.context().close();

  // 4. downloads.json on the website wins (installer hosted anywhere), and the answer is remembered for the visit
  fs.writeFileSync(SITE + 'downloads.json', JSON.stringify({github: 'wanling326002-cmd/levelup-life', windows: {url: 'https://files.example.com/LevelUp-Life-Setup.exe', version: '1.2.1', size: 90000000}}));
  ghCalls = 0; p = await open();
  await p.click('#dlBtn'); await p.waitForSelector('#dlGo');
  ok('an installer address in downloads.json is used first (no GitHub needed)', (await p.getAttribute('#dlGo', 'href')) === 'https://files.example.com/LevelUp-Life-Setup.exe' && ghCalls === 0 && (await panelText(p)).includes('1.2.1'));
  github = {status: 404, body: {}}; // no GitHub release: the zip from downloads.json is used
  fs.writeFileSync(SITE + 'downloads.json', JSON.stringify({windows: {url: 'https://static.wixstatic.com/archives/abc_123.zip', version: '1.2.0', size: 82619492}}));
  await p.evaluate(() => sessionStorage.clear()); await p.reload(); await p.click('#guestBtn').catch(() => {});
  await p.click('#dlBtn'); await p.waitForSelector('#dlGo');
  t = await panelText(p);
  ok('a .zip download explains each step, including the "How do you want to open this .zip file?" question', (await p.getAttribute('#dlGo', 'href')).endsWith('.zip') && t.includes('How do you want to open this .zip file?') && t.includes('Windows Explorer') && t.includes('Double-click LevelUp-Life-Setup.exe'), t.slice(0, 400));
  await p.keyboard.press('Escape');
  github = {status: 200, body: {tag_name: 'v1.2.1', html_url: 'https://github.com/x/y/releases/tag/v1.2.1', assets: [{name: 'LevelUp-Life-Setup.exe', size: 82914619, browser_download_url: 'https://github.com/x/y/releases/download/v1.2.1/LevelUp-Life-Setup.exe'}]}};
  await p.evaluate(() => sessionStorage.clear()); await p.reload(); await p.click('#guestBtn').catch(() => {});
  await p.click('#dlBtn'); await p.waitForSelector('#dlGo');
  ok('a direct .exe on GitHub is offered instead of the .zip when there is one', (await p.getAttribute('#dlGo', 'href')).endsWith('/LevelUp-Life-Setup.exe') && !(await p.$('.dl-steps')));
  github = {status: 404, body: {}};
  await p.keyboard.press('Escape');
  fs.writeFileSync(SITE + 'downloads.json', JSON.stringify({windows: {url: 'javascript:alert(1)'}}));
  await p.evaluate(() => sessionStorage.clear()); await p.reload(); await p.click('#guestBtn').catch(() => {});
  await p.click('#dlBtn'); await p.waitForFunction(() => /Coming soon|Download for Windows/.test(document.querySelector('#dlPanel').textContent));
  ok('anything but an https address is ignored', !(await p.$('#dlPanel a[href^="javascript"]')));
  await p.context().close();

  // 4b. the website installed as an app: no Download app button and no search entry for it
  p = await open({installed: true});
  ok('the installed web app has no Download app button', !(await p.isVisible('#dlBtn')));
  ok('...and none in the phone More sheet either', await p.evaluate(() => document.querySelector('#sheetDl').hidden));
  await p.keyboard.press('Control+k'); await p.fill('#paletteInput', 'download the app'); await p.waitForTimeout(150);
  ok('the installed web app does not offer the download in search', !(await p.textContent('#paletteList')).includes('Download the app'));
  await p.context().close();

  // 5. on an iPhone: Download app lives in the More sheet (not the header), web app first, panel fits the screen
  github = {status: 404, body: {}};
  p = await open({viewport: {width: 390, height: 664}, ua: IPHONE_UA, mobile: true});
  ok('on a phone the header has no Download button (it is in the More sheet)', !(await p.isVisible('#dlBtn')));
  await p.click('#moreBtn'); await p.click('#sheetDl'); await p.waitForFunction(() => /Coming soon|Download for Windows/.test(document.querySelector('#dlPanel').textContent));
  const box = await p.$eval('#dlPanel', e => e.getBoundingClientRect().toJSON());
  t = await panelText(p);
  ok('Download app in the More sheet opens the panel, closes the sheet, and the panel fits on screen', await p.isHidden('#sheet') && box.left >= 0 && box.right <= 390 && box.top >= 0 && box.bottom <= 664, JSON.stringify(box));
  ok('on an iPhone the web app comes first, with the Add to Home Screen steps', t.indexOf('On a phone') < t.indexOf('LevelUp Life for Windows') && t.includes('Add to Home Screen'));
  ok('no sideways scrolling on a phone', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({path: D + 'download-phone.png'});
  await p.context().close();

  console.log(res.join('\n')); console.log('JS errors:', errs.length ? errs : 'none');
  await b.close(); srv.kill();
})().catch(e => { console.log('CRASH:', e && e.stack || e); process.exit(1); });
