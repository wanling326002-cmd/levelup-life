// The offline helper (service worker) must leave Wix's own addresses alone. Wix's sign-in page lives on the
// website's own address (/_api/oauth2/authorize); an older helper answered every page with the saved home page,
// so "Continue with Google or Wix" showed LevelUp Life without its design instead of Wix's sign-in page.
// This runs with the service worker ON, as for someone who has opened the website before.
const {chromium} = require('playwright'); const fs = require('fs'); const {spawn, execFileSync} = require('child_process');
const H = require('./harness'); const D = H.OUT;
const SITE = D + 'served24/'; H.copySite(SITE);
const PORT = 8776, BASE = `http://localhost:${PORT}/`;
const NEW_SW = fs.readFileSync(SITE + 'levelup-sw.js', 'utf8');
let OLD_SW = ''; try { OLD_SW = execFileSync('git', ['show', '3b532b0:web/levelup-sw.js'], {cwd: H.ROOT, encoding: 'utf8'}); } catch {}
// stand-ins for Wix's pages on the website's address
fs.mkdirSync(SITE + '_api/oauth2', {recursive: true}); fs.mkdirSync(SITE + '__auth', {recursive: true});
fs.writeFileSync(SITE + '_api/oauth2/authorize.html', '<title>Wix sign in</title><h1 id="wixLogin">Log in with Google</h1>');
fs.writeFileSync(SITE + '__auth/loginv2.html', '<p>wix login part</p>');
const hdr = {'access-control-allow-origin': '*', 'content-type': 'application/json'};

(async () => {
  const srv = spawn('node', [H.SERVE, SITE, String(PORT)]); process.on('exit', () => srv.kill());
  process.on('uncaughtException', e => { console.log('CRASH:', e.message.split('\n')[0]); srv.kill(); process.exit(1); });
  await new Promise(r => srv.stdout.once('data', r));
  const b = await chromium.launch(); const res = []; const errs = [];
  const ok = (t, c, x = '') => { const l = `${c ? 'PASS' : 'FAIL'}  ${t} ${c ? '' : x}`; res.push(l); console.log(l); };
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.route(/wixapis\.com|api\.github\.com/, r => r.fulfill({status: 404, headers: hdr, body: '{}'}));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const controlled = async () => { await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, {timeout: 10000}).catch(() => {});
    if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) { await p.reload(); await p.waitForTimeout(800); } };
  const wixPage = async path => { await p.goto(BASE + path); await p.waitForTimeout(300); return {wix: await p.isVisible('#wixLogin'), ours: (await p.title()).includes('LevelUp Life'), text: (await p.textContent('body')).slice(0, 80)}; };

  // 1. someone who visited before the fix: the old helper reproduces the bug
  if (OLD_SW) {
    fs.writeFileSync(SITE + 'levelup-sw.js', OLD_SW);
    await p.goto(BASE); await controlled();
    const r = await wixPage('_api/oauth2/authorize.html?state=abc');
    ok('(before the fix) the old helper answers Wix\'s sign-in address with LevelUp Life', r.ours && !r.wix, JSON.stringify(r));
    // 2. the fixed helper arrives on their next visit and takes over by itself
    fs.writeFileSync(SITE + 'levelup-sw.js', NEW_SW);
    await p.goto(BASE);
    for (let i = 0; i < 60; i++) { // the browser checks for a new helper on each visit; it takes over in a moment
      if (await p.evaluate(async () => { const k = await caches.keys(); const r = await navigator.serviceWorker.getRegistration();
        return k.includes('levelup-shell-v2') && !k.includes('levelup-shell-v1') && !!r.active && r.active.state === 'activated' && !r.installing && !r.waiting; }).catch(() => false)) break;
      await p.waitForTimeout(250); }
    ok('a returning visitor gets the fixed helper, and the old saved copy is removed', await p.evaluate(async () => { const k = await caches.keys(); return k.includes('levelup-shell-v2') && !k.includes('levelup-shell-v1'); }), JSON.stringify(await p.evaluate(() => caches.keys())));
  } else { await p.goto(BASE); await controlled(); }
  await controlled();
  ok('the offline helper is running', await p.evaluate(() => !!navigator.serviceWorker.controller));

  // 3. Wix's own addresses reach Wix
  let r = await wixPage('_api/oauth2/authorize.html?lang=en&state=abc');
  ok('"Continue with Google or Wix": Wix\'s sign-in page shows, not LevelUp Life', r.wix && !r.ours, JSON.stringify(r));
  r = await wixPage('_api/oauth2/authorize?lang=en&state=abc');
  ok('the exact sign-in address goes to the website host, not the saved home page', !r.ours, JSON.stringify(r));
  r = await wixPage('some/unknown/page');
  ok('an unknown page is not answered with a broken copy of the home page', !r.ours, JSON.stringify(r));
  await p.goto(BASE); await p.waitForTimeout(400);
  const fetched = await p.evaluate(async () => { await fetch('__auth/loginv2.html'); await fetch('_api/oauth2/authorize.html'); await new Promise(r => setTimeout(r, 300));
    const c = await caches.open('levelup-shell-v2'); return (await c.keys()).map(q => new URL(q.url).pathname); });
  ok('nothing from Wix\'s addresses is saved by the helper', !fetched.some(x => /\/_/.test(x)), fetched.join(','));

  // 4. the app itself still opens instantly and offline
  await p.goto(BASE + '#study'); await p.waitForTimeout(500);
  await ctx.setOffline(true);
  await p.goto(BASE + '#settings').catch(() => {}); await p.waitForTimeout(800);
  ok('the app still opens with no internet', (await p.title()).includes('LevelUp Life') && await p.isVisible('#main'));
  ok('and it is styled (its design loaded)', await p.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Outfit') || getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  await p.goto(BASE + 'index.html').catch(() => {}); await p.waitForTimeout(500);
  ok('index.html opens offline too', (await p.title()).includes('LevelUp Life'));
  await ctx.setOffline(false);

  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.kill();
  const bad = res.filter(l => l.startsWith('FAIL')).length; console.log(`\n${res.length - bad}/${res.length} passed`); process.exit(bad ? 1 : 0);
})();
