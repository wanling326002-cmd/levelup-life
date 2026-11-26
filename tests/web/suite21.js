// Game Time on the website: setup flow, live status, "last seen", limits, overlap counted once, edits that reach the PC,
// disconnecting PCs, deleting online history, phone layout and accessibility. Uses a fake Wix with per-member data.
const {chromium}=require('playwright'); const fs=require('fs'); const {spawn,execFileSync}=require('child_process');
const H=require('./harness'); const D=H.OUT;
const OKEY=H.OKEY;
const SITE=D+'served21/'; fs.rmSync(SITE,{recursive:true,force:true}); H.copySite(SITE); fs.writeFileSync(SITE+'mockauth.html','<script>var q=new URLSearchParams(location.search);parent.postMessage({code:"code-"+q.get("sess"),state:q.get("state")},"*");</script>');
const BASE='http://localhost:8772/';
const chat=[], players=new Map(); let n=0;
const hdr={'access-control-allow-origin':'*','content-type':'application/json'};
const one=(have,want)=>want&&typeof want==='object'&&Array.isArray(want.$in)?want.$in.includes(have):have===want;
const match=(data,id,f)=>Object.entries(f||{}).every(([k,v])=>k==='_id'?one(id,v):one(data[k],v));

const members=new Map(), codes=new Map(), memberData=new Map(); let mid=0;
const comp={GameSessions:new Map(),CompanionDevices:new Map(),CompanionConfig:new Map()};
function compRoute(req,body,auth,ok,bad){
  const u=req.url(), col=comp[body.dataCollectionId]; if(!col) return false;
  if(!auth.startsWith('mem-')) { bad(403,{message:'members only'}); return true; }
  const owner=auth.slice(4), mine=[...col.values()].filter(x=>x.owner===owner);
  if(req.method()==='PATCH'){ const id=body.patch.dataItemId, it=col.get(id); if(!it||it.owner!==owner){ bad(404,{}); return true; } for(const m of body.patch.fieldModifications) it.item.data[m.fieldPath]=m.setFieldOptions.value; ok({dataItem:it.item}); return true; }
  if(u.endsWith('/wix-data/v2/items/query')){ const q=body.query||{}, f=q.filter||{}, pg=q.paging||{}; let all=mine.map(x=>x.item);
    if(f._id) all=all.filter(i=>i.id===f._id); if(f.day&&f.day.$in) all=all.filter(i=>f.day.$in.includes(i.data.day));
    if(q.sort) all.sort((x,y)=>(y.data.updatedAt||0)-(x.data.updatedAt||0)); ok({dataItems:all.slice(pg.offset||0,(pg.offset||0)+(pg.limit||50))}); return true; }
  if(u.endsWith('/wix-data/v2/items/save')){ const id=body.dataItem.id, old=col.get(id); if(old&&old.owner!==owner){ bad(403,{}); return true; } col.set(id,{owner,item:{id,data:body.dataItem.data}}); ok({dataItem:{id,data:body.dataItem.data}}); return true; }
  if(u.endsWith('/wix-data/v2/bulk/items/remove')){ for(const id of body.dataItemIds){ const it=col.get(id); if(it&&it.owner===owner) col.delete(id); } ok({results:[]}); return true; }
  bad(404,{}); return true;
}

