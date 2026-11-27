// New features: login streak, weekly challenges, achievements, bio/favourite games, weekly leaderboard,
// notifications, private messages, study groups, seasonal themes, more emoji slots.
const {chromium}=require('playwright'); const fs=require('fs'); const {spawn,execFileSync}=require('child_process');
const H=require('./harness'); const D=H.OUT;
const OKEY=H.OKEY;
const SITE=D+'served18/'; fs.rmSync(SITE,{recursive:true,force:true}); H.copySite(SITE);
const BASE='http://localhost:8766/';
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
 const srv=spawn('node',[H.SERVE,SITE,'8766']); process.on('exit',()=>srv.kill()); process.on('uncaughtException',e=>{ console.log('CRASH:',e.message.split('\n')[0]); srv.kill(); process.exit(1); });
 srv.on('exit',c=>{ if(c) { console.log('server failed to start'); process.exit(1); } }); await new Promise(r=>srv.stdout.once('data',r));
 const b=await chromium.launch(); const errs=[]; const ok=(t,c,x='')=>console.log(`${c?'PASS':'FAIL'}  ${t} ${c?'':x}`);
 const mk=async(name,{w=1440,h=950}={})=>{ const ctx=await b.newContext({viewport:{width:w,height:h}}); await ctx.route(/wixapis\.com/,mock);
   const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(BASE); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(900); };
 const st=async(p,u)=>p.evaluate(k=>JSON.parse(localStorage.getItem('levelup-life-v1:u:'+k)),u);
 const edit=async(p,u,fn)=>{ await p.evaluate(([k,src])=>{ const s=JSON.parse(localStorage.getItem('levelup-life-v1:u:'+k)); (new Function('s',src))(s); localStorage.setItem('levelup-life-v1:u:'+k,JSON.stringify(s)); },[u,fn]); await p.reload(); await p.waitForTimeout(1200); };
 const goPublic=async p=>{ await p.goto(BASE+'#players'); await p.waitForTimeout(300); const g=await p.$('#goPublic'); if(g){ await g.click(); await p.waitForTimeout(2500);} };

 // ---- login streak + daily check-in
 const a=await mk('ana'); await signup(a,'Ana_01');
 let s=await st(a,'ana_01');
 ok('first visit counts as day 1 of the login streak', s.days.length===1 && s.days[0]===dayOff(0));
 ok('daily check-in gives +5 XP (on top of the +10 welcome XP)', s.xp===15, 'xp='+s.xp);
 ok('home shows the weekly card with 3 challenges', (await a.$$('.challenges li')).length===3 && (await a.textContent('.streak-box')).includes('1'));
 await a.reload(); await a.waitForTimeout(800); s=await st(a,'ana_01');
 ok('a second visit on the same day gives nothing', s.xp===15 && s.days.length===1);
 await edit(a,'ana_01',`s.days=[${[6,5,4,3,2,1].map(k=>`'${dayOff(k)}'`).join(',')}];`);
 s=await st(a,'ana_01');
 ok('7 days in a row: streak bonus and the "Regular" achievement', s.days.length===7 && s.ach.streak7 && s.xp===15+5+25+50, 'xp='+s.xp);
 ok('the streak shows on Home', (await a.textContent('.streak-n')).startsWith('7'));

 // ---- weekly challenges: make the counter-based ones complete
 const names=await a.$$eval('.challenges li b',x=>x.map(e=>e.textContent));
 const expectDone=names.filter(t=>/^(Finish \d+ focus session|Complete|Do |Watch|Send|Learn for)/.test(t)).length;
 const xp0=(await st(a,'ana_01')).xp;
 await edit(a,'ana_01',`s.stats.chat+=20; s.stats.group+=5; s.focus.count+=10; s.questsTotal+=10; for(let i=0;i<6;i++) s.lessons['web.0.'+i]='${dayOff(0)}'; for(let i=0;i<5;i++) s.yt.push({id:'v'+i,url:'',title:'v',kind:'learn',mins:5,watched:true}); s.log.push({d:'${dayOff(0)}',cat:'learn',m:300});`);
 await a.waitForTimeout(800); s=await st(a,'ana_01');
 ok(`weekly challenges complete and give XP (${expectDone} of this week's 3 can be forced)`, s.wk.done.length===expectDone && (await a.$$('.challenges li.done')).length===expectDone && s.xp>=xp0+75*expectDone, names.join(' | ')+' xp '+xp0+'->'+s.xp);
 ok('weekly XP is counted', s.wk.xp>=75*expectDone);
 ok('a notification is added for finished challenges', !expectDone || s.notes.some(x=>x.t.includes('Weekly challenge done')));

 // ---- notifications panel
 const unread=(await st(a,'ana_01')).notes.filter(x=>!x.r).length;
 ok('the bell shows the unread count', (await a.textContent('#bellN')).trim()===String(Math.min(unread,9))+(unread>9?'+':'') && await a.isVisible('#bellN'));
 await a.click('#bellBtn'); await a.waitForTimeout(200);
 ok('the bell opens the notification list', await a.isVisible('#notePanel') && (await a.textContent('#notePanel')).includes('streak') && (await a.getAttribute('#bellBtn','aria-expanded'))==='true');
 await a.click('#npRead'); await a.waitForTimeout(100);
 ok('"Mark all read" clears the count', await a.isHidden('#bellN'));
 await a.keyboard.press('Escape'); ok('Esc closes the list', await a.isHidden('#notePanel'));

 // ---- bio + favourite games + achievements page
 await a.goto(BASE+'#badges'); await a.waitForTimeout(300);
 await a.fill('#abBio','Learning web design. Racing games fan!'); await a.fill('#abGame','Forza Horizon'); await a.click('#abAdd'); await a.waitForTimeout(300);
 await a.click('#aboutForm .btn.primary'); await a.waitForTimeout(800);
 s=await st(a,'ana_01');
 ok('bio and favourite games are saved', s.bio.startsWith('Learning web') && s.favs[0]==='Forza Horizon');
 ok('"About me" achievement unlocks', !!s.ach.aboutme);
 ok('Achievements card lists unlocked ones', (await a.textContent('.ach-grid')).includes('About me') && (await a.$$('.ach.on')).length>=2);

 // ---- public profiles, weekly leaderboard, friends
 await goPublic(a);
 const bb=await mk('ben'); await signup(bb,'Ben_02'); await goPublic(bb);
 const cc=await mk('cat'); await signup(cc,'Cat_03'); await goPublic(cc);
 const prof=JSON.parse(JSON.parse(players.get('p-ana_01').data.payload).d);
 ok('public profile carries bio, games, achievements, weekly XP and a message key', prof.bio.startsWith('Learning') && prof.fg[0]==='Forza Horizon' && prof.ac.includes('aboutme') && prof.wx>0 && prof.wk && prof.dx && prof.dy);
 await bb.goto(BASE+'#players'); await bb.waitForTimeout(1500); await bb.click('[data-lbtab="week"]'); await bb.waitForTimeout(200);
 const wkRows=await bb.$$eval('#lbList .lb-row',x=>x.map(e=>e.textContent.replace(/\s+/g,' ')));
 ok('"This week" leaderboard ranks by weekly XP', wkRows.length>=1 && wkRows[0].includes('Ana_01') && /\d+ XP/.test(wkRows[0]), wkRows.join(' | '));
 await bb.click('#lbList [data-player="ana_01"]'); await bb.waitForTimeout(700);
 const pm=await bb.textContent('#pmBody');
 ok('profile shows bio, favourite games and achievements', pm.includes('Racing games fan') && pm.includes('Forza Horizon') && pm.includes('Achievements') && pm.includes('This week'));
 ok('no Message button before being friends', !(await bb.$('#pmBody [data-dmgo]')));
 await bb.click('#pmBody [data-fr="add"]'); await bb.waitForTimeout(1500); await bb.keyboard.press('Escape');
 await a.goto(BASE+'#home'); await a.goto(BASE+'#players'); await a.waitForTimeout(2000);
 s=await st(a,'ana_01');
 ok('friend request becomes a notification', s.notes.some(x=>x.t.includes('Ben_02 sent you a friend request')) && await a.isVisible('#bellN'));
 await a.click('#lbList [data-player="ben_02"]'); await a.waitForTimeout(700); await a.click('#pmBody [data-fr="add"]'); await a.waitForTimeout(1800);
 ok('"First friend" achievement', !!(await st(a,'ana_01')).ach.friend1);
 ok('friends get a Message button', !!(await a.$('#pmBody [data-dmgo="ben_02"]')));

 // ---- private messages
 await a.click('#pmBody [data-dmgo="ben_02"]'); await a.waitForTimeout(1200);
 ok('Message opens the conversation', (await a.evaluate(()=>location.hash))==='#messages' && (await a.textContent('#dmConv')).includes('Ben_02') && !!(await a.$('#dmIn')));
 await a.fill('#dmIn','hello secret pineapple'); await a.click('#dmForm .btn.primary'); await a.waitForTimeout(1500);
 const box=players.get('dm-ana_01');
 ok('message is stored in the outbox', !!box && JSON.parse(JSON.parse(box.data.payload).d).m.length===1);
 ok('message is end-to-end encrypted (not readable on the server)', !box.data.payload.includes('pineapple'));
 ok('the sent message shows in the chat', (await a.textContent('#dmMsgs')).includes('hello secret pineapple'));
 await bb.goto(BASE+'#messages'); await bb.waitForTimeout(2500);
 ok('friend sees an unread count', (await bb.textContent('#dmList')).includes('Ana_01') && !!(await bb.$('#dmList .tag.p')));
 await bb.click('#dmList [data-dm="ana_01"]'); await bb.waitForTimeout(1500);
 ok('friend can read it', (await bb.textContent('#dmMsgs')).includes('hello secret pineapple'));
 await bb.fill('#dmIn','hi Ana! 👋'); await bb.press('#dmIn','Enter'); await bb.waitForTimeout(800);
 await a.waitForTimeout(7000);
 ok('the reply arrives live', (await a.textContent('#dmMsgs')).includes('hi Ana!'));
 // a forged message (not signed by Ben) is ignored
 const forged=JSON.parse(players.get('dm-ben_02').data.payload); const fd=JSON.parse(forged.d); fd.m.push({...fd.m[0],id:'deadbeef01',at:Date.now()}); forged.d=JSON.stringify(fd); players.get('dm-ben_02').data.payload=JSON.stringify(forged);
 await a.waitForTimeout(7000);
 ok('a changed outbox (bad signature) is ignored', (await st(a,'ana_01')).dm.ben_02.filter(x=>!x.f).length===1);
 ok('"Pen pal" achievement', !!(await st(a,'ana_01')).ach.dm1);
 await cc.goto(BASE+'#messages'); await cc.waitForTimeout(2000);
 ok('non-friends are not in the message list', !(await cc.textContent('#dmList')).includes('Ana_01'));

 // ---- study groups
 await a.goto(BASE+'#focus'); await a.waitForTimeout(400); await a.click('#grpNew'); await a.waitForTimeout(1500);
 const code=(await a.textContent('.grp-code')).trim();
 ok('a group code is created', /^[a-z]+-[0-9a-f]{6}-[0-9a-f]{6}$/.test(code), code);
 await bb.goto(BASE+'#focus'); await bb.waitForTimeout(300); await bb.fill('#grpCode',code); await bb.click('#grpJoin .btn'); await bb.waitForTimeout(2500);
 ok('both members show in the group', (await bb.$$('#grpList .grp-m')).length===2 && (await bb.textContent('#grpList')).includes('Ana_01'));
 ok('group status is encrypted', ![...players.values()].some(i=>String(i.id).startsWith('gs-') && String(i.data.payload).includes('Ana_01')));
 await a.click('#tGo'); await a.waitForTimeout(1500);
 await bb.waitForTimeout(9000);
 const row=await bb.textContent('#grpList');
 ok('a friend\'s running timer shows live', row.includes('Focusing') && /\d\d:\d\d/.test(row), row.replace(/\s+/g,' '));
 const t1=await bb.textContent('#grpList .grp-m.focus .grp-time'); await bb.waitForTimeout(2100); const t2=await bb.textContent('#grpList .grp-m.focus .grp-time');
 ok('the countdown ticks every second', t1!==t2, t1+' '+t2);
 // finishing a session while a friend is in the group gives the group bonus
 const g0=(await st(a,'ana_01')).stats.group;
 await a.click('#tReset'); await a.fill('[data-len="work"]','1'); await a.press('[data-len="work"]','Tab'); await a.waitForTimeout(200); await a.click('#tGo'); await a.waitForTimeout(63000);
 s=await st(a,'ana_01');
 ok('finishing a focus session together counts as a group session', s.stats.group===g0+1 && !!s.ach.group1, JSON.stringify(s.stats));
 await bb.click('#grpLeave'); await bb.waitForTimeout(1200);
 ok('leaving the group removes you', (await st(bb,'ben_02')).group==='' && players.get('gs-'+(await st(bb,'ben_02')).gid).data.kind==='grp-left');

 // ---- seasonal themes
 await a.goto(BASE+'#options'); await a.waitForTimeout(300);
 ok('automatic season adds nothing on a normal day', (await a.evaluate(()=>document.documentElement.dataset.season))==='' || new Date().getMonth()>=9);
 await a.selectOption('#stSeason','winter'); await a.waitForTimeout(200);
 ok('winter theme: snow and a blue accent', (await a.evaluate(()=>document.documentElement.dataset.season))==='winter' && (await a.$$('#seasonFx i')).length===18);
 await a.selectOption('#stSeason','off'); await a.waitForTimeout(200);
 ok('turning it off removes the decorations', !(await a.$('#seasonFx')));

 // ---- more emoji slots (owner)
 const o=await mk('owner'); await signup(o,'Jinx002'); await o.goto(BASE+'#options'); await o.fill('#ownKey',OKEY); await o.click('#ownForm .btn.primary'); await o.waitForTimeout(5000);
 await o.goto(BASE+'#badges'); await o.waitForTimeout(500);
 ok('owner has 250 emoji slots', (await o.textContent('#main')).includes('0/250'));

 // ---- privacy terms
 await a.goto(BASE+'#privacy'); ok('privacy terms explain messages and groups', (await a.textContent('#main')).includes('Private messages (friends only)') && (await a.textContent('#main')).includes('Study groups'));

 // ---- layout checks on a phone
 const ph2=await mk('phone2',{w:390,h:800}); await signup(ph2,'Pho_04'); await goPublic(ph2);
 let wide=[]; for (const r of ['home','messages','focus','badges','players','options']) { await ph2.goto(BASE+'#'+r); await ph2.waitForTimeout(400); if (await ph2.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) wide.push(r); }
 ok('no horizontal scrolling on a phone', !wide.length, wide.join(','));
 await ph2.goto(BASE+'#home'); await ph2.waitForTimeout(300); await ph2.screenshot({path:D+'shots2/f-home-phone.png',fullPage:true});
 await a.goto(BASE+'#home'); await a.waitForTimeout(300); await a.screenshot({path:D+'shots2/f-home.png'});
 await a.goto(BASE+'#messages'); await a.waitForTimeout(600); await a.screenshot({path:D+'shots2/f-dm.png'});
 await bb.goto(BASE+'#focus'); await bb.waitForTimeout(300); await bb.fill('#grpCode',code); await bb.click('#grpJoin .btn'); await bb.waitForTimeout(2500); await bb.screenshot({path:D+'shots2/f-group.png'});
 await bb.goto(BASE+'#players'); await bb.waitForTimeout(1200); await bb.click('#lbList [data-player="ana_01"]'); await bb.waitForTimeout(700); await bb.screenshot({path:D+'shots2/f-profile.png'});
 srv.kill(); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
