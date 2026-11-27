// New features: login streak, weekly challenges, achievements, bio/favourite games, weekly leaderboard,
// notifications, private messages, study groups, seasonal themes, more emoji slots.
const {chromium}=require('playwright'); const fs=require('fs'); const {spawn,execFileSync}=require('child_process');
const H=require('./harness'); const D=H.OUT;
const OKEY=H.OKEY;
const SITE=D+'served20/'; fs.rmSync(SITE,{recursive:true,force:true}); H.copySite(SITE); fs.writeFileSync(SITE+'mockauth.html','<script>var q=new URLSearchParams(location.search);parent.postMessage({code:"code-"+q.get("sess"),state:q.get("state")},"*");</script>');
const BASE='http://localhost:8771/';
const chat=[], players=new Map(); let n=0;
const hdr={'access-control-allow-origin':'*','content-type':'application/json'};
const one=(have,want)=>want&&typeof want==='object'&&Array.isArray(want.$in)?want.$in.includes(have):have===want;
const match=(data,id,f)=>Object.entries(f||{}).every(([k,v])=>k==='_id'?one(id,v):one(data[k],v));

const members=new Map(), codes=new Map(), memberData=new Map(); let mid=0;
const CAPTCHA_JS="(function(){var g={render:function(el,o){el.innerHTML='<label class=\"fakecap\"><input type=\"checkbox\" class=\"fakeCaptcha\"> I am not a robot</label>';return 1;},getResponse:function(){var c=document.querySelector('.fakeCaptcha');return c&&c.checked?'ok-token':'';},reset:function(){var c=document.querySelector('.fakeCaptcha');if(c)c.checked=false;}};window.grecaptcha={enterprise:g};var m=(document.currentScript.src.match(/onload=([A-Za-z_]+)/)||[])[1];if(m&&window[m])window[m]();})();";
async function mock(route){
  const req=route.request(), u=req.url(), body=req.postData()?JSON.parse(req.postData()):{}, auth=req.headers()['authorization']||'';
  const ok=o=>route.fulfill({status:200,headers:hdr,body:JSON.stringify(o)}), bad=(s,o)=>route.fulfill({status:s,headers:hdr,body:JSON.stringify(o)});
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
 const srv=spawn('node',[H.SERVE,SITE,'8771']); process.on('exit',()=>srv.kill()); process.on('uncaughtException',e=>{ console.log('CRASH:',e.message.split('\n')[0]); srv.kill(); process.exit(1); });
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

 // ---- sign up online (device A)
 const a=await mk('A');
 await onlineForm(a);
 ok('the account window has an Online tab with the “not a robot” check', await a.isVisible('#onlineForm') && await a.isVisible('.fakeCaptcha') && await a.isHidden('#authNote'));
 await fillSignup(a,{user:'Cloudy_1',email:'cloudy@example.com',captcha:false});
 ok('sign-up needs the robot check', (await a.textContent('#olErr')).includes('not a robot'));
 await a.fill('#olPass2','supersecret1'); await a.check('.fakeCaptcha'); await a.click('#onlineForm .btn.primary'); await settle(a);
 let ac=await acc(a);
 ok('online sign-up creates a linked account and logs in', ac.current==='Cloudy_1' && ac.users.cloudy_1 && ac.users.cloudy_1.online && ac.users.cloudy_1.online.email==='cloudy@example.com' && /^rt-/.test(ac.users.cloudy_1.online.rt) && await a.isHidden('#consent'), JSON.stringify(ac).slice(0,300));
 let item=memberData.get('m-'+ac.users.cloudy_1.online.id);
 ok('progress is uploaded to the member’s own item', !!item);
 ok('the uploaded progress is encrypted', item && !item.item.data.payload.includes('Cloudy_1') && !/"xp"\s*:/.test(item.item.data.payload) && Object.keys(JSON.parse(item.item.data.payload)).sort().join()==='ct,iv,v,z'); // (random ciphertext can contain the letters "xp" by chance, so look for a readable field)
 // make progress, sync
 const s0=saves; await a.goto(BASE+'#study'); await a.fill('#taskIn','cloud task from A'); await a.press('#taskIn','Enter'); await a.waitForTimeout(300);
 await a.goto(BASE+'#options'); await a.waitForTimeout(400);
 ok('Settings shows the online account', (await a.textContent('#main')).includes('Online account') && (await a.textContent('#main')).includes('cloudy@example.com') && !(await a.$('#pwForm')));
 await a.click('#cloudSync'); await a.waitForTimeout(2500);
 ok('Sync now uploads the change', saves>s0 && (await a.textContent('#cloudStatus')).includes('Synced'), await a.textContent('#cloudStatus'));
 // public profile from A
 await a.goto(BASE+'#players'); await a.waitForTimeout(300); await a.click('#goPublic'); await a.waitForTimeout(2500);
 await a.goto(BASE+'#options'); await a.waitForTimeout(300); await a.click('#cloudSync'); await a.waitForTimeout(2500);
 const pubX=JSON.parse(JSON.parse(players.get('p-cloudy_1').data.payload).d).x;

 // ---- device B logs in
 const bb=await mk('B'); await onlineForm(bb,'login');
 await fillLogin(bb,{email:'cloudy@example.com',pw:'wrongpassword'});
 ok('wrong password is refused', (await bb.textContent('#olErr')).includes('Wrong email or password'));
 await bb.fill('#olPass','supersecret1'); await bb.check('.fakeCaptcha'); await bb.click('#onlineForm .btn.primary'); await settle(bb);
 let sB=await st(bb,'cloudy_1');
 ok('logging in on another device brings the progress', sB && sB.tasks.some(t=>t.text==='cloud task from A') && (await acc(bb)).current==='Cloudy_1');
 await bb.goto(BASE+'#players'); await bb.waitForTimeout(2500);
 ok('the same leaderboard identity works on the second device', !(await bb.textContent('#main')).includes('already uses the name') && sB.pub===true);
 await bb.goto(BASE+'#study'); await bb.fill('#taskIn','task from B'); await bb.press('#taskIn','Enter'); await bb.waitForTimeout(300);
 await bb.goto(BASE+'#options'); await bb.waitForTimeout(300); await bb.click('#cloudSync'); await bb.waitForTimeout(2500);
 const x2=JSON.parse(JSON.parse(players.get('p-cloudy_1').data.payload).d).x;
 ok('both devices publish with the same key', x2===pubX);
 await a.goto(BASE+'#study'); await a.fill('#taskIn','second task from A'); await a.press('#taskIn','Enter'); await a.waitForTimeout(300);
 await a.goto(BASE+'#options'); await a.waitForTimeout(300); await a.click('#cloudSync'); await a.waitForTimeout(3000);
 const sa=await st(a,'cloudy_1'); ok('when both devices changed, nothing is lost', sa.tasks.some(t=>t.text==='task from B') && sa.tasks.some(t=>t.text==='second task from A'), JSON.stringify(sa.tasks.map(t=>t.text)));
 // offline login on B with the same password (local)
 await bb.click('#acLogout'); await bb.waitForTimeout(300); await bb.click('[data-auth="login"]'); await bb.fill('#liUser','Cloudy_1'); await bb.fill('#liPass','supersecret1'); await bb.click('#loginForm .btn.primary'); await H.authDone(bb); await bb.waitForTimeout(1500);
 ok('the online password also works for a normal login on that device', (await acc(bb)).current==='Cloudy_1');

 // ---- password reset: a new device needs the old password once
 await a.goto(BASE+'#options'); await a.waitForTimeout(300); await a.click('#cloudReset'); await a.waitForTimeout(800);
 ok('“Reset password by email” asks Wix to send the email', recoveries.some(r=>r.email==='cloudy@example.com' && r.redirect && r.redirect.clientId));
 [...members.values()].find(m=>m.email==='cloudy@example.com').pw='newpassword9';
 const c=await mk('C'); await onlineForm(c,'login'); await fillLogin(c,{email:'cloudy@example.com',pw:'newpassword9'});
 ok('after a reset, the old password unlocks the saved progress once', await c.isVisible('#olOld'));
 await c.fill('#olOld','wrongold'); await c.click('#onlineForm .btn.primary'); await c.waitForTimeout(1500);
 ok('a wrong old password is refused', (await c.textContent('#olErr')).includes("didn't unlock"));
 await c.fill('#olOld','supersecret1'); await c.click('#onlineForm .btn.primary'); await settle(c); await c.waitForTimeout(2000);
 ok('progress unlocked on the new device', (await st(c,'cloudy_1')).tasks.some(t=>t.text==='task from B'));
 const d=await mk('D'); await onlineForm(d,'login'); await fillLogin(d,{email:'cloudy@example.com',pw:'newpassword9'});
 ok('after unlocking, the new password works everywhere', !(await d.isVisible('#olOld').catch(()=>false)) && (await st(d,'cloudy_1')).tasks.some(t=>t.text==='task from B'));

 // ---- connect an existing local account
 const e=await mk('E'); await e.fill('#suUser','Local_2'); await e.fill('#suPass','password123'); await e.fill('#suPass2','password123'); await e.check('#suAgree'); await e.click('#signupForm .btn.primary'); await H.authDone(e); await e.waitForTimeout(900);
 await e.goto(BASE+'#study'); await e.fill('#taskIn','local only task'); await e.press('#taskIn','Enter'); await e.waitForTimeout(300);
 await e.goto(BASE+'#options'); await e.waitForTimeout(300); await e.click('[data-online="connect"]'); await e.waitForTimeout(500);
 ok('“Make it an online account” keeps the username', (await e.inputValue('#olUser'))==='Local_2' && await e.getAttribute('#olUser','readonly')!==null);
 await fillSignup(e,{email:'local2@example.com'}); await e.waitForTimeout(500);
 const ae=await acc(e);
 ok('the local account becomes an online account with its progress', ae.users.local_2.online && ae.current==='Local_2' && !!memberData.get('m-'+ae.users.local_2.online.id));
 const f=await mk('F'); await onlineForm(f,'login'); await fillLogin(f,{email:'local2@example.com',pw:'supersecret1'});
 ok('…and the progress follows to another device', (await st(f,'local_2')||{tasks:[]}).tasks.some(t=>t.text==='local only task'));
 const s1=await f.evaluate(()=>JSON.parse(localStorage.getItem('levelup-accounts-v1')));

 // ---- email verification and owner approval
 const g=await mk('G'); await onlineForm(g); await fillSignup(g,{user:'Veri_3',email:'verify3@example.com'});
 ok('email verification asks for the code', await g.isVisible('#olCode'));
 await g.fill('#olCode','000000'); await g.click('#onlineForm .btn.primary'); await g.waitForTimeout(800);
 ok('a wrong code is refused', (await g.textContent('#olErr')).includes("code didn't work"));
 await g.fill('#olCode','123456'); await g.click('#onlineForm .btn.primary'); await settle(g);
 ok('the right code finishes sign-up', (await acc(g)).current==='Veri_3');
 const h=await mk('H'); await onlineForm(h); await fillSignup(h,{user:'Appr_4',email:'approve4@example.com'});
 ok('owner approval is explained', (await h.textContent('#onlineForm')).includes('waiting for the owner'));
 const dup=await mk('I'); await onlineForm(dup); await fillSignup(dup,{user:'Dupe_5',email:'cloudy@example.com'});
 ok('an email that already has an account is explained', (await dup.textContent('#olErr')).includes('already has an online account'));
 await dup.click('#olForgot').catch(()=>{});

 // ---- delete an online account
 await d.goto(BASE+'#options'); await d.waitForTimeout(300); await d.click('#acDelete'); await d.click('#acDelete'); await d.waitForTimeout(2500);
 const id=[...members.values()].find(m=>m.email==='cloudy@example.com').id;
 ok('deleting the account clears the online copy', !memberData.get('m-'+id).item.data.payload.includes('task') && (await acc(d)).current===null);

 // ---- desktop app (file://)
 const ctx=await b.newContext(); const fp=await ctx.newPage(); fp.on('pageerror',e=>errs.push('file: '+e.message));
 await fp.goto('file://'+SITE+'app.html'); await fp.waitForTimeout(500); await fp.click('[data-auth="online"]'); await fp.waitForTimeout(300);
 ok('the desktop app points to the website for online accounts', (await fp.textContent('#onlineForm')).includes('Open the website'));
 // phone layout
 const ph=await mk('phone',{w:390,h:800}); await onlineForm(ph);
 ok('online form fits a phone', !(await ph.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)));
 await ph.screenshot({path:D+'shots2/online-phone.png'}); await a.goto(BASE+'#options'); await a.waitForTimeout(500); await a.screenshot({path:D+'shots2/online-settings.png'});
 srv.kill(); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
