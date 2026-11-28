// New features: login streak, weekly challenges, achievements, bio/favourite games, weekly leaderboard,
// notifications, private messages, study groups, seasonal themes, more emoji slots.
const {chromium}=require('playwright'); const fs=require('fs'); const {spawn,execFileSync}=require('child_process');
const H=require('./harness'); const D=H.OUT;
const OKEY=H.OKEY;
const SITE=D+'served19/'; fs.rmSync(SITE,{recursive:true,force:true}); H.copySite(SITE);
const BASE='http://localhost:8770/app.html'; // the app (the front page is the landing page)
const chat=[], players=new Map(); let n=0;
const hdr={'access-control-allow-origin':'*','content-type':'application/json'};
const one=(have,want)=>want&&typeof want==='object'&&Array.isArray(want.$in)?want.$in.includes(have):have===want;
const match=(data,id,f)=>Object.entries(f||{}).every(([k,v])=>k==='_id'?one(id,v):one(data[k],v));
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
const dayOff=k=>{ const d=new Date(); d.setDate(d.getDate()-k); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
(async()=>{
 const srv=spawn('node',[H.SERVE,SITE,'8770']); process.on('exit',()=>srv.kill()); process.on('uncaughtException',e=>{ console.log('CRASH:',e.message.split('\n')[0]); srv.kill(); process.exit(1); });
 srv.on('exit',c=>{ if(c) { console.log('server failed to start'); process.exit(1); } }); await new Promise(r=>srv.stdout.once('data',r));
 const b=await chromium.launch(); const errs=[]; const ok=(t,c,x='')=>console.log(`${c?'PASS':'FAIL'}  ${t} ${c?'':x}`);
 const mk=async(name,{w=1440,h=950}={})=>{ const ctx=await b.newContext({viewport:{width:w,height:h}}); await ctx.route(/wixapis\.com/,mock);
   const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(BASE); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(900); };
 const st=async(p,u)=>p.evaluate(k=>JSON.parse(localStorage.getItem('levelup-life-v1:u:'+k)),u);
 const edit=async(p,u,fn)=>{ await p.evaluate(([k,src])=>{ const s=JSON.parse(localStorage.getItem('levelup-life-v1:u:'+k)); (new Function('s',src))(s); localStorage.setItem('levelup-life-v1:u:'+k,JSON.stringify(s)); },[u,fn]); await p.reload(); await p.waitForTimeout(1200); };
 const goPublic=async p=>{ await p.goto(BASE+'#players'); await p.waitForTimeout(300); const g=await p.$('#goPublic'); if(g){ await g.click(); await p.waitForTimeout(2500);} };


 const reqs=[]; 
 const a=await mk('ana'); a.on('request',r=>reqs.push(r.url())); await signup(a,'Ana_01');
 ok('English by default: no word lists are downloaded', !reqs.some(u=>u.includes('/lang/')) && (await a.evaluate(()=>document.documentElement.lang))==='en');
 await a.goto(BASE+'#options'); await a.waitForTimeout(300);
 const opts=await a.$$eval('#stLang option',o=>o.map(x=>x.textContent+'='+x.value));
 ok('Settings has a language dropdown with 6 languages', opts.length===6 && opts.join(',').includes('Deutsch=de') && opts.join(',').includes('日本語=ja') && opts.join(',').includes('한국어=ko') && opts.join(',').includes('中文（简体）=zh') && opts.join(',').includes('Nederlands=nl'), opts.join(','));
 ok('English is selected', (await a.inputValue('#stLang'))==='en');
 await Promise.all([a.waitForNavigation(), a.selectOption('#stLang','de')]); await a.waitForTimeout(1200);
 ok('choosing Deutsch switches the app to German', (await a.evaluate(()=>document.documentElement.lang))==='de' && (await a.textContent('#nav')).includes('Lernen') && (await a.textContent('#pageTitle'))==='Einstellungen', await a.textContent('#pageTitle'));
 ok('the dropdown shows Deutsch', (await a.inputValue('#stLang'))==='de' && (await a.textContent('#main')).includes('Sprache (Language)'));
 ok('the browser tab title is translated', (await a.title())==='Einstellungen · LevelUp Life', await a.title());
 await a.goto(BASE+'#home'); await a.waitForTimeout(500);
 const home=await a.textContent('#main');
 ok('home page in German (greeting with name, weekly card)', /Guten (Morgen|Tag|Abend), Ana_01/.test(home) && home.includes('Diese Woche') && home.includes('Tage Login-Serie'), home.slice(0,300));
 ok('placeholders and labels are translated', (await a.getAttribute('#searchBtn','aria-label'))==='Suchen und springen (Strg+K)');
 await a.goto(BASE+'#series'); await a.waitForTimeout(300); await a.click('#sForm .btn.primary'); await a.waitForTimeout(200);
 const toastTxt=await a.textContent('#toast');
 ok('pop-up messages are translated', toastTxt.trim()==='Gib einen Titel ein', toastTxt);
 await a.goto(BASE+'#focus'); await a.waitForTimeout(300); await a.click('#tGo'); await a.waitForTimeout(1200);
 ok('the running timer title is translated', /^\d\d:\d\d · Fokus$/.test(await a.title()), await a.title()); await a.click('#tGo');
 // chat: what people write stays as written
 const o=await mk('owner'); await signup(o,'Jinx002'); await o.goto(BASE+'#options'); await o.fill('#ownKey',OKEY); await o.click('#ownForm .btn.primary'); await o.waitForTimeout(5000);
 await o.goto(BASE+'#chat'); await o.click('#newCode'); const code=await o.inputValue('#joinCode'); await o.click('#joinForm .btn'); await o.waitForTimeout(1500);
 await o.fill('#chatIn','Hello world'); await o.click('#chatForm .btn.primary'); await o.waitForTimeout(1500);
 await a.goto(BASE+'#chat'); await a.waitForTimeout(300); await a.fill('#joinCode',code); await a.click('#joinForm .btn'); await a.waitForTimeout(2500);
 ok('chat messages are not translated', (await a.textContent('#chatList')).includes('Hello world') && !(await a.textContent('#chatList')).includes('Hallo Welt'));
 // Japanese, Korean, Chinese, Dutch
 for (const [l, word, page] of [['ja','学習','学習パス'],['ko','공부','학습 경로'],['zh','学习','学习路线'],['nl','Leren','Leerpad']]) {
   await a.goto(BASE+'#options'); await a.waitForTimeout(300); await Promise.all([a.waitForNavigation(), a.selectOption('#stLang',l)]); await a.waitForTimeout(1200);
   await a.goto(BASE+'#study'); await a.waitForTimeout(400);
   ok(`${l}: the app is in that language`, (await a.textContent('#nav')).includes(word) && (await a.textContent('#pageTitle'))===page, await a.textContent('#pageTitle'));
 }
 await a.goto(BASE+'#privacy'); await a.waitForTimeout(300);
 ok('Privacy Terms stay in English with a note', (await a.textContent('#main')).includes('De privacyvoorwaarden worden in het Engels getoond.') && (await a.textContent('#main')).includes('What we do not collect'));
 // phone layout in German and Japanese
 const ph=await mk('phone',{w:390,h:800}); await signup(ph,'Pho_04');
 for (const l of ['de','ja']) { await ph.evaluate(l=>localStorage.setItem('levelup-lang',l),l); const wide=[];
   for (const r of ['home','study','focus','gaming','players','messages','badges','options','help']) { await ph.goto(BASE+'#'+r); await ph.reload(); await ph.waitForTimeout(500); if (await ph.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) wide.push(r); }
   ok(`${l}: no horizontal scrolling on a phone`, !wide.length, wide.join(',')); }
 await ph.goto(BASE+'#home'); await ph.waitForTimeout(500); await ph.screenshot({path:D+'shots2/lang-ja-phone.png'});
 // back to English
 await a.goto(BASE+'#options'); await a.waitForTimeout(300); await Promise.all([a.waitForNavigation(), a.selectOption('#stLang','en')]); await a.waitForTimeout(1200);
 ok('switching back to English works', (await a.textContent('#pageTitle'))==='Settings' && (await a.evaluate(()=>document.documentElement.lang))==='en');
 // the desktop app opens the files directly (file://)
 const ctx=await b.newContext(); const fp=await ctx.newPage(); fp.on('pageerror',e=>errs.push('file: '+e.message));
 await fp.goto('file://'+SITE+'app.html'); await fp.evaluate(()=>localStorage.setItem('levelup-lang','ko')); await fp.reload(); await fp.waitForTimeout(1000);
 ok('desktop app (file://) also switches language', (await fp.textContent('#nav')).includes('공부'), await fp.textContent('#nav'));
 await a.goto(BASE+'#home'); await a.waitForTimeout(300);
 for (const l of ['de','ja']) { await a.evaluate(l=>localStorage.setItem('levelup-lang',l),l); await a.reload(); await a.waitForTimeout(1000); await a.screenshot({path:D+'shots2/lang-'+l+'.png'}); }
 srv.kill(); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
