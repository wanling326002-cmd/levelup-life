// Teal paper theme (look adapted from the "Teal Treasury Landing" template): cream paper with deep-teal ink by
// default, a deep-teal night theme on the moon/sun switch, Inter Tight, theme-aware charts/buttons, no old purple.
const {chromium} = require('playwright'); const H = require('./harness');
const URL = H.FILE_URL;
(async () => {
  const b = await chromium.launch(); const errs = [], res = [];
  const ok = (t, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${t} ${c ? '' : x}`);
  const ctx = await b.newContext({viewport: {width: 1440, height: 900}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis|api\.github/, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('levelup-life-v1')));
  const look = () => p.evaluate(() => ({theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily}));

  // 1. a new player gets the cream paper look and the Inter Tight font
  await p.goto(URL); await p.click('#guestBtn'); await p.waitForTimeout(400);
  let l = await look();
  ok('a new player starts on the cream paper look', l.theme === 'light' && l.bg === 'rgb(245, 244, 238)' && (await st()).theme === 'light', JSON.stringify(l));
  ok('the page uses the Inter Tight font, and it loads', l.font.includes('Inter Tight') && await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Inter Tight' && f.status === 'loaded'); }), l.font);
  ok('the main button is deep teal with white text', await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.btn.primary')); return s.backgroundColor === 'rgb(15, 50, 56)' && s.color === 'rgb(255, 255, 255)'; }));

  // 2. the moon/sun switch gives the deep-teal night theme and it is remembered
  await p.click('#themeBtn'); await p.waitForTimeout(200); await p.reload(); await p.waitForTimeout(400); l = await look();
  ok('the switch gives the deep-teal night theme, and it is still there after a reload', l.theme === 'dark' && l.bg === 'rgb(7, 28, 32)' && (await st()).theme === 'dark', JSON.stringify(l));
  ok('at night the main button is lilac with dark ink', await p.evaluate(() => getComputedStyle(document.querySelector('.btn.primary')).backgroundColor === 'rgb(205, 200, 246)'));

  // 3. someone who used the old dark look gets the new paper look once; after that their choice is kept
  await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('levelup-life-v1')); S.theme = 'dark'; delete S.look; localStorage.setItem('levelup-life-v1', JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(400);
  ok('an existing player who had the old dark look is moved to the new paper look once', (await look()).theme === 'light');
  await p.click('#themeBtn'); await p.waitForTimeout(200); await p.reload(); await p.waitForTimeout(400);
  ok('and after that, choosing night mode sticks', (await look()).theme === 'dark');
  await p.click('#themeBtn'); await p.waitForTimeout(200);

  // 4. charts and the focus ring follow the theme; no old purple anywhere
  await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('levelup-life-v1')); const day = i => { const x = new Date(Date.now() - i * 864e5); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    S.log = [0, 1, 2].map(i => ({d: day(i), cat: 'learn', m: 30})); S.paths = [{id:'p', name:'Spanish', steps:[]}]; localStorage.setItem('levelup-life-v1', JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(400);
  ok('the 7-day chart lines use the theme colours (deep teal for learning on paper)', await p.evaluate(() => getComputedStyle(document.querySelector('.chart path')).stroke === 'rgb(15, 50, 56)'));
  await p.goto(URL + '#focus'); await p.waitForTimeout(250);
  ok('the focus timer ring goes from deep teal to olive gold', await p.evaluate(() => { const s = document.querySelectorAll('#tg stop'); return getComputedStyle(s[0]).stopColor === 'rgb(15, 50, 56)' && getComputedStyle(s[1]).stopColor === 'rgb(140, 123, 51)'; }));
  const purple = [];
  for (const r of ['home', 'study', 'focus', 'gaming', 'badges', 'options', 'chat', 'players']) {
    await p.goto(URL + '#' + r); await p.waitForTimeout(250);
    purple.push(...await p.evaluate(r => { const bad = c => (c.match(/rgba?\([^)]+\)/g) || []).some(x => /rgba?\((124, 93, 255|111, 78, 246|79, 49, 214|154, 123, 255|139, 92, 246)/.test(x));
      return [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.backgroundImage, s.borderTopColor, s.boxShadow].some(bad); }).map(e => `#${r} ${e.className}`).slice(0, 3); }, r));
  }
  ok('none of the old purple colours are left on any page', !purple.length, purple.join(' | '));
  ok('the logo is the new deep-teal mark', (await (await p.request.get(URL.replace('app.html', 'icon.svg'))).text()).includes('#0f3238'));

  console.log(res.join('\n')); console.log('JS errors:', errs.length ? errs : 'none'); await b.close();
})();
