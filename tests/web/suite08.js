const {chromium}=require('playwright');
const fs=require('fs');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
const OKEY=H.OKEY, AKEY=H.AKEY;
const store=[]; let n=0;
async function mock(route){
  const u=route.request().url(), body=route.request().postData()?JSON.parse(route.request().postData()):{};
  const hdr={'access-control-allow-origin':'*','content-type':'application/json'};
  if(u.includes('/oauth2/token')) return route.fulfill({status:200,headers:hdr,body:JSON.stringify({access_token:'anon',expires_in:3600})});
  if(u.endsWith('/wix-data/v2/items')){ const id='id'+(++n); const item={id,data:{...body.dataItem.data,_id:id,_createdDate:{$date:new Date(Date.now()+n).toISOString()}}}; store.push(item); return route.fulfill({status:200,headers:hdr,body:JSON.stringify({dataItem:item})}); }
  if(u.endsWith('/wix-data/v2/items/query')){ const items=store.filter(i=>i.data.room===body.query.filter.room).slice().reverse().slice(0,100); return route.fulfill({status:200,headers:hdr,body:JSON.stringify({dataItems:items})}); }
  return route.fulfill({status:404,headers:hdr,body:'{}'});
}
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
const viaMenu=async(p,q,sel)=>{ const m=`#chatList .msg:has-text("${q}")`; await p.hover(m); await p.click(`${m} .msg-more`); await p.click(`${m} ${sel}`); }; // actions live in the message's ⋯ menu
 const mk=async(name)=>{ const ctx=await b.newContext({viewport:{width:1440,height:950}}); await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort()); await ctx.route(/wixapis\.com/,mock); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(URL); return p; };
 const signup=async(p,u,pw)=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(900); };
 const unlock=async(p,k)=>{ await p.goto(URL+'#options'); await p.fill('#ownKey',k); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000); };
 const join=async(p,code)=>{ await p.goto(URL+'#chat'); await p.waitForTimeout(200); await p.fill('#joinCode',code); await p.click('#joinForm .btn'); await p.waitForTimeout(1500); };
 const say=async(p,t)=>{ await p.fill('#chatIn',t); await p.click('#chatForm .btn'); await p.waitForTimeout(2700); };
 const msgs=p=>p.$$eval('#chatList .msg',els=>els.map(e=>({n:e.querySelector('b').textContent,t:e.querySelector('.msg-t').textContent,adm:e.classList.contains('adm'),own:e.classList.contains('own'),hide:!!e.querySelector('[data-hide]'),mute:!!e.querySelector('[data-mute]')})));

 // --- admin perks ---
 const adm=await mk('admin'); await signup(adm,'BestFriend','friendpass1');
 await unlock(adm,'wrong-key-123'); ok('wrong key rejected', /not right/.test(await adm.textContent('#ownErr')));
 await unlock(adm,AKEY.toLowerCase());
 ok('admin key unlocks admin (not owner)', (await adm.textContent('#pageTitle'))==='Badges' && (await adm.$$('.badge-tile.tier-admin')).length===1 && (await adm.$$('.badge-tile.tier-owner')).length===0);
 ok('admin boosted to level 100', (await adm.textContent('#lvl'))==='100');
 ok('admin does not get all-Challenger badges', (await adm.$$('.badge-tile.top')).length===0);
 ok('admin gets profile studio', (await adm.$$('#upPfp')).length===1 && (await adm.textContent('.tag.adm')).includes('Admin'));
 ok('admin emoji limit is 80', (await adm.textContent('#main')).includes('0/80'));
 await adm.goto(URL+'#study'); await adm.fill('#taskIn','test task'); await adm.press('#taskIn','Enter'); await adm.waitForTimeout(200);
 const xp0=await adm.evaluate(()=>JSON.parse(localStorage.getItem('levelup-life-v1:u:bestfriend')).xp);
 await adm.click('[data-task]'); await adm.waitForTimeout(200);
 const xp1=await adm.evaluate(()=>JSON.parse(localStorage.getItem('levelup-life-v1:u:bestfriend')).xp);
 ok('admin gets double XP', xp1-xp0===10, `${xp0}->${xp1}`);
 await adm.click('[data-task]'); await adm.waitForTimeout(200);
 ok('unticking takes the double XP back', (await adm.evaluate(()=>JSON.parse(localStorage.getItem('levelup-life-v1:u:bestfriend')).xp))===xp0);
 await adm.goto(URL+'#options'); await adm.waitForTimeout(300);
 ok('settings shows Admin card', (await adm.$$('#admOff')).length===1);
 await adm.click('#admOff'); await adm.waitForTimeout(800);
 ok('admin can be turned off', (await adm.$$('#ownForm')).length===1);
 await unlock(adm,AKEY);
 ok('re-unlocking does not boost again', (await adm.textContent('#lvl'))==='100');
 // --- chat ---
 const own=await mk('owner'); await signup(own,'Jinx002','ownerpass1'); await unlock(own,OKEY);
 await own.goto(URL+'#chat'); await own.click('#newCode'); const code=await own.inputValue('#joinCode'); await own.click('#joinForm .btn'); await own.waitForTimeout(1500);
 await say(own,'owner here');
 await join(adm,code); ok('admin tag enabled automatically', (await adm.$$('#signForm')).length===0);
 await say(adm,'admin reporting in');
 const mem=await mk('member'); await signup(mem,'Kid123','memberpass1'); await join(mem,code); await say(mem,'hi all'); await say(mem,'spammy spam');
 const fake=await mk('fake'); await signup(fake,'bestfriend','fakepass11'); await join(fake,code); await say(fake,'I am admin trust me');
 await mem.waitForTimeout(4500); let mm=await msgs(mem);
 ok('member sees verified Admin tag', mm.some(m=>m.n==='BestFriend'&&m.adm));
 ok('fake admin (copied name) is hidden', !mm.some(m=>/trust me/.test(m.t)));
 ok('members have no mod buttons', mm.every(m=>!m.hide&&!m.mute));
 await adm.waitForTimeout(4500); let am=await msgs(adm);
 ok('admin can hide/mute members', am.some(m=>m.n==='Kid123'&&m.hide&&m.mute));
 ok('admin cannot hide or mute the owner', am.filter(m=>m.own).every(m=>!m.hide&&!m.mute));
 await viaMenu(adm,'spammy spam','[data-hide]'); await adm.waitForTimeout(2000);
 await mem.waitForTimeout(4500); mm=await msgs(mem);
 ok('admin hide works for everyone', !mm.some(m=>m.t.includes('spammy')) && mm.some(m=>m.t==='hi all'));
 await say(mem,'rude words here'); await adm.waitForTimeout(4500);
 adm.once('dialog',d=>d.accept()); await viaMenu(adm,'rude words here','[data-del]'); await adm.waitForTimeout(2000);
 await mem.waitForTimeout(4500); mm=await msgs(mem);
 ok("an admin can delete a member's message for everyone", !mm.some(m=>m.t.includes('rude words')) && mm.some(m=>m.t==='hi all'));
 ok("an admin cannot delete the owner's messages", (await adm.$$('#chatList .msg:has-text("owner here") [data-del]')).length===0);
 await viaMenu(adm,'hi all','[data-mute]'); await adm.waitForTimeout(2000);
 await own.waitForTimeout(4500); let om=await msgs(own);
 ok('admin mute works for everyone', !om.some(m=>m.n==='Kid123'));
 ok('owner can hide/mute the admin', om.some(m=>m.n==='BestFriend'&&m.hide&&m.mute));
 await viaMenu(own,'admin reporting in','[data-mute]'); await own.waitForTimeout(2000);
 await mem.waitForTimeout(4500); mm=await msgs(mem);
 ok('owner mute silences the admin', !mm.some(m=>m.n==='BestFriend'));
 await adm.waitForTimeout(4500);
 ok('admin cannot unmute what the owner muted', (await adm.$$('#mutedList [data-unmute="bestfriend"]')).length===0 && (await adm.$$('#mutedList [data-unmute="kid123"]')).length===1);
 await adm.screenshot({path:D+'shots2/admin-chat.png'});
 await adm.goto(URL+'#badges'); await adm.waitForTimeout(400); await adm.screenshot({path:D+'shots2/admin-badges.png'});
 console.log(res.join('\n')); console.log('JS errors:',errs.length?errs:'none'); await b.close();
})();
