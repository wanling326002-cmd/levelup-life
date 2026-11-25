// Social features: public profiles, leaderboard, friends, moderation, clickable chat names, chat emoji.
const {chromium}=require('playwright'); const fs=require('fs');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
const OKEY=H.OKEY, AKEY=H.AKEY;
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
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
 const mk=async(name,w=1440)=>{ const ctx=await b.newContext({viewport:{width:w,height:950}}); await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort()); await ctx.route(/wixapis\.com/,mock); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(URL); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await p.waitForTimeout(900); };
 const unlock=async(p,k)=>{ await p.goto(URL+'#options'); await p.fill('#ownKey',k); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000); };
 const goPublic=async p=>{ await p.goto(URL+'#players'); await p.waitForTimeout(300); await p.click('#goPublic'); await p.waitForTimeout(2500); };
 const rows=p=>p.$$eval('#lbList .lb-row',els=>els.map(e=>({u:e.dataset.player,lv:e.querySelector('.lb-lv').textContent,owner:!!e.querySelector('.tag.owner'),admin:!!e.querySelector('.tag.adm')})));
 const refresh=async p=>{ await p.goto(URL+'#players'); await p.waitForTimeout(300); await p.click('#lbRefresh'); await p.waitForTimeout(1500); };

 // owner, admin, two members
 const own=await mk('owner'); await signup(own,'Jinx002'); await unlock(own,OKEY);
 await own.goto(URL+'#players'); await own.waitForTimeout(300);
 ok('private by default: join card shown', (await own.$$('#goPublic')).length===1);
 ok('nothing published before opting in', players.size===0);
 await goPublic(own);
 ok('going public publishes one profile item', players.has('p-jinx002') && players.size===1);
 const adm=await mk('admin'); await signup(adm,'BestFriend'); await unlock(adm,AKEY); await goPublic(adm);
 const kid=await mk('kid'); await signup(kid,'Kid123'); await goPublic(kid);
 const cheat=await mk('cheat'); await signup(cheat,'Cheater');
 await cheat.evaluate(()=>{const k='levelup-life-v1:u:cheater';const d=JSON.parse(localStorage.getItem(k));d.xp=200000;localStorage.setItem(k,JSON.stringify(d));}); await cheat.reload(); await cheat.waitForTimeout(800);
 await goPublic(cheat);
 await refresh(kid); let r=await rows(kid);
 ok('leaderboard lists all 4 public players', r.length===4, JSON.stringify(r.map(x=>x.u)));
 ok('owner ranked first with verified Owner tag, Lv 1000', r[0].u==='jinx002' && r[0].owner && r[0].lv==='Lv 1000');
 ok('admin shows verified Admin tag', r.some(x=>x.u==='bestfriend'&&x.admin));
 ok('sorted by level', r[1].u==='cheater');
 // forged records
 const own0=players.get('p-jinx002');
 players.set('p-faker',{id:'p-faker',data:{kind:'player',payload:JSON.stringify({d:JSON.stringify({v:1,u:'faker',n:'faker',lv:999,xp:5,rk:[],fr:[],x:'AAAA',y:'BBBB'}),s:'AAAA'}),_id:'p-faker'}});
 const kidItem=JSON.parse(players.get('p-kid123').data.payload); const kp=JSON.parse(kidItem.d); kp.lv=999; kp.role='owner';
 players.set('p-kid124',{id:'p-kid124',data:{kind:'player',payload:JSON.stringify({d:JSON.stringify({...kp,u:'kid124'}),s:kidItem.s}),_id:'p-kid124'}});
 await refresh(kid); r=await rows(kid);
 ok('profiles with bad signatures are ignored', !r.some(x=>x.u==='faker'||x.u==='kid124') && r.length===4);
 // someone else edits Kid123's profile to say level 999 (signature no longer matches)
 const saved=players.get('p-kid123'); players.set('p-kid123',{...saved,data:{...saved.data,payload:JSON.stringify({d:JSON.stringify({...JSON.parse(kidItem.d),lv:999}),s:kidItem.s})}});
 await refresh(adm); r=await rows(adm);
 ok('a tampered profile is rejected', !r.some(x=>x.u==='kid123'));
 players.set('p-kid123',saved);
 // name taken on another device
 const dup=await mk('dup'); await signup(dup,'kid123'); await goPublic(dup);
 ok('same username on another device is refused', (await dup.textContent('#main')).includes('already uses the name') && JSON.parse(JSON.parse(players.get('p-kid123').data.payload).d).x===JSON.parse(kidItem.d).x);
 // profile window
 await refresh(kid); await kid.click('#lbList [data-player="bestfriend"]'); await kid.waitForTimeout(600);
 ok('clicking a player opens their profile', await kid.isVisible('#playerModal') && (await kid.textContent('#pmBody')).includes('BestFriend') && (await kid.$$('#pmBody .mini-badge')).length===10);
 ok('profile shows Add friend', (await kid.$$('#pmBody [data-fr="add"]')).length===1);
 await kid.screenshot({path:D+'shots2/profile-window.png'});
 await kid.click('#pmBody [data-fr="add"]'); await kid.waitForTimeout(1500);
 ok('request shows as sent', (await kid.textContent('#pmBody')).includes('Request sent'));
 await kid.keyboard.press('Escape'); ok('Escape closes the profile', await kid.isHidden('#playerModal'));
 await refresh(adm);
 ok('friend gets the request', (await adm.textContent('#friendsBox')).includes('Kid123') && (await adm.$$('#friendsBox [data-fr="add"][data-u="kid123"]')).length===1);
 await adm.click('#friendsBox [data-fr="add"][data-u="kid123"]'); await adm.waitForTimeout(1500);
 await refresh(kid);
 ok('accepted: both are friends', (await kid.$$('#friendsBox [data-fr="remove"][data-u="bestfriend"]')).length===1);
 await kid.click('[data-lbtab="friends"]'); await kid.waitForTimeout(200); r=await rows(kid);
 ok('Friends tab shows you + friends only', r.map(x=>x.u).sort().join()==='bestfriend,kid123');
 await kid.click('[data-lbtab="all"]');
 await kid.fill('#addFriendIn','nobody_here'); await kid.click('#addFriendForm .btn'); await kid.waitForTimeout(600);
 ok('adding an unknown name is refused', (await kid.textContent('#toast')).includes('No public player'));
 // moderation
 await refresh(adm); await adm.click('#lbList [data-player="cheater"]'); await adm.waitForTimeout(500);
 ok('admin can hide a regular player', (await adm.$$('#pmBody [data-hidep="hide"]')).length===1);
 await adm.keyboard.press('Escape'); await adm.click('#lbList [data-player="jinx002"]'); await adm.waitForTimeout(500);
 ok('admin cannot hide the owner', (await adm.$$('#pmBody [data-hidep]')).length===0); await adm.keyboard.press('Escape');
 await refresh(own); await own.click('#lbList [data-player="cheater"]'); await own.waitForTimeout(500);
 await own.click('#pmBody [data-hidep="hide"]'); await own.waitForTimeout(1500); await own.keyboard.press('Escape');
 await refresh(kid); r=await rows(kid);
 ok('owner hid the cheater for everyone', !r.some(x=>x.u==='cheater'));
 await refresh(cheat);
 ok('hidden player is told', (await cheat.$$('#lbList [data-player="cheater"]')).length===1);
 ok("owner's hidden list shows them", (await own.textContent('#hiddenBox')).includes('Cheater'));
 // chat: clickable names + emoji
 await own.goto(URL+'#badges'); await own.waitForTimeout(400); await own.fill('#emoName','gg'); await own.setInputFiles('#emoFile',H.FIX+'media/gg.gif'); await own.waitForTimeout(1500);
 await own.goto(URL+'#chat'); await own.click('#newCode'); const code=await own.inputValue('#joinCode'); await own.click('#joinForm .btn'); await own.waitForTimeout(2500);
 await own.fill('#chatIn','gg everyone :gg:'); await own.click('#chatForm .btn.primary'); await own.waitForTimeout(2700);
 ok('owner emoji pack published', players.has('emo-owner'));
 await kid.goto(URL+'#chat'); await kid.fill('#joinCode',code); await kid.click('#joinForm .btn'); await kid.waitForTimeout(1500);
 await kid.click('#emoBtn'); ok('emoji picker opens', await kid.isVisible('#emoPick'));
 await kid.click('#emoPick [data-ins="🎮"]'); await kid.click('#emoPick [data-ins="🔥"]');
 ok('picked emoji go into the message box', (await kid.inputValue('#chatIn'))==='🎮🔥');
 await kid.click('#chatForm .btn.primary'); await kid.waitForTimeout(2700);
 const fake=await mk('fake'); await signup(fake,'Faker2'); await fake.goto(URL+'#chat'); await fake.fill('#joinCode',code); await fake.click('#joinForm .btn'); await fake.waitForTimeout(1500);
 await fake.evaluate(()=>{}); // a member pretending to be kid123 in chat (no valid signature)
 await fake.fill('#chatIn','hi I am kid123'); await fake.click('#chatForm .btn.primary'); await fake.waitForTimeout(2700);
 await adm.goto(URL+'#chat'); await adm.fill('#joinCode',code); await adm.click('#joinForm .btn'); await adm.waitForTimeout(9000);
 const msgs=await adm.$$eval('#chatList .msg',els=>els.map(e=>({link:(e.querySelector('.msg-h .name-btn')||{}).textContent||'',t:e.querySelector('.msg-t').textContent,big:e.querySelector('.msg-t').classList.contains('big'),img:!!e.querySelector('.msg-t img.emoji')})));
 ok("every chat name is clickable", msgs.length===3 && msgs.every(m=>m.link), JSON.stringify(msgs));
 ok('a name without a public profile opens a card', await adm.evaluate(async()=>{ const li=[...document.querySelectorAll('#chatList .msg')].find(li=>li.textContent.includes('I am kid123')); li.querySelector('.name-btn').click(); await new Promise(r=>setTimeout(r,1200)); const t=document.querySelector('#pmBody').textContent; document.querySelector('.pm-close').click(); return t.includes('no public profile yet'); }));
 ok('emoji-only message shows big', msgs.find(m=>m.t==='🎮🔥').big);
 ok("owner's custom emoji shows for others in chat", msgs.find(m=>m.t.startsWith('gg everyone')).img);
 await adm.evaluate(()=>[...document.querySelectorAll('#chatList .msg')].find(li=>li.querySelector('.msg-t').textContent==='🎮🔥').querySelector('.name-btn').click()); await adm.waitForTimeout(1200);
 ok('clicking a chat name opens the profile', await adm.isVisible('#playerModal') && (await adm.textContent('#pmBody')).includes('Kid123') && (await adm.textContent('#pmBody')).includes('Friends'));
 await adm.screenshot({path:D+'shots2/chat-profile.png'}); await adm.keyboard.press('Escape');
 await adm.screenshot({path:D+'shots2/chat-emoji.png'});
 // turning it off
 await kid.goto(URL+'#options'); await kid.waitForTimeout(300); await kid.click('#stPublic'); await kid.waitForTimeout(2000);
 await refresh(adm); r=await rows(adm);
 ok('turning off removes you from the leaderboard', !r.some(x=>x.u==='kid123') && JSON.parse(JSON.parse(players.get('p-kid123').data.payload).d).gone===true);
 ok('no data beyond the profile was shared', ![...players.values()].some(i=>/password|email|tasks|series|backlog/.test(i.data.payload)));
 await own.goto(URL+'#players'); await own.waitForTimeout(1500); await own.screenshot({path:D+'shots2/leaderboard.png'});
 // layout: menu fits and no sideways scroll
 for (const w of [1440,1280,1100,980]) { await own.setViewportSize({width:w,height:900}); await own.waitForTimeout(150);
   const o=await own.evaluate(()=>({doc:document.documentElement.scrollWidth,vw:innerWidth})); ok(`no sideways scroll at ${w}px`, o.doc<=o.vw, JSON.stringify(o)); }
 const ph=await mk('phone',375); await signup(ph,'Phoney'); await goPublic(ph);
 for (const t of ['players','chat','options']) { await ph.goto(URL+'#'+t); await ph.waitForTimeout(300); const w=await ph.evaluate(()=>document.documentElement.scrollWidth); ok(`phone: no sideways scroll on ${t}`, w<=375, String(w)); }
 await ph.goto(URL+'#players'); await ph.waitForTimeout(1200); await ph.screenshot({path:D+'shots2/m-players.png',fullPage:true});
 await ph.click('#lbList [data-player="jinx002"]'); await ph.waitForTimeout(600); await ph.screenshot({path:D+'shots2/m-profile.png'});
 console.log(res.join('\n')); console.log('items in Players:', players.size, '| JS errors:', errs.length?errs:'none'); await b.close();
})();
