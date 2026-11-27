// Top menu: five main pages plus a "More" button whose list holds the rest. It fits at every desktop width,
// works with the mouse and the keyboard, and shows the page you are on when that page lives under More.
const {chromium}=require('playwright');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${c?'':x}`);
 const ctx=await b.newContext({viewport:{width:1700,height:900}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis/,r=>r.abort());
 const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
 await p.goto(URL); await p.click('#guestBtn'); await p.waitForTimeout(300);
 const st=()=>p.evaluate(()=>{const n=document.querySelector('#nav');return {sw:n.scrollWidth,cw:n.clientWidth};});
 const open=()=>p.evaluate(()=>!document.querySelector('#navMoreMenu').hidden);
 const label=()=>p.textContent('#navMoreLbl');

 // 1. five main pages + More, and it fits at every desktop width
 const main=await p.$$eval('#nav > a',a=>a.map(x=>x.dataset.route));
 ok('the top menu shows Home, Study, Focus, Gaming and Chat', main.join()==='home,study,focus,gaming,chat', main.join());
 ok('followed by a More button', await p.isVisible('#nav #navMoreBtn') && (await label())==='More');
 const fits=[]; for (const w of [1700,1440,1280,1100,980,900]) { await p.setViewportSize({width:w,height:900}); await p.waitForTimeout(150); const s=await st(); if (s.sw>s.cw+1) fits.push(`${w}px: ${s.sw}/${s.cw}`); }
 ok('the menu fits without scrolling from 1700px down to 900px', !fits.length, fits.join(', '));

 // 2. More opens a list of the other pages
 await p.setViewportSize({width:1440,height:900}); await p.waitForTimeout(150);
 ok('the list starts closed', !(await open()) && (await p.getAttribute('#navMoreBtn','aria-expanded'))==='false');
 await p.click('#navMoreBtn'); await p.waitForTimeout(150);
 const more=await p.$$eval('#navMoreMenu a',a=>a.map(x=>x.dataset.route));
 ok('More opens a list with the other pages', await open() && (await p.getAttribute('#navMoreBtn','aria-expanded'))==='true' && more.join()==='companion,series,youtube,balance,impact,messages,players', more.join());
 ok('the list opens right under the More button', await p.evaluate(()=>{const b=document.querySelector('#navMoreBtn').getBoundingClientRect(),m=document.querySelector('#navMoreMenu').getBoundingClientRect();return m.top>=b.bottom && m.top-b.bottom<30 && Math.abs(m.left-b.left)<4;}));
 ok('keyboard focus moves into the list', await p.evaluate(()=>document.activeElement.closest('#navMoreMenu')!==null));
 await p.keyboard.press('Escape'); await p.waitForTimeout(100);
 ok('Esc closes it and puts focus back on More', !(await open()) && await p.evaluate(()=>document.activeElement.id==='navMoreBtn'));
 await p.keyboard.press('Enter'); await p.waitForTimeout(150);
 ok('Enter on More opens it', await open());
 await p.mouse.click(700,600); await p.waitForTimeout(150);
 ok('clicking elsewhere closes it', !(await open()));

 // 3. choosing a page from the list
 await p.click('#navMoreBtn'); await p.click('#navMoreMenu [data-route="players"]'); await p.waitForTimeout(400);
 ok('choosing Players opens Players and closes the list', (await p.textContent('#pageTitle'))==='Players' && !(await open()));
 ok('More now says "Players" and is highlighted as the current page', (await label())==='Players' && await p.evaluate(()=>{const b=document.querySelector('#navMoreBtn');return b.classList.contains('active')&&b.getAttribute('aria-current')==='page';}));
 ok('Players is highlighted inside the list too', await p.evaluate(()=>document.querySelector('#navMoreMenu [data-route="players"]').classList.contains('active')));
 await p.keyboard.press('8'); await p.waitForTimeout(300);
 ok('keyboard shortcuts still open pages under More (8 = Impact)', (await p.textContent('#pageTitle'))==='Help the World' && (await label())==='Impact');
 await p.click('#nav [data-route="home"]'); await p.waitForTimeout(300);
 ok('back on a main page, the button says More again', (await label())==='More' && !(await p.evaluate(()=>document.querySelector('#navMoreBtn').classList.contains('active'))));

 // 4. a red dot on a page under More also shows on the More button
 await p.evaluate(()=>document.querySelector('#navMoreMenu [data-route="players"]').classList.add('has-req')); await p.click('#nav [data-route="focus"]'); await p.waitForTimeout(200);
 ok('a red dot inside the list shows on More', await p.evaluate(()=>document.querySelector('#navMoreBtn').classList.contains('has-req')));
 await p.evaluate(()=>document.querySelector('#navMoreMenu [data-route="players"]').classList.remove('has-req')); await p.click('#nav [data-route="home"]'); await p.waitForTimeout(200);
 ok('and goes away with it', !(await p.evaluate(()=>document.querySelector('#navMoreBtn').classList.contains('has-req'))));

 // 5. narrow window: the list stays on screen; the mouse wheel scrolls the page as usual
 await p.setViewportSize({width:900,height:700}); await p.goto(URL+'#privacy'); await p.waitForTimeout(300);
 await p.click('#navMoreBtn'); await p.waitForTimeout(150);
 ok('at 900px the list stays inside the window', await p.evaluate(()=>{const m=document.querySelector('#navMoreMenu').getBoundingClientRect();return m.left>=0&&m.right<=innerWidth;}));
 await p.screenshot({path:D+'shots2/menu-more-900.png',clip:{x:0,y:0,width:900,height:520}});
 await p.keyboard.press('Escape');
 const b2=await p.locator('#nav').boundingBox(); await p.mouse.move(b2.x+b2.width/2,b2.y+b2.height/2); await p.mouse.wheel(0,400); await p.waitForTimeout(300);
 ok('the wheel over the menu scrolls the page as usual', (await p.evaluate(()=>scrollY))>0);

 // 6. Home for a brand-new player: a short "Start here" list, no empty chart, no row of zeros, no empty "Up next", no tile grid
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
 const t1=await p2.getAttribute('#themeBtn','title'); await p2.click('#themeBtn'); await p2.waitForTimeout(150);
 const t2=await p2.getAttribute('#themeBtn','title'), lightNow=await p2.evaluate(()=>document.documentElement.dataset.theme);
 ok('the light / dark button says what it does and switches the theme', t1==='Switch to light mode' && t2==='Switch to dark mode' && lightNow==='light', `${t1} | ${t2} | ${lightNow}`);
 ok('it shows a sun in light mode', await p2.isVisible('#themeBtn .sun') && !(await p2.isVisible('#themeBtn .moon')));
 await p2.click('#themeBtn');
 const row=await p2.evaluate(()=>{const c=el=>{const r=document.querySelector(el).getBoundingClientRect();return Math.round(r.top+r.height/2);};return {bell:c('#bellBtn'),theme:c('#themeBtn'),profile:c('.profile'),settings:c('.topbar a.round[href="#options"]')};});
 ok('the bell, light / dark button, profile and settings line up in one row', new Set(Object.values(row)).size===1, JSON.stringify(row));
 ok('Download app sits just under the profile', await p2.evaluate(()=>{const pr=document.querySelector('.profile').getBoundingClientRect(),d=document.querySelector('#dlBtn').getBoundingClientRect();return d.top>=pr.bottom&&d.top-pr.bottom<10&&Math.abs((d.left+d.right)/2-(pr.left+pr.right)/2)<3;}));
 await p2.screenshot({path:D+'shots2/home-new-header.png',clip:{x:0,y:0,width:1440,height:240}});
 await p2.context().close();

 // 8. phones keep the bottom bar; the desktop list never shows there
 await p.setViewportSize({width:390,height:844}); await p.goto(URL+'#home'); await p.waitForTimeout(300);
 ok('on a phone the top menu and its list are hidden (the bottom bar is used)', !(await p.isVisible('#nav')) && !(await p.isVisible('#navMoreMenu')) && await p.isVisible('#bottomnav'));

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
 await ph.context().close();
 console.log(res.join('\n')); console.log('JS errors:',errs.length?errs:'none'); await b.close();
})();
