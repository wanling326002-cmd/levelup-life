// The sidebar (the "Dashboard Sidebar" component from 21st.dev): every page, grouped, with the current one marked. It works
// with the mouse and the keyboard, opens the search, shows red dots where something waits, and can be hidden.
const {chromium}=require('playwright');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${c?'':x}`);
 const ctx=await b.newContext({viewport:{width:1440,height:900}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis/,r=>r.abort());
 const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
 await p.goto(URL); await p.click('#guestBtn'); await p.waitForSelector('#nav [data-route="home"]'); await p.waitForTimeout(200);
 const cur=()=>p.$$eval('#nav [aria-current="page"]',a=>a.map(x=>x.dataset.route));

 // 1. every page, main pages first, in labelled groups; settings and help at the bottom; the player at the top
 const r=await p.$$eval('#nav [data-route]',a=>a.map(x=>x.dataset.route));
 ok('the sidebar lists Search and every page, the main pages first', r.join()==='search,home,study,focus,gaming,chat,series,youtube,companion,balance,messages,players,impact,badges', r.join());
 const navText=await p.textContent('#nav');
 ok('...in groups labelled Track, Community and You', ['Track','Community','You'].every(w=>navText.includes(w)));
 const bottom=await p.$$eval('#sideRoot [data-route]',a=>a.filter(x=>!x.closest('#nav')).map(x=>x.dataset.route));
 ok('Settings, Help and Sign in sit at the bottom', bottom.join()==='options,help,signin', bottom.join());
 const top=await p.textContent('#sideRoot button[aria-haspopup="menu"]');
 ok('the switcher at the top shows the player and their level', top.includes('Player') && top.includes('Level 1'), top);
 ok('Home is marked as the current page', (await cur()).join()==='home');

 // 2. choosing pages: real links, one current page, shortcuts move the mark too
 ok('pages are real links (they work with the keyboard and screen readers)', await p.$$eval('#nav [data-route]:not([data-route="search"])',a=>a.every(x=>x.tagName==='A'&&x.getAttribute('href')==='#'+x.dataset.route)));
 await p.click('#nav [data-route="players"]'); await p.waitForTimeout(400);
 ok('choosing Players opens it and marks it as the current page', (await p.textContent('#pageTitle'))==='Players' && (await cur()).join()==='players' && await p.evaluate(()=>document.querySelector('#nav [data-route="players"]').classList.contains('active')));
 await p.keyboard.press('8'); await p.waitForTimeout(300);
 ok('keyboard shortcuts move the mark too (8 = Help the World)', (await p.textContent('#pageTitle'))==='Help the World' && (await cur()).join()==='impact');
 ok('the breadcrumb at the top shows the page', (await p.textContent('#crumb'))==='Impact');
 await p.focus('#nav [data-route="focus"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
 ok('Enter on a focused page opens it', (await p.textContent('#pageTitle'))==='Focus');

 // 3. Search in the sidebar opens the app's search
 await p.click('#nav [data-route="search"]'); await p.waitForTimeout(150);
 ok('Search in the sidebar opens the search', await p.isVisible('#palette'));
 await p.keyboard.press('Escape'); await p.waitForTimeout(100);

 // 4. red dots
 const dot=(on,title)=>p.evaluate(([on,title])=>window.dispatchEvent(new CustomEvent('lu:shell',{detail:{...window.__luShell,dots:{players:{on,title}}}})),[on,title]); // what the app sends (suites 13, 14 and 17 check the real friend-request dots)
 await dot(true,'Players · 1 friend request'); await p.waitForTimeout(150);
 ok('a red dot shows on Players when something is waiting, with a label', await p.evaluate(()=>{const a=document.querySelector('#nav [data-route="players"]');return a.classList.contains('has-req')&&!!a.querySelector('[aria-label="Players · 1 friend request"]');}));
 await dot(false,''); await p.waitForTimeout(150);
 ok('...and goes away with it', !(await p.$('#nav [data-route="players"].has-req')));

 // 5. hiding the sidebar
 await p.click('#sideToggle'); await p.waitForTimeout(450);
 ok('the button at the top left hides the sidebar', !(await p.isVisible('#nav [data-route="home"]')) && (await p.getAttribute('#sideToggle','aria-expanded'))==='false');
 await p.reload(); await p.waitForTimeout(600);
 ok('it stays hidden after a reload', await p.evaluate(()=>document.querySelector('.frame').classList.contains('side-off')));
 await p.click('#sideToggle'); await p.waitForTimeout(450);
 ok('and the same button shows it again', await p.isVisible('#nav [data-route="home"]') && (await p.getAttribute('#sideToggle','aria-expanded'))==='true');

 // 6. narrower computer screens: everything fits, and the sidebar stays put while the page scrolls
 await p.setViewportSize({width:900,height:700}); await p.goto(URL+'#privacy'); await p.waitForTimeout(400);
 ok('at 900px the page has no sideways scrolling', await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.screenshot({path:D+'shots2/sidebar-900.png'});
 await p.mouse.move(700,400); await p.mouse.wheel(0,400); await p.waitForTimeout(300);
 ok('the sidebar stays in view while the page scrolls', (await p.evaluate(()=>scrollY))>0 && await p.evaluate(()=>Math.round(document.querySelector('#sideRoot').getBoundingClientRect().top)===0));

 // 7. Home for a brand-new player: a short "Start here" list, no empty chart, no row of zeros, no empty "Up next", no tile grid
 await p.setViewportSize({width:1440,height:900});
 const p2=await (await b.newContext({viewport:{width:1440,height:900}})).newPage(); p2.on('pageerror',e=>errs.push(e.message));
 await p2.context().route(/fonts\.(googleapis|gstatic)|wixapis/,r=>r.abort());
 await p2.goto(URL); await p2.click('#guestBtn'); await p2.waitForTimeout(400);
 const home=()=>p2.evaluate(()=>({start:document.querySelectorAll('.start-step').length, chart:!!document.querySelector('#main .spark'), stats:!!document.querySelector('#main .statrow'),
   upNext:[...document.querySelectorAll('#main .card-h h2')].some(h=>h.textContent==='Up next'), tiles:!!document.querySelector('#main .tiles'), text:document.querySelector('#main').textContent}));
 let h=await home();
 ok('a new player sees three "Start here" steps', h.start===3 && h.text.includes('Pick one to get started'), JSON.stringify({...h,text:''}));
 ok('...and no empty chart, no row of zeros and no empty "Up next"', !h.chart && !h.stats && !h.upNext && !h.text.includes('No series in progress'));
 ok('the "Programs" tile grid is gone from Home', !h.tiles && !h.text.includes('Programs'));
 await p2.click('.start-step[href="#gaming"]'); await p2.waitForTimeout(300);
 ok('a step opens its page', (await p2.textContent('#pageTitle'))==='Gaming');
 await p2.fill('#gGame','Test Game'); await p2.click('#gGo'); await p2.waitForTimeout(1100); await p2.click('#gGo'); await p2.waitForTimeout(300);
 await p2.click('#nav [data-route="home"]'); await p2.waitForTimeout(300); h=await home();
 ok('after the first session Home shows today\'s numbers instead of the steps', h.start===0 && h.stats && !h.chart, JSON.stringify({...h,text:''}));
 ok('the 7-day chart waits until there are 2 days to draw', !h.chart);
 await p2.evaluate(()=>{ const k=Object.keys(localStorage).find(x=>{try{return Array.isArray(JSON.parse(localStorage.getItem(x)).log);}catch{return false;}});
   const s=JSON.parse(localStorage.getItem(k)); const d=new Date(Date.now()-864e5); const day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
   s.log.push({d:day,cat:'learn',m:30}); s.backlog=[{id:'g1',title:'Hollow Test',status:'playing',platform:'PC'}]; localStorage.setItem(k,JSON.stringify(s)); });
 await p2.reload(); await p2.waitForTimeout(600); h=await home();
 ok('with 2 days of activity the chart appears', h.chart && h.stats, JSON.stringify({...h,text:''}));
 ok('"Up next" shows only the rows that have something in them', h.upNext && h.text.includes('Hollow Test') && !h.text.includes('No series in progress') && !h.text.includes('No saved videos'));

 // 7. the header: a labelled light / dark button and a tidy Download link under the profile
 ok('it shows a sun in light mode (the paper look everyone starts on)', await p2.isVisible('#themeBtn .sun') && !(await p2.isVisible('#themeBtn .moon')));
 const t1=await p2.getAttribute('#themeBtn','title'); await p2.click('#themeBtn'); await p2.waitForTimeout(150);
 const t2=await p2.getAttribute('#themeBtn','title'), darkNow=await p2.evaluate(()=>document.documentElement.dataset.theme);
 ok('the light / dark button says what it does and switches the theme', t1==='Switch to dark mode' && t2==='Switch to light mode' && darkNow==='dark', `${t1} | ${t2} | ${darkNow}`);
 await p2.click('#themeBtn');
 const row=await p2.evaluate(()=>{const c=el=>{const r=document.querySelector(el).getBoundingClientRect();return Math.round(r.top+r.height/2);};return {bell:c('#bellBtn'),theme:c('#themeBtn'),profile:c('.profile'),settings:c('.topbar a.round[href="#options"]')};});
 ok('the bell, light / dark button, profile and settings line up in one row', new Set(Object.values(row)).size===1, JSON.stringify(row));
 ok('Download app sits in the header row, just left of the profile', await p2.evaluate(()=>{const pr=document.querySelector('.profile').getBoundingClientRect(),d=document.querySelector('#dlBtn').getBoundingClientRect();return d.right<=pr.left&&pr.left-d.right<12&&Math.abs((d.top+d.bottom)/2-(pr.top+pr.bottom)/2)<2;}));
 await p2.screenshot({path:D+'shots2/home-new-header.png',clip:{x:0,y:0,width:1440,height:240}});
 await p2.context().close();

 // 8. phones keep the bottom bar; the desktop list never shows there
 await p.setViewportSize({width:390,height:844}); await p.goto(URL+'#home'); await p.waitForTimeout(300);
 ok('on a phone the sidebar is hidden (the bottom bar is used)', !(await p.isVisible('#sideRoot')) && await p.isVisible('#bottomnav'));

 // 9. phones: a lighter header (Search and Download app are in the More sheet) and pop-ups that don't cover the bottom bar
 const ph=await (await b.newContext({viewport:{width:390,height:664},isMobile:true,hasTouch:true})).newPage(); ph.on('pageerror',e=>errs.push(e.message));
 await ph.context().route(/fonts\.(googleapis|gstatic)|wixapis/,r=>r.abort());
 await ph.goto(URL); await ph.click('#guestBtn'); await ph.waitForTimeout(200);
 const tb=await ph.evaluate(()=>{const t=document.querySelector('#toast'),n=document.querySelector('#bottomnav').getBoundingClientRect(),r=t.getBoundingClientRect();return {show:t.classList.contains('show'),bottom:Math.round(r.bottom),navTop:Math.round(n.top),left:Math.round(r.left),right:Math.round(r.right)};});
 ok('a pop-up message on a phone sits above the bottom bar, not on top of it', tb.show && tb.bottom<=tb.navTop-8 && tb.left>=0 && tb.right<=390, JSON.stringify(tb));
 const vis=await ph.evaluate(()=>[...document.querySelectorAll('.topbar > *, .topbar .me-stack > *')].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none'&&e.offsetWidth).map(e=>e.id||e.className.split(' ')[0]));
 ok('the phone header keeps only the logo, bell, profile and settings', !vis.includes('searchBtn') && !vis.includes('dlBtn') && vis.includes('brand') && vis.includes('bellBtn') && vis.includes('profile'), vis.join());
 await ph.click('#moreBtn'); await ph.waitForTimeout(200);
 const sh=await ph.evaluate(()=>{const b=document.querySelector('.sheet-box').getBoundingClientRect();return {top:Math.round(b.top),bottom:Math.round(b.bottom),vh:innerHeight};});
 ok('the More sheet fits on a short phone screen', sh.top>=0 && sh.bottom<=sh.vh, JSON.stringify(sh));
 ok('the More sheet starts with Search and Download app', await ph.isVisible('#sheetSearch') && await ph.isVisible('#sheetDl'));
 await ph.click('#sheetSearch'); await ph.waitForTimeout(200);
 ok('Search in the sheet opens search and closes the sheet', await ph.isVisible('#palette') && await ph.isHidden('#sheet'));
 await ph.keyboard.press('Escape'); await ph.click('#moreBtn'); await ph.click('#sheetDl'); await ph.waitForTimeout(300);
 ok('Download app in the sheet opens the download panel on screen', await ph.evaluate(()=>{const p=document.querySelector('#dlPanel');if(!p||p.hidden)return false;const r=p.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;}));
 await ph.keyboard.press('Escape');
 ok('no sideways scrolling on the phone', await ph.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // 10. a phone with 2 days of activity: the greeting with "Start focus" comes before the chart
 await ph.evaluate(()=>{ const k=Object.keys(localStorage).find(x=>{try{return Array.isArray(JSON.parse(localStorage.getItem(x)).log);}catch{return false;}});
   const s=JSON.parse(localStorage.getItem(k)); const d=new Date(Date.now()-864e5); const t=new Date(), f=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; s.log.push({d:f(d),cat:'learn',m:30},{d:f(t),cat:'play',m:20}); localStorage.setItem(k,JSON.stringify(s)); });
 await ph.reload(); await ph.waitForTimeout(500);
 const ord=await ph.evaluate(()=>{const g=document.querySelector('#main .home-greet'),c=document.querySelector('#main .spark');return {greet:g&&Math.round(g.getBoundingClientRect().top),chart:c&&Math.round(c.getBoundingClientRect().top)};});
 ok('on a phone the greeting and "Start focus" come before the 7-day chart', ord.greet!=null && ord.chart!=null && ord.greet<ord.chart, JSON.stringify(ord));
 await ph.context().close();
 const pc=await (await b.newContext({viewport:{width:1440,height:900}})).newPage(); pc.on('pageerror',e=>errs.push(e.message));
 await pc.context().route(/fonts\.(googleapis|gstatic)|wixapis/,r=>r.abort());
 await pc.goto(URL); await pc.click('#guestBtn'); await pc.waitForTimeout(300);
 await pc.evaluate(()=>{ const k=Object.keys(localStorage).find(x=>{try{return Array.isArray(JSON.parse(localStorage.getItem(x)).log);}catch{return false;}});
   const s=JSON.parse(localStorage.getItem(k)); const d=new Date(Date.now()-864e5); const t=new Date(), f=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; s.log.push({d:f(d),cat:'learn',m:30},{d:f(t),cat:'play',m:20}); localStorage.setItem(k,JSON.stringify(s)); });
 await pc.reload(); await pc.waitForTimeout(500);
 ok('on a computer the chart stays on the left of the greeting', await pc.evaluate(()=>{const g=document.querySelector('#main .home-greet').getBoundingClientRect(),c=document.querySelector('#main .spark').getBoundingClientRect();return c.left<g.left && Math.abs(c.top-g.top)<80;}));
 // 11. only the main action glows
 const glow=await pc.evaluate(()=>[...document.querySelectorAll('#main .btn.primary')].map(b=>({t:b.textContent.trim(),g:getComputedStyle(b).boxShadow!=='none'})));
 ok('only "Start focus" has a shadow on Home; the other main buttons do not', glow.filter(x=>x.g).length===1 && glow.find(x=>x.g).t.includes('Start focus') && glow.length>1, JSON.stringify(glow));
 // 12. Players for a guest: one sign-up prompt, full-width leaderboard
 await pc.click('#nav [data-route="players"]'); await pc.waitForTimeout(500);
 const pl=await pc.evaluate(()=>({h:[...document.querySelectorAll('#main .card-h h2')].map(h=>h.textContent),dup:document.querySelector('#main').textContent.includes('Make an account to add friends'),lbW:Math.round(document.querySelector('#lbList').closest('.card').getBoundingClientRect().width),mainW:Math.round(document.querySelector('#main').getBoundingClientRect().width)}));
 ok('Players asks a guest to sign up once, and the leaderboard is full width', pl.h.join()==='Join the leaderboard,Leaderboard' && !pl.dup && pl.lbW>=pl.mainW-4, JSON.stringify(pl));
 await pc.context().close();
 console.log(res.join('\n')); console.log('JS errors:',errs.length?errs:'none'); await b.close();
})();