const CAPTCHA_JS="(function(){var g={render:function(el,o){el.innerHTML='<label class=\"fakecap\"><input type=\"checkbox\" class=\"fakeCaptcha\"> I am not a robot</label>';return 1;},getResponse:function(){var c=document.querySelector('.fakeCaptcha');return c&&c.checked?'ok-token':'';},reset:function(){var c=document.querySelector('.fakeCaptcha');if(c)c.checked=false;}};window.grecaptcha={enterprise:g};var m=(document.currentScript.src.match(/onload=([A-Za-z_]+)/)||[])[1];if(m&&window[m])window[m]();})();";
async function mock(route){
  const req=route.request(), u=req.url(), body=req.postData()?JSON.parse(req.postData()):{}, auth=req.headers()['authorization']||'';
  const ok=o=>route.fulfill({status:200,headers:hdr,body:JSON.stringify(o)}), bad=(s,o)=>route.fulfill({status:s,headers:hdr,body:JSON.stringify(o)});
  if(body&&body.dataCollectionId&&compRoute(req,body,auth,ok,bad)) return;
  if(u.includes('/oauth2/token')){
    if(body.grantType==='authorization_code'){ const id=codes.get(body.code); if(!id||!body.codeVerifier) return bad(400,{error:'invalid_grant'}); return ok({access_token:'mem-'+id,refresh_token:'rt-'+id,expires_in:14400}); }
    if(body.grantType==='refresh_token'){ const id=String(body.refreshToken||'').slice(3); if(!members.has(id)) return bad(400,{error:'invalid_grant'}); return ok({access_token:'mem-'+id,refresh_token:'rt-'+id,expires_in:14400}); }
    return ok({access_token:'anon',expires_in:3600}); }
  const cap=()=>((body.captcha_tokens||[])[0]||{}).Recaptcha==='ok-token';
  const ident=m=>({id:m.id,identityProfile:{nickname:m.nick},email:{address:m.email}});
  if(u.endsWith('/_api/iam/authentication/v2/register')){ if(!cap()) return bad(403,{message:"Didn't receive Captcha token",details:{applicationError:{code:'CAPTCHA'}}});
    const email=body.loginId.email.toLowerCase(); if([...members.values()].some(m=>m.email===email)) return bad(409,{message:'member already exists'});
    const m={id:'mbr-'+(++mid)+'-abcdef12',email,pw:body.password,nick:(body.profile||{}).nickname||''}; members.set(m.id,m);
    if(email.startsWith('verify')) return ok({state:'REQUIRE_EMAIL_VERIFICATION',stateToken:'st-'+m.id});
    if(email.startsWith('approve')) return ok({state:'REQUIRE_OWNER_APPROVAL'});
    return ok({state:'SUCCESS',sessionToken:'sess-'+m.id,identity:ident(m)}); }
  if(u.endsWith('/_api/iam/authentication/v2/login')){ if(!cap()) return bad(403,{message:"Didn't receive Captcha token"});
    const m=[...members.values()].find(x=>x.email===body.loginId.email.toLowerCase()); if(!m||m.pw!==body.password) return bad(403,{message:'wrong credentials'});
    return ok({state:'SUCCESS',sessionToken:'sess-'+m.id,identity:ident(m)}); }
  if(u.endsWith('/_api/iam/verification/v1/auth/verify')){ const id=String(body.stateToken).slice(3); if(body.code!=='123456') return bad(400,{message:'bad code'}); return ok({state:'SUCCESS',sessionToken:'sess-'+id,identity:ident(members.get(id))}); }
  if(u.endsWith('/_api/redirects-api/v1/redirect-session')){ const a=body.auth.authRequest; if(a.clientId!=='71e92457-9a77-4b96-8d3c-a3281c3bff9d'||a.codeChallengeMethod!=='S256'||a.responseMode!=='web_message') return bad(400,{});
    const id=String(a.sessionToken).slice(5); codes.set('code-'+a.sessionToken,id); return ok({redirectSession:{id:'rs',fullUrl:'https://auth.mock.test/authorize?state='+a.state+'&sess='+encodeURIComponent(a.sessionToken)}}); }
  if(u.endsWith('/_api/iam/recovery/v1/send-email')) { recoveries.push(body); return ok({}); }
  if(u.endsWith('/wix-data/v2/items/save')&&body.dataCollectionId==='MemberData'){ if(!auth.startsWith('mem-')) return bad(403,{}); const owner=auth.slice(4), id=body.dataItem.id; const old=memberData.get(id); if(old&&old.owner!==owner) return bad(403,{});
    memberData.set(id,{owner,item:{id,data:{...body.dataItem.data,_id:id}}}); saves++; return ok({dataItem:memberData.get(id).item}); }
  if(u.endsWith('/wix-data/v2/items/query')&&body.dataCollectionId==='MemberData'){ if(!auth.startsWith('mem-')) return bad(403,{}); const owner=auth.slice(4);
    return ok({dataItems:[...memberData.values()].filter(x=>x.owner===owner&&(!body.query.filter._id||x.item.id===body.query.filter._id)).map(x=>x.item)}); }
  if(u.endsWith('/wix-data/v2/items/save')){ const id=body.dataItem.id; const old=players.get(id); const it={id,data:{...body.dataItem.data,_id:id,_createdDate:old?old.data._createdDate:{$date:new Date().toISOString()},_updatedDate:{$date:new Date().toISOString()}}}; players.set(id,it); return ok({dataItem:it}); }
  if(u.endsWith('/wix-data/v2/items')){ const id='id'+(++n); const item={id,data:{...body.dataItem.data,_id:id,_createdDate:{$date:new Date(Date.now()+n).toISOString()}}}; chat.push(item); return ok({dataItem:item}); }
  if(u.endsWith('/wix-data/v2/items/query')){ const q=body.query||{}, pg=q.paging||{}, off=pg.offset||0, lim=pg.limit||50;
    if(body.dataCollectionId==='Players'){ const all=[...players.values()].filter(i=>match(i.data,i.id,q.filter)); return ok({dataItems:all.slice(off,off+lim)}); }
    return ok({dataItems:chat.filter(i=>i.data.room===q.filter.room).slice().reverse().slice(0,100)}); }
  return route.fulfill({status:404,headers:hdr,body:'{}'});
}
const recoveries=[]; let saves=0;
(async()=>{
 const srv=spawn('node',[H.SERVE,SITE,'8772']); process.on('exit',()=>srv.kill()); process.on('uncaughtException',e=>{ console.log('CRASH:',e.message.split('\n')[0]); srv.kill(); process.exit(1); });
 await new Promise(r=>srv.stdout.once('data',r));
 const b=await chromium.launch(); const errs=[]; const ok=(t,c,x='')=>console.log(`${c?'PASS':'FAIL'}  ${t} ${c?'':x}`);
 const mk=async(name,{w=1440,h=950}={})=>{ const ctx=await b.newContext({viewport:{width:w,height:h}}); await ctx.route(/wixapis\.com/,mock);
   await ctx.route(/auth\.mock\.test/,r=>r.fulfill({status:200,headers:{'content-type':'text/html'},body:'<script>var q=new URLSearchParams(location.search);parent.postMessage({code:"code-"+q.get("sess"),state:q.get("state")},"*");</script>'}));
   await ctx.route(/google\.com\/recaptcha/,r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:CAPTCHA_JS}));
   const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(BASE); await p.waitForTimeout(400); return p; };
 const st=async(p,u)=>p.evaluate(k=>JSON.parse(localStorage.getItem('levelup-life-v1:u:'+k)),u);
 const acc=async p=>p.evaluate(()=>JSON.parse(localStorage.getItem('levelup-accounts-v1')));
 const onlineForm=async(p,mode)=>{ await p.click('[data-auth="online"]'); await p.waitForTimeout(400); if(mode) { await p.click(`[data-olmode="${mode}"]`); await p.waitForTimeout(300); } };
 const settle=async p=>{ await p.waitForTimeout(300); for(let i=0;i<40;i++){ const busy=await p.evaluate(()=>{ const b=document.querySelector('#onlineForm .btn.primary'); return !!(b&&b.disabled); }); if(!busy) break; await p.waitForTimeout(250); } await p.waitForTimeout(700); };
 const fillSignup=async(p,{user,email,pw='supersecret1',captcha=true})=>{ if(user) await p.fill('#olUser',user); await p.fill('#olEmail',email); await p.fill('#olPass',pw); await p.fill('#olPass2',pw); await p.check('#olAgree'); if(captcha) await p.check('.fakeCaptcha'); await p.click('#onlineForm .btn.primary'); await settle(p); };
 const fillLogin=async(p,{email,pw='supersecret1'})=>{ await p.fill('#olEmail',email); await p.fill('#olPass',pw); await p.check('.fakeCaptcha'); await p.click('#onlineForm .btn.primary'); await settle(p); };

 // ---- Game Time on the website
 const CC=require(H.ROOT+'/web/companion-core.js');
 const g=await mk('G');
 await g.click('#guestBtn'); await g.waitForTimeout(300);
 await g.goto(BASE+'#companion'); await g.waitForTimeout(900);
 let txt=await g.textContent('#main');
 ok('without an online account the page shows the 5-step setup', txt.includes('Set up the Game Time companion') && ['Download','Install','Connect','Choose games','Set limits'].every(s=>txt.includes(s)));
 ok('the setup has no download button of its own and points to the Download app button under the profile', !(await g.$('.gt-steps a.btn')) && txt.includes('Download app') && await g.isVisible('#dlBtn'));
 ok('the setup explains the SmartScreen warning and that an online account is needed', txt.includes('Run anyway') && txt.includes('online account'));
 ok('the page explains what can and cannot be detected', txt.includes('Can\'t be detected') && txt.includes('WindowsApps'));
 await g.goto(BASE+'#gaming'); await g.waitForTimeout(300);
 ok('the Gaming page points to Game Time', !!(await g.$('.gt-promo a[href="#companion"]')));
 await g.goto(BASE+'#privacy'); await g.waitForTimeout(300);
 txt=await g.textContent('#main');
 ok('the privacy notice has a Game Time section with POPIA rights', txt.includes('4f. Game Time companion') && txt.includes('POPIA') && txt.includes('Information Regulator') && txt.includes('Never a list of your other programs'));

 // online account, no PC yet
 const a=await mk('A'); await onlineForm(a);
 await fillSignup(a,{user:'Gamer_1',email:'gamer@example.com'});
 const acc0=await acc(a); const owner=acc0.users.gamer_1.online.id;
 await a.goto(BASE+'#companion'); await a.waitForTimeout(1200);
 txt=await a.textContent('#main');
 ok('an online account without a PC sees setup and an empty PC list', txt.includes('Set up the Game Time companion') && txt.includes('No PC connected yet'));

 // seed what a connected PC would have uploaded
 const now=Date.now(), tz='Africa/Johannesburg', today=CC.dayKey(now,tz), MIN=60000;
 const dayStart=CC.dayStart(now,tz);
 const seg=(sid,game,name,s,e,open)=>{ const parts=CC.splitByDay(s,e,tz); return parts.map(p=>({id:`${sid}_${p.day}`, sid, device:'pc1', game, name, day:p.day, start:p.start, end:p.end, open:!!open, rev:e})); };
 const t0=Math.max(dayStart, now-6*60*MIN); // a window inside today
 const segs=[
   ...seg('s1','steam-1','ELDEN RING', t0, t0+40*MIN, false),
   ...seg('s2','epic-fn','Fortnite', t0+20*MIN, t0+50*MIN, false),          // overlaps s1 by 20 minutes
   ...seg('s3','steam-1','ELDEN RING', now-25*MIN, now-30*1000, true),        // still running on the PC
   ...seg('s4','steam-1','ELDEN RING', CC.dayStart(now-2*86400000,tz)+10*60*MIN, CC.dayStart(now-2*86400000,tz)+12*60*MIN, false),
 ];
 for (const s of segs) comp.GameSessions.set(s.id,{owner,item:{id:s.id,data:s}});
 const config={overallLimitMin:120, tz, notify:true, settingsAt:1, games:[
   {id:'steam-1',name:'ELDEN RING',source:'steam',enabled:true,limitMin:60,exes:[],editedAt:1},
   {id:'epic-fn',name:'Fortnite',source:'epic',enabled:true,limitMin:0,exes:['fortniteclient-win64-shipping.exe'],editedAt:1},
   {id:'m-1',name:'Old Game',source:'manual',enabled:false,limitMin:0,exes:['old.exe'],editedAt:1},
   {id:'gone',name:'Removed Game',source:'steam',deleted:true,editedAt:5}]};
 comp.CompanionConfig.set('cfg-abc',{owner,item:{id:'cfg-abc',data:{data:JSON.stringify(config),updatedAt:now}}});
 const dev={device:'pc1',name:'GAMING-PC',appVersion:'1.1.0',lastSeen:now-20*1000,tracking:true,playing:JSON.stringify([{game:'steam-1',name:'ELDEN RING',since:now-25*MIN}]),revoked:false,connectedAt:now-86400000};
 comp.CompanionDevices.set('dev-pc1',{owner,item:{id:'dev-pc1',data:dev}});
 // another member's data must never show up
 comp.GameSessions.set('x_'+today,{owner:'someone-else',item:{id:'x_'+today,data:{id:'x',sid:'x',device:'z',game:'steam-1',name:'ELDEN RING',day:today,start:t0,end:t0+300*MIN,open:false,rev:1}}});

 await a.goto(BASE+'#home'); await a.goto(BASE+'#companion'); await a.waitForTimeout(1800);
 txt=(await a.textContent('#main')).replace(/\s+/g,' ');
 ok('a fresh PC shows as connected, with the game being played now', txt.includes('Companion connected') && txt.includes('GAMING-PC') && !!(await a.$('.gt-playing')) && (await a.textContent('.gt-playing')).includes('ELDEN RING'));
 const clock1=await a.textContent('.gt-clock'); await a.waitForTimeout(1300); const clock2=await a.textContent('.gt-clock');
 ok('the current session clock counts up every second', /^00:2[45]:\d\d$/.test(clock1) && clock1!==clock2, clock1+' -> '+clock2);
 const expectSegs=segs.map(s=>s.open?{...s,end:Date.now()}:s), exp=CC.dayTotals(expectSegs,today);
 const played=await a.textContent('.statrow .stat:nth-child(1) .v');
 ok('today counts overlapping games once (union), and only this member\'s data', Math.abs(exp.overallMs/MIN - (()=>{const m=played.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);return (+m[1]||0)*60+(+m[2]||0);})())<=1, `${played} vs ${Math.round(exp.overallMs/MIN)}m`);
 ok('the overall limit, remaining time and progress bar are shown', txt.includes('Daily limit') && txt.includes('2h') && !!(await a.$('.card .gt-meter[role="progressbar"]')));
 const er=await a.$('[data-gid="steam-1"]');
 const erUsed=exp.perGame['steam-1'].ms, erText=er?await er.textContent():''; // depends on the time of day the test runs
 ok('each game shows its own limit and time left (or that it was reached)', erUsed>=60*MIN ? /Daily limit reached/.test(erText)&&/overtime/.test(erText) : /left of 1h/.test(erText), `${Math.round(erUsed/MIN)}m: ${erText.replace(/\s+/g,' ').slice(0,120)}`);
 ok('removed games are hidden and switched-off games say "Not tracked"', !txt.includes('Removed Game') && (await a.textContent('[data-gid="m-1"]')).includes('Not tracked'));
 ok('the week chart has 7 days and the history 14', (await a.$$('.gt-bars .col')).length===7 && (await a.$$('.gt-hist li')).length===14);
 ok('the PC list shows the device with its status', (await a.textContent('#main')).includes('Connected · tracking on'));

 // the PC stops checking in: no false "playing"
 dev.lastSeen=now-10*MIN; comp.CompanionDevices.set('dev-pc1',{owner,item:{id:'dev-pc1',data:dev}});
 await a.goto(BASE+'#home'); await a.goto(BASE+'#companion'); await a.waitForTimeout(1500);
 txt=(await a.textContent('#main')).replace(/\s+/g,' ');
 ok('an offline PC shows "last seen" and nothing as playing', txt.includes('Companion offline') && /Last seen 1\d min ago/.test(txt) && !(await a.$('.gt-playing')), txt.slice(0,200));
 const offTot=CC.dayTotals(segs,today).overallMs;
 const played2=await a.textContent('.statrow .stat:nth-child(1) .v');
 ok('time from a silent PC is not extended to now', Math.abs(offTot/MIN - (()=>{const m=played2.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);return (+m[1]||0)*60+(+m[2]||0);})())<=1, played2);

 // edits from the website
 dev.lastSeen=Date.now()-5000; comp.CompanionDevices.set('dev-pc1',{owner,item:{id:'dev-pc1',data:dev}});
 await a.goto(BASE+'#home'); await a.goto(BASE+'#companion'); await a.waitForTimeout(1500);
 const before=Date.now();
 await a.fill('[data-gtlimit="steam-1"]','90'); await a.press('[data-gtlimit="steam-1"]','Tab'); await a.waitForTimeout(900);
 let saved=JSON.parse(comp.CompanionConfig.get('cfg-abc').item.data.data);
 ok('changing a game limit on the website saves it with a fresh edit time', saved.games.find(x=>x.id==='steam-1').limitMin===90 && saved.games.find(x=>x.id==='steam-1').editedAt>=before);
 await a.fill('#gtOverall','150'); await a.press('#gtOverall','Tab'); await a.waitForTimeout(900);
 saved=JSON.parse(comp.CompanionConfig.get('cfg-abc').item.data.data);
 ok('the overall limit saves too', saved.overallLimitMin===150 && saved.settingsAt>=before);
 await a.click('[data-gttrack="epic-fn"]'); await a.waitForTimeout(900);
 saved=JSON.parse(comp.CompanionConfig.get('cfg-abc').item.data.data);
 ok('a game can be switched off from the website', saved.games.find(x=>x.id==='epic-fn').enabled===false);
 a.once('dialog',d=>d.accept()); await a.click('[data-gtdel="m-1"]'); await a.waitForTimeout(900);
 saved=JSON.parse(comp.CompanionConfig.get('cfg-abc').item.data.data);
 ok('removing a game leaves a "deleted" marker for the PC', saved.games.find(x=>x.id==='m-1').deleted===true);
 ok('the website never stores folders or paths', !JSON.stringify(saved).match(/dirs|paths|\\\\/));

 // automatic refresh
 dev.playing=JSON.stringify([{game:'epic-fn',name:'Fortnite',since:Date.now()-3*MIN}]); dev.lastSeen=Date.now(); comp.CompanionDevices.set('dev-pc1',{owner,item:{id:'dev-pc1',data:dev}});
 await a.waitForTimeout(16500);
 ok('the page updates by itself (every 15 seconds)', (await a.textContent('.gt-playing').catch(()=>'')).includes('Fortnite'));

 // disconnect a PC, delete online history
 a.once('dialog',d=>d.accept()); await a.click('[data-gtrevoke="dev-pc1"]'); await a.waitForTimeout(1200);
 ok('"Disconnect" marks the PC as disconnected', comp.CompanionDevices.get('dev-pc1').item.data.revoked===true && comp.CompanionDevices.get('dev-pc1').item.data.playing==='[]');
 a.once('dialog',d=>d.accept()); await a.click('#gtDelOnline'); await a.waitForTimeout(1500);
 ok('"Delete my online game history" removes only this member\'s sessions', [...comp.GameSessions.values()].every(x=>x.owner!==owner) && comp.GameSessions.has('x_'+today));

 // phone layout and accessibility
 const ph=await mk('P',{w:390,h:844});
 await ph.evaluate(s=>localStorage.setItem('levelup-accounts-v1',s), JSON.stringify(await acc(a)));
 await ph.evaluate(([k,v])=>localStorage.setItem(k,v), ['levelup-life-v1:u:gamer_1', JSON.stringify(await st(a,'gamer_1'))]);
 for (const s of segs) comp.GameSessions.set(s.id,{owner,item:{id:s.id,data:s}});
 dev.revoked=false; dev.lastSeen=Date.now(); comp.CompanionDevices.set('dev-pc1',{owner,item:{id:'dev-pc1',data:dev}});
 await ph.goto(BASE+'#companion'); await ph.reload(); await ph.waitForTimeout(2000);
 ok('the page fits a phone screen', await ph.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await ph.screenshot({path:D+'shots2/gametime-phone.png',fullPage:true});
 await a.setViewportSize({width:1440,height:950}); await a.goto(BASE+'#home'); await a.goto(BASE+'#companion'); await a.waitForTimeout(1500);
 await a.screenshot({path:D+'shots2/gametime-web.png',fullPage:true});
 // Japanese: no known English sentence is left on the page (names, brands and programs are allowed)
 const KEYS=fs.readFileSync(H.ROOT+'/i18n/keys.txt','utf8').split('\n').filter(l=>l&&!l.startsWith('##'));
 const JA=fs.readFileSync(H.ROOT+'/i18n/ja.txt','utf8').split('\n').filter(l=>l&&!l.startsWith('##'));
 const translatable=new Set(KEYS.filter((k,i)=>JA[i]!==k&&!k.includes('{s}')));
 await a.evaluate(()=>localStorage.setItem('levelup-lang','ja')); await a.goto(BASE+'#companion'); await a.reload(); await a.waitForTimeout(2500);
 const left=await a.evaluate(()=>{ const out=[]; const w=document.createTreeWalker(document.querySelector('#main'),NodeFilter.SHOW_TEXT); let n;
   while((n=w.nextNode())){ const v=n.nodeValue.replace(/\s+/g,' ').trim(); if(v&&/[A-Za-z]{3}/.test(v)&&!n.parentElement.closest('[translate="no"]')) out.push(v); } return out; });
 const stillEnglish=left.filter(v=>translatable.has(v.replace(/\d+/g,'#')));
 ok('in Japanese, every Game Time sentence is translated', stillEnglish.length===0, stillEnglish.slice(0,5).join(' | '));
 await a.screenshot({path:D+'shots2/gametime-ja.png',fullPage:true});
 await a.evaluate(()=>localStorage.removeItem('levelup-lang')); await a.reload(); await a.waitForTimeout(1500);
 for (const theme of ['dark','light']) {
   await a.evaluate(t=>document.documentElement.dataset.theme=t, theme); await a.waitForTimeout(200);
   await a.addScriptTag({path:H.AXE});
   const v=await a.evaluate(async()=>(await axe.run(document.querySelector('#main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']})).violations.map(x=>x.id+': '+x.nodes.slice(0,2).map(n=>n.target.join(' ')).join(', ')));
   ok(`no accessibility problems on Game Time (${theme})`, v.length===0, v.join(' | '));
 }

 srv.kill(); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
