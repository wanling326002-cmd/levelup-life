// Design pass (UI/UX audit): Home shows the player's level as a HUD ring, streaks use an SVG flame instead of
// the emoji, phone controls are at least 44px tall, small badge text is readable and text colours pass WCAG AA.
const {chromium} = require('playwright'); const H = require('./harness');
const URL = H.FILE_URL;
const lum = rgb => { const c = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(x => +x / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
(async () => {
  const b = await chromium.launch(); const errs = [], res = [];
  const ok = (t, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${t} ${c ? '' : x}`);
  const seed = async (p, extra = {}) => { await p.goto(URL); await p.click('#guestBtn'); await p.waitForTimeout(300);
    await p.evaluate(x => { const S = JSON.parse(localStorage.getItem('levelup-life-v1')); S.xp = 2350; S.paths = [{id:'p', name:'Spanish', steps:[{id:'a', t:'Numbers', url:'https://example.com'}]}]; S.path = 'p'; Object.assign(S, x); localStorage.setItem('levelup-life-v1', JSON.stringify(S)); }, extra);
    await p.reload(); await p.waitForTimeout(400); };

  // 1. Home HUD
  const ctx = await b.newContext({viewport: {width: 1440, height: 950}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis|api\.github/, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await seed(p);
  ok('Home shows the level in a ring with the XP still needed', (await p.textContent('.hud-ring b')) === '11' && (await p.textContent('.hud-t b')) === '125 XP to level 12', await p.textContent('.hud-t b'));
  ok('the ring fills with the share of XP towards the next level, and says so to screen readers',
    (await p.getAttribute('.hud-ring', 'style')).includes('--p:64') && (await p.getAttribute('.hud-ring', 'aria-label')) === 'Level 11, 64% of the way to level 12');
  ok('the day stats are still there next to it', (await p.$$('.home-greet .statrow .stat')).length === 4);
  ok('streaks use the SVG flame, not the emoji', !(await p.textContent('#main')).includes('🔥') && (await p.$$('#main .flame svg')).length >= 1);
  const hudBox = await p.evaluate(() => { const h = document.querySelector('.hud').getBoundingClientRect(), s = document.querySelector('.home-greet .statrow').getBoundingClientRect(); return h.right <= s.left + 1 && Math.abs((h.top + h.bottom) / 2 - (s.top + s.bottom) / 2) < 40; });
  ok('on a computer the level sits to the left of the day stats', hudBox);

  // 2. colours pass WCAG AA (4.5:1) in both themes
  for (const theme of ['dark', 'light']) {
    await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); await p.waitForTimeout(100);
    const c = await p.evaluate(() => { const probe = (v, bg) => { const d = document.createElement('span'); d.style.color = `var(${v})`; document.querySelector('.card').append(d); const r = getComputedStyle(d).color; d.remove(); return r; };
      return {card: getComputedStyle(document.querySelector('.card')).backgroundColor, dim: probe('--dim'), muted: probe('--muted'), ok: probe('--ok'), bad: probe('--bad'), warn: probe('--warn')}; });
    const low = ['dim', 'muted', 'ok', 'bad', 'warn'].filter(k => ratio(c[k], c.card) < 4.5).map(k => `${k} ${ratio(c[k], c.card).toFixed(2)}`);
    ok(`${theme} mode: grey and status text colours pass 4.5:1 on cards`, !low.length, low.join(', '));
  }
  await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });

  // 3. badge text no smaller than 12px, sentence case
  await p.goto(URL + '#badges'); await p.waitForTimeout(300);
  const bt = await p.evaluate(() => [...document.querySelectorAll('.badge-tile .tier, .badge-tile .medal .num')].map(e => [parseFloat(getComputedStyle(e).fontSize), getComputedStyle(e).textTransform]));
  ok('badge ranks and numbers are at least 12px and not in capitals', bt.length && bt.every(([f, t]) => f >= 12 && t !== 'uppercase'), JSON.stringify(bt.slice(0, 3)));

  // 4. touch screens: controls at least 44px
  const ph = await (await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})).newPage(); ph.on('pageerror', e => errs.push('phone: ' + e.message));
  await ph.context().route(/fonts\.(googleapis|gstatic)|wixapis|api\.github/, r => r.abort());
  await seed(ph, {tasks: [{id:'t', text:'Read', done:false}], series: [{id:'s', title:'Arcane', season:1, ep:1, status:'watching'}]});
  const small = [];
  for (const r of ['home', 'study', 'focus', 'series', 'gaming']) {
    await ph.goto(URL + '#' + r); await ph.waitForTimeout(250);
    small.push(...await ph.evaluate(r => [...document.querySelectorAll('#main .btn, #main .iconbtn, #main .chip, #main .seg button, #main select')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
      .filter(e => e.getBoundingClientRect().height < 43.5).map(e => `#${r} ${e.className || e.tagName} ${Math.round(e.getBoundingClientRect().height)}`), r));
  }
  ok('on a phone every button, icon button, chip, tab and dropdown is at least 44px tall', !small.length, small.slice(0, 6).join(' | '));
  await ph.goto(URL + '#home'); await ph.waitForTimeout(250);
  ok('on a phone the level ring sits above the day stats', await ph.evaluate(() => { const h = document.querySelector('.hud').getBoundingClientRect(), s = document.querySelector('.home-greet .statrow').getBoundingClientRect(); return h.bottom <= s.top + 1 && document.documentElement.scrollWidth <= innerWidth; }).catch(() => false));
  const pc = await (await b.newContext({viewport: {width: 1440, height: 900}})).newPage(); await pc.context().route(/fonts\.(googleapis|gstatic)|wixapis|api\.github/, r => r.abort());
  await seed(pc); await pc.goto(URL + '#study'); await pc.waitForTimeout(250);
  ok('with a mouse, buttons keep their compact size', (await pc.evaluate(() => document.querySelector('#newPathBtn').getBoundingClientRect().height)) < 40);

  console.log(res.join('\n')); console.log('JS errors:', errs.length ? errs : 'none'); await b.close();
})();
