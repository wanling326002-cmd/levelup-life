// Adding people from chat: every name is clickable, private players can still get a friend request.
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
const pay=id=>JSON.parse(JSON.parse(players.get(id).data.payload).d);
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
 const mk=async(name)=>{ const ctx=await b.newContext({viewport:{width:1440,height:950}}); await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort()); await ctx.route(/wixapis\.com/,mock); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(URL); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await p.waitForTimeout(900); };
 const unlock=async(p,k)=>{ await p.goto(URL+'#options'); await p.fill('#ownKey',k); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000); };
 const goPublic=async p=>{ await p.goto(URL+'#players'); await p.waitForTimeout(300); await p.click('#goPublic'); await p.waitForTimeout(2500); };
 const join=async(p,code)=>{ await p.goto(URL+'#chat'); await p.waitForTimeout(200); await p.fill('#joinCode',code); await p.click('#joinForm .btn'); await p.waitForTimeout(1500); };
 const say=async(p,t)=>{ await p.fill('#chatIn',t); await p.click('#chatForm .btn.primary'); await p.waitForTimeout(2700); };
 const clickMsg=async(p,text,sel='.name-btn')=>p.evaluate(async([text,sel])=>{ const li=[...document.querySelectorAll('#chatList .msg')].find(li=>li.querySelector('.msg-t').textContent.includes(text)); li.querySelector(sel).click(); await new Promise(r=>setTimeout(r,1300)); return document.querySelector('#pmBody').textContent; },[text,sel]);
 const nick=async(p,name)=>{ await p.goto(URL+'#options'); await p.waitForTimeout(200); await p.fill('#stName',name); await p.press('#stName','Tab'); await p.waitForTimeout(200); };

 // owner chats BEFORE going public (an older message), then goes public
 const own=await mk('owner'); await signup(own,'Jinx002'); await unlock(own,OKEY);
 await own.goto(URL+'#chat'); await own.click('#newCode'); const code=await own.inputValue('#joinCode'); await own.click('#joinForm .btn'); await own.waitForTimeout(2000);
 await say(own,'welcome all');
 await goPublic(own);
 // admin "snowyy" with a private profile, just chatting (the screenshot case)
 const adm=await mk('admin'); await signup(adm,'snowyy'); await unlock(adm,AKEY); await join(adm,code); await say(adm,'yoo');
 // public member
 const kid=await mk('kid'); await signup(kid,'Kid123'); await goPublic(kid); await join(kid,code);
 // a guest with a nickname, and a guest using the owner's name
 const guest=await mk('guest'); await guest.click('#guestBtn'); await nick(guest,'Cool Guy'); await join(guest,code); await say(guest,'hey there');
 const look=await mk('look'); await look.click('#guestBtn'); await nick(look,'kid123'); await join(look,code); await say(look,'i am the real one');
 await kid.goto(URL+'#chat'); await kid.waitForTimeout(4500);
 const names=await kid.$$eval('#chatList .msg-h .name-btn',els=>els.map(e=>e.textContent));
 ok('every name in chat is clickable', ['Jinx002','snowyy','Cool Guy','kid123'].every(n=>names.includes(n)), JSON.stringify(names));
 // the screenshot case
 let t=await clickMsg(kid,'yoo');
 ok('clicking a private admin opens a card', await kid.isVisible('#playerModal') && t.includes('snowyy') && t.includes('no public profile yet'));
 ok('the card has Add friend', (await kid.$$('#pmBody [data-fr="add"][data-u="snowyy"]')).length===1);
 await kid.click('#pmBody [data-fr="add"]'); await kid.waitForTimeout(1500);
 ok('friend request sent from chat', (await kid.textContent('#pmBody')).includes('Request sent') && pay('p-kid123').fr.includes('snowyy'));
 await kid.screenshot({path:D+'shots2/chat-add.png'});
 await kid.keyboard.press('Escape');
 // snowyy sees the request + dot, accepts with "go public & accept"
 await adm.goto(URL+'#players'); await adm.waitForTimeout(1500);
 ok('red dot on Players for a friend request', (await adm.$$('#navMoreMenu [data-route="players"].has-req, #navMoreBtn.has-req')).length===2);
 const acc=await adm.$('#friendsBox [data-fr="pubadd"][data-u="kid123"]');
 ok('private player sees "Go public & accept"', !!acc && (await acc.textContent()).includes('Go public & accept'));
 await adm.screenshot({path:D+'shots2/request-dot.png',clip:{x:0,y:0,width:1440,height:620}});
 await acc.click(); await adm.waitForTimeout(3000);
 ok('accepting makes the profile public with the friend', players.has('p-snowyy') && pay('p-snowyy').fr.includes('kid123') && pay('p-snowyy').role==='admin');
 await kid.goto(URL+'#players'); await kid.waitForTimeout(300); await kid.click('#lbRefresh'); await kid.waitForTimeout(1500);
 ok('now friends on both sides', (await kid.$$('#friendsBox [data-fr="remove"][data-u="snowyy"]')).length===1);
 ok('the dot goes away after accepting', (await adm.$$('#navMoreMenu [data-route="players"].has-req, #navMoreBtn.has-req')).length===0);
 // older owner message still opens the verified owner profile
 await kid.goto(URL+'#chat'); await kid.waitForTimeout(4500);
 t=await clickMsg(kid,'welcome all');
 ok("owner's older message opens the owner profile", t.includes('Owner') && t.includes('Leaderboard') && !t.includes('Heads up'), t.slice(0,80));
 await kid.keyboard.press('Escape');
 t=await clickMsg(kid,'i am the real one');
 ok('a guest using a player name gets a warning', t.includes('Heads up') && t.includes("wasn't signed"), t.replace(/\s+/g,' ').slice(0,400));
 await kid.keyboard.press('Escape');
 t=await clickMsg(kid,'hey there');
 ok('guest name explains they need an account', t.includes('guest') && (await kid.$$('#pmBody [data-fr]')).length===0);
 await kid.keyboard.press('Escape');
 t=await clickMsg(kid,'yoo','.thumb');
 ok('clicking the picture opens the profile too', t.includes('snowyy') && t.includes('Admin'));
 await kid.keyboard.press('Escape');
 // a private player adding someone from chat goes public in the same click
 const priv=await mk('priv'); await signup(priv,'Quiet1'); await join(priv,code); await priv.waitForTimeout(3500);
 await clickMsg(priv,'welcome all');
 const pb=await priv.$('#pmBody [data-fr="pubadd"][data-u="jinx002"]');
 ok('private player sees "Go public & add friend"', !!pb && (await pb.textContent()).includes('Go public & add friend'));
 await priv.screenshot({path:D+'shots2/chat-add-private.png'});
 await pb.click(); await priv.waitForTimeout(3000);
 ok('their request is sent and they are now public', players.has('p-quiet1') && pay('p-quiet1').fr.includes('jinx002'));
 console.log(res.join('\n')); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
