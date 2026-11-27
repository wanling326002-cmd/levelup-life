// Starting tab: a reload (or "Reload" on the update bar) always opens Home, even when the address still ends in
// another tab such as #companion. A link that opens a tab on purpose still goes there, and changing the language
// keeps you on Settings.
const {chromium} = require('playwright'); const H = require('./harness');
const URL = H.FILE_URL;
(async () => {
  const b = await chromium.launch(); const errs = [], res = [];
  const ok = (t, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${t} ${c ? '' : x}`);
  const ctx = await b.newContext({viewport: {width: 1440, height: 950}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis|api\.github/, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const title = () => p.textContent('#pageTitle');
  await p.goto(URL); await p.click('#guestBtn'); await p.waitForTimeout(300);

  // 1. reload on Game Time -> Home
  await p.goto(URL + '#companion'); await p.waitForTimeout(250);
  ok('Game Time opens from its tab', (await title()) === 'Game Time', await title());
  await p.reload(); await p.waitForTimeout(500);
  ok('reloading on Game Time opens Home', (await title()) === 'Home' && !(await p.evaluate(() => location.hash)), `${await title()} ${await p.evaluate(() => location.hash)}`);
  ok('Home is marked as the active tab', await p.getAttribute('#nav [data-route="home"]', 'aria-current') === 'page');
  await p.click('#nav [data-route="study"]'); await p.waitForTimeout(200);
  ok('the tabs still work after that reload', (await title()) === 'Study Path' && (await p.evaluate(() => location.hash)) === '#study');

  // 2. the same for other tabs
  for (const r of ['study', 'badges', 'options']) {
    await p.goto(URL + '#' + r); await p.waitForTimeout(150); await p.reload(); await p.waitForTimeout(400);
    ok(`reloading on #${r} opens Home`, (await title()) === 'Home', await title());
  }

  // 3. "Reload" on the update bar
  await p.goto(URL + '#companion'); await p.waitForTimeout(200);
  await p.evaluate(() => { document.querySelector('#updateBar').hidden = false; });
  await Promise.all([p.waitForNavigation(), p.click('#updateBtn')]); await p.waitForTimeout(500);
  ok('"Reload" on the update bar opens Home', (await title()) === 'Home', await title());

  // 4. a link that opens a tab on purpose (like "Open on the website" in the Windows app)
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(URL + '#companion'); await p2.waitForTimeout(500);
  ok('a link straight to Game Time still opens Game Time', (await p2.textContent('#pageTitle')) === 'Game Time', await p2.textContent('#pageTitle'));
  await p2.close();

  // 5. changing the language reloads but keeps you on Settings, and the next reload goes Home again
  await p.goto(URL + '#options'); await p.waitForTimeout(250);
  await Promise.all([p.waitForNavigation(), p.selectOption('#stLang', 'de')]); await p.waitForTimeout(700);
  ok('changing the language keeps you on Settings', (await title()) === 'Einstellungen', await title());
  await p.reload(); await p.waitForTimeout(500);
  ok('a normal reload after that opens Home again', (await title()) === 'Start' || (await p.evaluate(() => !location.hash)), await title());
  await p.evaluate(() => localStorage.setItem('levelup-lang', 'en'));

  console.log(res.join('\n')); console.log('JS errors:', errs.length ? errs : 'none'); await b.close();
})();
