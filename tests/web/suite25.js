// Study paths: there are no built-in courses any more; players make their own study paths (a name and a list of
// steps, each with an optional link), tick steps for XP, reorder, rename and delete them, and Home shows the next step.
const {chromium} = require('playwright'); const H = require('./harness');
const URL = H.FILE_URL;
(async () => {
  const b = await chromium.launch(); const errs = [], res = [];
  const ok = (t, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${t} ${c ? '' : x}`);
  const ctx = await b.newContext({viewport: {width: 1440, height: 950}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis|api\.github/, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('levelup-life-v1')));
  await p.goto(URL); await p.click('#guestBtn'); await p.waitForTimeout(300);

  // 1. no built-in courses; an empty study page invites you to make a path
  await p.goto(URL + '#study'); await p.waitForTimeout(200);
  const t0 = await p.textContent('#main');
  ok('the built-in Web Design and App Development courses are gone', !/Web Design|App Development|HTML foundations|React/.test(t0) && !(await p.$('[data-track]')) && !(await p.$('[data-lesson]')));
  ok('the page subtitle no longer mentions them', (await p.textContent('#pageSub')) === 'Make your own study paths and learn step by step.');
  ok('an empty Study page invites you to make your own study path', t0.includes('Make your own study path') && await p.isVisible('#newPathIn'));
  await p.fill('#taskIn', 'Read chapter 3'); await p.press('#taskIn', 'Enter'); await p.waitForTimeout(150);
  await p.goto(URL + '#youtube'); await p.waitForTimeout(150);
  const yt0 = await p.$$eval('.yt-searches .tile', a => a.map(x => x.textContent.trim()));
  ok('with no study path, YouTube suggests general learning tips (no coding courses)', yt0.length === 8 && yt0[0] === 'How to study effectively' && !yt0.some(t => /HTML|JavaScript|React|Flutter|Figma|Godot|Electron/.test(t)), yt0.join(' | '));
  await p.goto(URL + '#study'); await p.waitForTimeout(150);
  ok('study tasks work before you have made any study path', (await st()).tasks.some(x => x.text === 'Read chapter 3') && (await p.textContent('#main')).includes('Read chapter 3'));

  // 2. making a path
  await p.click('#newPathForm .btn.primary');
  ok('a path needs a name', (await p.textContent('#pathErr')).includes('Give your study path a name'));
  await p.fill('#newPathIn', '  Learn Spanish  '); await p.click('#newPathForm .btn.primary'); await p.waitForTimeout(200);
  let s = await st();
  ok('a new path is created, opened and saved', s.paths.length === 1 && s.paths[0].name === 'Learn Spanish' && s.path === s.paths[0].id && (await p.textContent('.sp-head h2')) === 'Learn Spanish');
  ok('the cursor goes straight to "add a step"', await p.evaluate(() => document.activeElement.id === 'stepIn'));

  // 3. steps, links
  await p.click('#stepForm .btn.primary');
  ok('a step needs some text', (await p.textContent('#stepErr')).includes('Type what the step is first'));
  await p.fill('#stepIn', 'Alphabet'); await p.fill('#stepUrl', 'javascript:alert(1)'); await p.click('#stepForm .btn.primary');
  ok('a javascript: link is refused', (await p.textContent('#stepErr')).includes('link does not look right') && (await st()).paths[0].steps.length === 0);
  for (const [t, u] of [['Learn the alphabet', 'duolingo.com/course'], ['100 common words', ''], ['Present tense verbs', 'https://www.spanishdict.com/guide']]) { await p.fill('#stepIn', t); await p.fill('#stepUrl', u); await p.click('#stepForm .btn.primary'); await p.waitForTimeout(120); }
  s = await st();
  ok('steps are added in order', s.paths[0].steps.map(x => x.t).join('|') === 'Learn the alphabet|100 common words|Present tense verbs');
  ok('a link without https:// gets it added; empty links stay empty', s.paths[0].steps[0].url === 'https://duolingo.com/course' && s.paths[0].steps[1].url === '');
  ok('links open in a new tab, safely', await p.getAttribute('.sp-steps a >> nth=0', 'target') === '_blank' && (await p.getAttribute('.sp-steps a >> nth=0', 'rel')).includes('noopener'));

  // 4. ticking steps: XP, minutes, progress
  const xp0 = s.xp;
  await p.check('[data-step] >> nth=0'); await p.waitForTimeout(150); await p.check('[data-step] >> nth=1'); await p.waitForTimeout(150);
  s = await st();
  ok('each finished step gives +20 XP and 20 learning minutes', s.xp === xp0 + 40 && s.log.filter(x => x.ref && x.ref.startsWith('lesson:')).length === 2, `xp ${xp0}->${s.xp}`);
  ok('progress shows "2 of 3 steps done · 67%"', (await p.textContent('.sp-head .muted')).includes('2 of 3 steps done · 67%'));
  await p.uncheck('[data-step] >> nth=1'); await p.waitForTimeout(150); s = await st();
  ok('unticking a step gives its XP and minutes back', s.xp === xp0 + 20 && s.log.filter(x => x.ref && x.ref.startsWith('lesson:')).length === 1);

  // 5. reorder
  await p.click('[data-stepdown] >> nth=0'); await p.waitForTimeout(120);
  ok('a step can move down', (await st()).paths[0].steps.map(x => x.t).join('|') === '100 common words|Learn the alphabet|Present tense verbs');
  ok('the first step cannot move up and the last cannot move down', await p.isDisabled('[data-stepup] >> nth=0') && await p.isDisabled('[data-stepdown] >> nth=2'));
  await p.click('[data-stepup] >> nth=1'); await p.waitForTimeout(120);
  ok('and back up', (await st()).paths[0].steps[0].t === 'Learn the alphabet');

  // 6. more paths, rename, duplicate names
  await p.click('#newPathBtn'); await p.fill('#newPathIn', 'learn spanish'); await p.click('#newPathForm .btn.primary');
  ok('two paths cannot have the same name (any capitals)', (await p.textContent('#pathErr')).includes('already have a study path with that name'));
  await p.fill('#newPathIn', 'Guitar'); await p.click('#newPathForm .btn.primary'); await p.waitForTimeout(150);
  const tabs = await p.$$eval('[data-path]', e => e.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')));
  ok('a second path opens and both appear as tabs', tabs.join(',') === 'Learn Spanish,Guitar*', tabs.join(','));
  await p.click('#renamePath'); await p.fill('#renameIn', 'Guitar basics'); await p.click('#renameForm .btn.primary'); await p.waitForTimeout(120);
  ok('a path can be renamed', (await p.textContent('.sp-head h2')) === 'Guitar basics' && (await st()).paths[1].name === 'Guitar basics');
  await p.click('[data-path] >> nth=0'); await p.waitForTimeout(120);
  ok('tabs switch between paths', (await p.textContent('.sp-head h2')) === 'Learn Spanish');

  // 6b. YouTube quick searches come from your study paths, then general learning tips (no coding courses)
  await p.goto(URL + '#youtube'); await p.waitForTimeout(200);
  const yt = await p.$$eval('.yt-searches .tile', a => a.map(x => ({t: x.textContent.trim(), mine: x.classList.contains('mine'), q: new URL(x.href).searchParams.get('search_query')})));
  ok('YouTube suggestions start with your next step and your study paths', yt[0].t === 'Next step: 100 common words' && yt[0].mine && yt[0].q === '100 common words Learn Spanish'
    && yt.some(x => x.t === 'Learn Spanish tutorials' && x.mine) && yt.some(x => x.t === 'Guitar basics tutorials' && x.mine), JSON.stringify(yt.slice(0, 4)));
  ok('...then general tips for learning anything, 8 in all, and no coding courses', yt.length === 8 && yt.some(x => x.t === 'How to study effectively' && !x.mine)
    && !yt.some(x => /HTML|JavaScript|React|Flutter|Figma|Godot|Electron|UI\/UX/.test(x.t)), yt.map(x => x.t).join(' | '));
  ok('they open a YouTube search in a new tab', await p.getAttribute('.yt-searches .tile >> nth=0', 'href').then(h => h.startsWith('https://www.youtube.com/results?search_query=')) && await p.getAttribute('.yt-searches .tile >> nth=0', 'target') === '_blank');

  // 7. Home shows the next step
  await p.goto(URL + '#home'); await p.waitForTimeout(250);
  const home = (await p.textContent('#main')).replace(/\s+/g, ' ');
  ok('Home "Continue learning" shows the next unfinished step of your path', /Continue learning.*100 common words.*Learn Spanish · 1 of 3 steps done/.test(home), home.slice(home.indexOf('Continue'), home.indexOf('Continue') + 160));
  ok('...with a button to the Study page (and no "Open link" for a step without a link)', await p.isVisible('#main a[href="#study"]:has-text("Study Path")') && !(await p.isVisible('#main a:has-text("Open link")')));
  await p.goto(URL + '#study'); await p.check('[data-step] >> nth=1'); await p.waitForTimeout(120); await p.goto(URL + '#home'); await p.waitForTimeout(200);
  ok('when the next step has a link, Home offers "Open link"', (await p.textContent('#main')).includes('Present tense verbs') && await p.getAttribute('#main a:has-text("Open link")', 'href') === 'https://www.spanishdict.com/guide');

  // 8. deleting a path asks first and gives back the XP of its finished steps
  await p.goto(URL + '#study'); await p.waitForTimeout(150); const xpBefore = (await st()).xp;
  await p.click('#delPath'); await p.waitForTimeout(100);
  const conf = (await p.textContent('.sp-confirm')).replace(/\s+/g, ' ');
  ok('deleting asks on the page first (no pop-up) and says what happens to the XP', conf.includes('Delete “Learn Spanish” and its 3 steps?') && conf.includes('The 2 finished steps give back their XP.'), conf);
  await p.click('.sp-confirm [data-spcancel]'); await p.waitForTimeout(100);
  ok('Cancel keeps the path', (await st()).paths.length === 2);
  await p.click('#delPath'); await p.click('#delPathYes'); await p.waitForTimeout(150); s = await st();
  ok('Delete removes it, gives back its XP and opens the other path', s.paths.length === 1 && s.paths[0].name === 'Guitar basics' && s.xp === xpBefore - 40 && !Object.keys(s.lessons).length, `xp ${xpBefore}->${s.xp}`);
  await p.fill('#stepIn', 'Chords: G, C, D'); await p.click('#stepForm .btn.primary'); await p.waitForTimeout(100); await p.check('[data-step] >> nth=0'); await p.waitForTimeout(100);
  const xp2 = (await st()).xp; await p.click('[data-delstep] >> nth=0'); await p.waitForTimeout(100); s = await st();
  ok('deleting a finished step gives its XP back (no endless XP)', s.xp === xp2 - 20 && s.paths[0].steps.length === 0);

  // 9. saved, old progress kept, challenges
  await p.reload(); await p.waitForTimeout(500); await p.goto(URL + '#study');
  ok('paths survive a reload', (await p.textContent('.sp-head h2')) === 'Guitar basics');
  await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('levelup-life-v1')); S.lessons['web.0.0'] = '2026-01-01'; S.lessons['app.1.2'] = '2026-01-02'; localStorage.setItem('levelup-life-v1', JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(400); await p.goto(URL + '#badges'); await p.waitForTimeout(250);
  ok('lessons finished in the old courses still count for the Scholar badge', /2 \/ \d+ study steps|Top rank · 2 study steps/.test(await p.textContent('.badge-tile:has-text("Scholar")')) && Object.keys((await st()).lessons).length === 2, await p.textContent('.badge-tile:has-text("Scholar")'));

  // 10. phone + German
  const ph = await (await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})).newPage(); ph.on('pageerror', e => errs.push('phone: ' + e.message));
  await ph.context().route(/fonts\.(googleapis|gstatic)|wixapis|api\.github/, r => r.abort());
  await ph.goto(URL); await ph.click('#guestBtn'); await ph.goto(URL + '#study'); await ph.fill('#newPathIn', 'Exam prep'); await ph.click('#newPathForm .btn.primary');
  for (const t of ['Chapter 1 summary with a fairly long title that has to wrap on a small phone screen', 'Practice test']) { await ph.fill('#stepIn', t); await ph.click('#stepForm .btn.primary'); await ph.waitForTimeout(80); }
  ok('on a phone: no sideways scrolling, and each step keeps its buttons on the same row', await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.sp-steps .item')].every(li => { const t = li.querySelector('.grow').getBoundingClientRect(), d = li.querySelector('[data-delstep]').getBoundingClientRect(); return Math.abs((t.top + t.bottom) / 2 - (d.top + d.bottom) / 2) < 30; })));
  await ph.evaluate(() => localStorage.setItem('levelup-lang', 'de')); await ph.reload(); await ph.waitForTimeout(500); await ph.goto(URL + '#study'); await ph.waitForTimeout(200);
  const de = await ph.textContent('#main');
  ok('the study path page is translated (German)', de.includes('Schritt hinzufügen') && de.includes('0 von 2 Schritten erledigt'), de.slice(0, 200));
  await ph.context().close();

  console.log(res.join('\n')); console.log('JS errors:', errs.length ? errs : 'none'); await b.close();
})();
