// Improvements: speed (self-hosted font), offline + update prompt, installable, tour, focus trap, backup reminder, reports + moderation log.
const {chromium}=require('playwright'); const fs=require('fs'); const {spawn,execFileSync}=require('child_process');
const H=require('./harness'); const D=H.OUT;
const viaMenu=async(p,q,sel)=>{ const m=`#chatList .msg:has-text("${q}")`; await p.hover(m); await p.click(`${m} .msg-more`); await p.click(`${m} ${sel}`); }; // actions live in the message's ⋯ menu
const OKEY=H.OKEY, AKEY=H.AKEY;
const SITE=D+'served/'; fs.rmSync(SITE,{recursive:true,force:true}); H.copySite(SITE);
const BASE='http://localhost:8765/';
const chat=[], players=new Map(); let n=0;
const hdr={'access-control-allow-origin':'*','content-type':'application/json'};
const match=(data,id,f)=>Object.entries(f||{}).every(([k,v])=>k==='_id'?id===v:data[k]===v);
async function mock(route){
  const u=route.request().url(), body=route.request().postData()?JSON.parse(route.request().postData()):{};
  const ok=o=>route.fulfill({status:200,headers:hdr,body:JSON.stringify(o)});
  if(u.includes('/oauth2/token')) return ok({access_token:'anon',expires_in:3600});
  if(u.endsWith('/wix-data/v2/items/save')){ const id=body.dataItem.id; const old=players.get(id); const it={id,data:{...body.dataItem.data,_id:id,_createdDate:old?old.data._createdDate:{$date:new Date().toISOString()},_updatedDate:{$date:new Date().toISOString()}}}; players.set(id,it); return ok({action:old?'UPDATED':'INSERTED',dataItem:it}); }
  if(u.endsWith('/wix-data/v2/items')){ const id='id'+(++n); const item={id,data:{...body.dataItem.data,_id:id,_createdDate:{$date:new Date(Date.now()+n).toISOString()}}}; chat.push(item); return ok({dataItem:item}); }
  if(u.endsWith('/wix-data/v2/items/query')){ const q=body.query||{}, pg=q.paging||{}, off=pg.offset||0, lim=pg.limit||50;
    if(body.dataCollectionId==='Players'){ const all=[...players.values()].filter(i=>match(i.data,i.id,q.filter)); return ok({dataItems:all.slice(off,off+lim)}); }
    const items=chat.filter(i=>i.data.room===q.filter.room).slice().reverse().slice(0,100); return ok({dataItems:items}); }
  return route.fulfill({status:404,headers:hdr,body:'{}'});
}
(async()=>{
 const srv=spawn('node',[H.SERVE,SITE,'8765']); process.on('exit',()=>srv.kill()); process.on('uncaughtException',e=>{ console.log('CRASH:',e.message.split('\n')[0]); srv.kill(); process.exit(1); });
 srv.on('exit',c=>{ if(c) { console.log('server failed to start'); process.exit(1); } }); await new Promise(r=>srv.stdout.once('data',r));
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>{ const l=`${c?'PASS':'FAIL'}  ${t} ${x}`; res.push(l); console.log(l); };
 const mk=async(name,{w=1440,h=950,human=false}={})=>{ const ctx=await b.newContext({viewport:{width:w,height:h}}); await ctx.route(/wixapis\.com/,mock);
   if(human) await ctx.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
   const p=await ctx.newPage(); p._reqs=[]; p.on('request',r=>p._reqs.push(r.url())); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(BASE); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await p.waitForTimeout(900); };
 const unlock=async(p,k)=>{ await p.goto(BASE+'#options'); await p.fill('#ownKey',k); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000); };
 const goPublic=async p=>{ await p.goto(BASE+'#players'); await p.waitForTimeout(300); const g=await p.$('#goPublic'); if(g){ await g.click(); await p.waitForTimeout(2500);} };

 // ---- speed: font comes with the site, nothing from Google
 const s1=await mk('speed'); await s1.waitForTimeout(800);
 ok('no requests to Google Fonts', !s1._reqs.some(u=>/fonts\.(googleapis|gstatic)/.test(u)));
 ok('Outfit font loads from the site', await s1.evaluate(async()=>{ await document.fonts.ready; return document.fonts.check('500 16px Outfit') && [...document.fonts].some(f=>f.family.replace(/"/g,'')==='Outfit'&&f.status==='loaded'); }));
 // ---- installable
 const man=await (await s1.request.get(BASE+'manifest.json')).json();
 ok('manifest has name, start page and 192/512 icons', man.name==='LevelUp Life' && man.icons.some(i=>i.sizes==='192x192') && man.icons.some(i=>i.sizes==='512x512') && man.display==='standalone');
 for (const i of man.icons) { const r=await s1.request.get(BASE+i.src); if(!r.ok()) ok('icon '+i.src+' exists',false); }
 const s0=await mk('install'); const cdp=await s0.context().newCDPSession(s0); await s0.waitForTimeout(1500);
 const inst=await cdp.send('Page.getInstallabilityErrors').catch(e=>({err:String(e)})); await s0.context().close();
 ok('Chrome says the site is installable', inst.installabilityErrors && inst.installabilityErrors.length===0, JSON.stringify(inst).slice(0,200));
 // ---- offline + update prompt
 await s1.waitForFunction(()=>navigator.serviceWorker && navigator.serviceWorker.controller, null, {timeout:10000}).catch(()=>{});
 if(!(await s1.evaluate(()=>!!navigator.serviceWorker.controller))) { await s1.reload(); await s1.waitForTimeout(1000); }
 ok('service worker is active', await s1.evaluate(()=>!!navigator.serviceWorker.controller));
 await s1.click('#guestBtn'); await s1.goto(BASE+'#study'); await s1.fill('#taskIn','offline test task'); await s1.press('#taskIn','Enter');
 await s1.context().setOffline(true); await s1.reload(); await s1.waitForTimeout(800);
 ok('opens with no internet', (await s1.textContent('#pageTitle'))!=='' && (await s1.textContent('#main')).includes('offline test task'));
 ok('offline chip shows', await s1.isVisible('#netChip'), JSON.stringify(await s1.evaluate(()=>({on:navigator.onLine,h:document.querySelector('#netChip')&&document.querySelector('#netChip').hidden}))));
 for (const r of ['home','focus','badges','options','help']) { await s1.goto(BASE+'#'+r); await s1.waitForTimeout(150); }
 ok('every page works offline', !errs.length, errs.join(' | '));
 await s1.goto(BASE+'#chat'); await s1.waitForTimeout(400);
 await s1.context().setOffline(false); await s1.waitForTimeout(500);
 ok('offline chip hides when back online', await s1.isHidden('#netChip'));
 fs.appendFileSync(SITE+'app.js','\n// new version\n'); await s1.reload(); await s1.waitForTimeout(2500);
 ok('a new version shows the Reload prompt', await s1.isVisible('#updateBar'));
 await s1.click('#updateBtn'); await s1.waitForTimeout(1500);
 ok('Reload loads the new version', (await (await s1.evaluate(()=>caches.open('levelup-shell-v1').then(c=>c.match('app.js')).then(r=>r.text()))).includes('// new version')));
 await s1.context().close();

 // ---- tour (new player, a real browser)
 const t1=await mk('tour',{human:true}); await signup(t1,'NewKid1'); await t1.waitForTimeout(1200);
 ok('tour starts for a new player', await t1.isVisible('.tour-box') && (await t1.textContent('#tourT')).includes('Welcome'));
 const steps=[]; for (let i=0;i<7;i++){ const h=await t1.evaluate(()=>{ const x=document.querySelector('.tour-hole'); return x.style.display==='block' ? x.getBoundingClientRect().width : 0; }); steps.push((await t1.textContent('#tourT'))+':'+Math.round(h)); if(i===2) await t1.screenshot({path:D+'shots2/tour-step.png'}); if(i<6) await t1.click('#tourNext'); await t1.waitForTimeout(350); }
 ok('tour highlights each part of the page', steps.filter(s=>!/:0$/.test(s)).length===5, steps.join(' | '));
 ok('focus stays in the tour while it is open', await t1.evaluate(()=>document.querySelector('.tour-box').contains(document.activeElement)));
 await t1.click('#tourNext'); await t1.waitForTimeout(300);
 ok('tour finishes and is remembered', await t1.isHidden('.tour') && (await t1.evaluate(()=>JSON.parse(localStorage.getItem('levelup-life-v1:u:newkid1')).toured))===true);
 await t1.reload(); await t1.waitForTimeout(1200); ok('tour does not come back', !(await t1.isVisible('.tour-box').catch(()=>false)));
 await t1.goto(BASE+'#help'); await t1.click('#tourBtn'); await t1.waitForTimeout(300); ok('Help page can replay the tour', await t1.isVisible('.tour-box'));
 await t1.keyboard.press('Escape'); await t1.waitForTimeout(200); ok('Esc closes the tour', await t1.isHidden('.tour'));
 const old=await mk('veteran',{human:true}); await old.evaluate(()=>{ localStorage.setItem('levelup-life-v1',JSON.stringify({agreed:true,xp:500})); }); await old.reload(); await old.waitForTimeout(1300);
 ok('players who already use the app do not get the tour', !(await old.isVisible('.tour-box').catch(()=>false)));
 const tp=await mk('tourphone',{w:375,h:812,human:true}); await signup(tp,'Phone2'); await tp.waitForTimeout(1200); await tp.click('#tourNext'); await tp.waitForTimeout(300);
 const hb=await tp.evaluate(()=>{ const r=document.querySelector('.tour-hole').getBoundingClientRect(), n=document.querySelector('#bottomnav').getBoundingClientRect(); const bx=document.querySelector('.tour-box').getBoundingClientRect(); return Math.abs(r.top-n.top)<12 && bx.right<=innerWidth && bx.left>=0; });
 ok('phone tour points at the bottom menu and fits the screen', hb); await tp.screenshot({path:D+'shots2/tour-phone.png'});

 // ---- backup reminder
 const bk=await mk('backup'); await signup(bk,'Saver1'); await bk.evaluate(()=>{ const k='levelup-life-v1:u:saver1'; const d=JSON.parse(localStorage.getItem(k)); d.since=Date.now()-20*864e5; d.tasks=[{id:'a',text:'one'},{id:'b',text:'two'},{id:'c',text:'three'}]; localStorage.setItem(k,JSON.stringify(d)); }); await bk.reload(); await bk.waitForTimeout(600);
 ok('backup reminder shows after 2 weeks without a backup', await bk.isVisible('.backup-note'));
 await bk.click('[data-backup="later"]'); await bk.waitForTimeout(300); ok('"Remind me next week" hides it', !(await bk.isVisible('.backup-note').catch(()=>false)));
 await bk.evaluate(()=>{ const k='levelup-life-v1:u:saver1'; const d=JSON.parse(localStorage.getItem(k)); d.backupSnooze=0; localStorage.setItem(k,JSON.stringify(d)); }); await bk.reload(); await bk.waitForTimeout(600);
 const dl=bk.waitForEvent('download'); await bk.click('[data-backup="now"]'); const file=await dl; ok('"Download backup" saves a file and the reminder goes away', /levelup-life-backup/.test(file.suggestedFilename()) && !(await bk.isVisible('.backup-note').catch(()=>false)));
 await bk.goto(BASE+'#options'); ok('Settings shows the last backup date', !(await bk.textContent('#main')).includes('Last backup: never'));

 // ---- reports + moderation log
 const own=await mk('owner'); await signup(own,'Jinx002'); await unlock(own,OKEY); await goPublic(own);
 const kid=await mk('kid'); await signup(kid,'Kid123'); await goPublic(kid);
 const rude=await mk('rude'); await signup(rude,'Rude99'); await goPublic(rude);
 await own.goto(BASE+'#chat'); await own.click('#newCode'); const code=await own.inputValue('#joinCode'); await own.click('#joinForm .btn'); await own.waitForTimeout(1500);
 for (const p of [kid,rude]) { await p.goto(BASE+'#chat'); await p.fill('#joinCode',code); await p.click('#joinForm .btn'); await p.waitForTimeout(1200); }
 await rude.fill('#chatIn','you are all noobs lol'); await rude.click('#chatForm .btn.primary'); await rude.waitForTimeout(3000);
 await kid.waitForTimeout(4500);
 ok('Report button on other players\' messages', (await kid.$$('#chatList [data-repmsg]')).length>=1);
 await viaMenu(kid,'noobs','[data-repmsg]'); await kid.waitForTimeout(400);
 ok('report form shows the message', (await kid.textContent('#pmBody')).includes('noobs'));
 await kid.check('input[name="repWhy"][value="1"]'); await kid.fill('#repNote','keeps insulting people'); await kid.click('#repForm .btn.primary'); await kid.waitForTimeout(1200);
 const reps=[...players.values()].filter(i=>i.data.kind==='report');
 ok('report is stored', reps.length===1);
 ok('report is encrypted (nobody else can read it)', !reps[0].data.payload.includes('noobs') && !reps[0].data.payload.includes('insulting') && !reps[0].data.payload.includes('Rude99'));
 await kid.goto(BASE+'#players'); await kid.waitForTimeout(1200); await kid.click('#lbList [data-player="rude99"]'); await kid.waitForTimeout(600); await kid.click('#pmBody [data-report]'); await kid.waitForTimeout(300); await kid.click('#repForm .btn.primary'); await kid.waitForTimeout(800);
 ok('a second report within a minute is refused', (await kid.textContent('#repErr')).includes('wait a minute'));
 await kid.keyboard.press('Escape');
 await own.goto(BASE+'#players'); await own.waitForTimeout(2500);
 ok('owner sees the report, decrypted', (await own.textContent('#repBox')).includes('Bullying or hate') && (await own.textContent('#repBox')).includes('noobs') && (await own.textContent('#repBox')).includes('keeps insulting people'));
 ok('red dot for open reports', (await own.$$('#nav [data-route="players"].has-req')).length===1);
 await own.screenshot({path:D+'shots2/reports.png',fullPage:true});
 await own.click('[data-repres][data-act="hidden"]'); await own.waitForTimeout(2500);
 ok('"Hide from leaderboard" handles the report and hides the player', !(await own.textContent('#repBox')).includes('noobs') && (await own.textContent('#hiddenBox')).includes('Rude99'));
 ok('moderation log shows it', (await own.textContent('#modLog')).includes('Rude99'), await own.textContent('#modLog'));
 const adm=await mk('admin'); await signup(adm,'snowyy'); await unlock(adm,AKEY); await kid.waitForTimeout(61000);
 await kid.goto(BASE+'#players'); await kid.waitForTimeout(1200); await kid.click('#lbList [data-player="jinx002"]').catch(()=>{}); await kid.keyboard.press('Escape');
 await kid.goto(BASE+'#chat'); await kid.waitForTimeout(3000); await viaMenu(kid,'noobs','[data-repmsg]'); await kid.waitForTimeout(300); await kid.click('#repForm .btn.primary'); await kid.waitForTimeout(1200);
 await adm.goto(BASE+'#players'); await adm.waitForTimeout(2500);
 ok('admins can read reports too', (await adm.textContent('#repBox')).includes('noobs'));
 ok('admin sees the owner\'s actions in the log', (await adm.textContent('#modLog')).includes('Rude99'));
 await adm.click('[data-repres][data-act="done"]'); await adm.waitForTimeout(1500);
 await own.goto(BASE+'#home'); await own.goto(BASE+'#players'); await own.waitForTimeout(2500);
 ok('"Mark handled" by the admin shows in the owner\'s log', (await own.textContent('#modLog')).includes('handled a report'));
 // missing key on a new device: unlock form
 await own.evaluate(()=>new Promise(r=>{ const q=indexedDB.open('levelup-media'); q.onsuccess=()=>{ const tx=q.result.transaction('files','readwrite'); const st=tx.objectStore('files'); st.getAllKeys().onsuccess=e=>{ e.target.result.filter(k=>String(k).endsWith('|ownerdh')).forEach(k=>st.delete(k)); }; tx.oncomplete=r; }; }));
 await own.goto(BASE+'#home'); await own.goto(BASE+'#players'); await own.waitForTimeout(2000);
 ok('without the key on this device, reports ask for it', (await own.$$('#repKeyForm')).length===1);
 await own.fill('#repKeyIn',OKEY); await own.click('#repKeyForm .btn'); await own.waitForTimeout(5000);
 ok('entering the key unlocks reports again', (await own.$$('#repKeyForm')).length===0);
 // focus trap in the profile window
 await kid.goto(BASE+'#players'); await kid.waitForTimeout(1200); await kid.click('#lbList [data-player="jinx002"]'); await kid.waitForTimeout(600);
 for (let i=0;i<12;i++) await kid.keyboard.press('Tab');
 ok('keyboard focus stays inside the profile window', await kid.evaluate(()=>document.querySelector('#playerModal .modal-box').contains(document.activeElement)));
 await kid.keyboard.press('Escape'); await kid.waitForTimeout(200);
 ok('focus goes back to what opened it', await kid.evaluate(()=>document.activeElement && document.activeElement.dataset.player==='jinx002'));
 srv.kill(); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
