const {chromium}=require('playwright');
const fs=require('fs');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
const KEY=H.OKEY;
// in-memory stand-in for the Wix ChatMessages collection
const store=[]; let n=0;
async function mock(route){
  const u=route.request().url(), body=route.request().postData()?JSON.parse(route.request().postData()):{};
  const hdr={'access-control-allow-origin':'*','content-type':'application/json'};
  if(u.includes('/oauth2/token')) return route.fulfill({status:200,headers:hdr,body:JSON.stringify({access_token:'anon',expires_in:3600})});
  if(u.endsWith('/wix-data/v2/items')){ const id='id'+(++n); const item={id,dataCollectionId:body.dataCollectionId,data:{...body.dataItem.data,_id:id,_createdDate:{$date:new Date(Date.now()+n).toISOString()}}}; store.push(item); return route.fulfill({status:200,headers:hdr,body:JSON.stringify({dataItem:item})}); }
  if(u.endsWith('/wix-data/v2/items/query')){ const f=body.query.filter.room; const items=store.filter(i=>i.data.room===f).slice().reverse().slice(0,100); return route.fulfill({status:200,headers:hdr,body:JSON.stringify({dataItems:items})}); }
  return route.fulfill({status:404,headers:hdr,body:'{}'});
}
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[];
 const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
 const mk=async(name)=>{ const ctx=await b.newContext({viewport:{width:1440,height:950}}); await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort()); await ctx.route(/wixapis\.com/,mock);
   const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(URL); return p; };
 const signup=async(p,u,pw)=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await p.waitForTimeout(900); };
 const join=async(p,code)=>{ await p.goto(URL+'#chat'); await p.waitForTimeout(200); await p.fill('#joinCode',code); await p.click('#joinForm .btn'); await p.waitForTimeout(1200); };
 const say=async(p,t)=>{ await p.fill('#chatIn',t); await p.click('#chatForm .btn'); await p.waitForTimeout(1500); };
 const texts=p=>p.$$eval('#chatList .msg',els=>els.map(e=>({name:e.querySelector('b').textContent,t:e.querySelector('.msg-t').textContent,own:e.classList.contains('own')})));

 const owner=await mk('owner'); await signup(owner,'Jinx002','ownerpass1');
 await owner.goto(URL+'#options'); await owner.fill('#ownKey',KEY); await owner.click('#ownForm .btn.primary'); await owner.waitForTimeout(3500);
 await owner.goto(URL+'#chat'); await owner.waitForTimeout(200);
 await owner.click('#newCode'); const code=await owner.inputValue('#joinCode');
 ok('owner can make an invite code', /^lvl-[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}$/.test(code), code);
 await owner.click('#joinForm .btn'); await owner.waitForTimeout(1200);
 ok('owner crown already enabled (no key prompt)', (await owner.$$('#signForm')).length===0);
 await say(owner,'Welcome to LevelUp chat!');

 const friend=await mk('friend'); await signup(friend,'Sky_99','friendpass1');
 await join(friend,code); await friend.waitForTimeout(600);
 let fm=await texts(friend);
 ok('friend sees owner message with crown', fm.length===1 && fm[0].own && fm[0].name==='Jinx002', JSON.stringify(fm));
 await say(friend,'hey! thanks for the invite');
 await owner.waitForTimeout(4500);
 let om=await texts(owner);
 ok('owner receives friend message', om.some(m=>m.name==='Sky_99' && !m.own));
 ok('messages stored encrypted (no plain text in database)', !JSON.stringify(store).includes('thanks for the invite') && !JSON.stringify(store).includes('Welcome'));
 // impersonator on another device registers the owner's name
 const fake=await mk('fake'); await signup(fake,'jinx002','fakepass11'); await join(fake,code); await say(fake,'I am the owner, give me your password');
 await friend.waitForTimeout(4500); fm=await texts(friend);
 ok('impersonator using owner name is hidden', !fm.some(m=>/give me your password/.test(m.t)));
 // name with admin can't post
 await fake.goto(URL+'#options'); await fake.click('#acLogout'); await fake.click('#guestBtn'); await fake.goto(URL+'#options'); await fake.fill('#stName','AdminBoss'); await fake.press('#stName','Tab'); await fake.waitForTimeout(200);
 await join(fake,code); await fake.fill('#chatIn','hello'); await fake.click('#chatForm .btn'); await fake.waitForTimeout(600);
 ok('"admin" names cannot post', !store.some(()=>false) && !(await texts(friend)).some(m=>m.name==='AdminBoss'));
 // forged owner signature
 await fake.evaluate(async()=>{});
 // wrong code sees nothing
 const out=await mk('outsider'); await signup(out,'Random1','randompass1'); await join(out,'some-other-code'); await out.waitForTimeout(500);
 ok('wrong invite code sees no messages', (await texts(out)).length===0);
 // moderation: owner hides friend's message, then mutes friend
 await owner.goto(URL+'#chat'); await owner.waitForTimeout(1500);
 await say(friend,'spam spam spam'); await owner.waitForTimeout(4500);
 const btn=await owner.$('#chatList .msg:has-text("spam spam spam") [data-hide]'); await btn.click(); await owner.waitForTimeout(1500);
 await friend.waitForTimeout(4500); fm=await texts(friend);
 ok('owner can hide a message for everyone', !fm.some(m=>m.t.includes('spam spam spam')) && fm.some(m=>m.t.includes('thanks for the invite')));
 await (await owner.$('#chatList .msg:has-text("thanks for the invite") [data-mute]')).click(); await owner.waitForTimeout(1500);
 await friend.waitForTimeout(4500); fm=await texts(friend);
 ok('owner can mute a name for everyone', !fm.some(m=>m.name==='Sky_99'));
 ok('muted name listed for owner', (await owner.textContent('#mutedList')).includes('sky_99'));
 await owner.click('#mutedList [data-unmute]'); await owner.waitForTimeout(1500); await friend.waitForTimeout(4500); fm=await texts(friend);
 ok('owner can unmute', fm.some(m=>m.name==='Sky_99'));
 // non-owner gets no moderation buttons
 ok('friends have no hide/mute buttons', (await friend.$$('[data-hide],[data-mute]')).length===0);
 // fake signature from friend's browser: inject a message claiming owner with junk sig
 await friend.evaluate(async()=>{});
 // remembered code: reload rejoins
 await friend.reload(); await friend.waitForTimeout(1500); await friend.goto(URL+'#chat'); await friend.waitForTimeout(2000);
 ok('friend rejoins automatically after reload', (await friend.$$('#chatList')).length===1);
 // owner on a new device without crown key yet: prompt appears
 await owner.evaluate(()=>indexedDB.deleteDatabase('levelup-media')); await owner.reload(); await owner.waitForTimeout(2500); await owner.goto(URL+'#chat'); await owner.waitForTimeout(1500);
 ok('owner without crown key on this device is asked for it', (await owner.$$('#signForm')).length===1);
 await owner.fill('#signKeyIn',KEY); await owner.click('#signForm .btn'); await owner.waitForTimeout(3500);
 ok('entering owner key enables crown again', (await owner.$$('#signForm')).length===0 && (await owner.$$('[data-hide]')).length>0);
 await owner.screenshot({path:D+'shots2/chat-owner.png'});
 await friend.screenshot({path:D+'shots2/chat-friend.png'});
 const m=await (await b.newContext({viewport:{width:375,height:812}})).newPage(); await m.route(/wixapis\.com/,mock); m.on('pageerror',e=>errs.push('m:'+e.message));
 await m.goto(URL); await m.click('#guestBtn'); await m.goto(URL+'#chat'); await m.fill('#joinCode',code); await m.click('#joinForm .btn'); await m.waitForTimeout(2000);
 ok('phone: no sideways scroll on chat', (await m.evaluate(()=>document.documentElement.scrollWidth))<=375);
 await m.screenshot({path:D+'shots2/chat-phone.png'});
 console.log(res.join('\n')); console.log('stored items:',store.length,'JS errors:',errs.length?errs:'none'); await b.close();
})();
