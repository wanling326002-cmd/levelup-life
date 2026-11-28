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
// Staff powers: owner/admin add friends instantly, no acceptance needed.
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
 const mk=async(name)=>{ const ctx=await b.newContext({viewport:{width:1440,height:950}}); await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort()); await ctx.route(/wixapis\.com/,mock); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(URL); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(900); };
 const unlock=async(p,k)=>{ await p.goto(URL+'#options'); await p.fill('#ownKey',k); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000); };
 const goPublic=async p=>{ await p.goto(URL+'#players'); await p.waitForTimeout(300); await p.click('#goPublic'); await p.waitForTimeout(2500); };
 const players_=async p=>{ await p.goto(URL+'#players'); await p.waitForTimeout(300); await p.click('#lbRefresh'); await p.waitForTimeout(1500); };
 const openP=async(p,u)=>{ await p.click(`#lbList [data-player="${u}"]`); await p.waitForTimeout(800); return p.textContent('#pmBody'); };
 const own=await mk('owner'); await signup(own,'Jinx002'); await unlock(own,OKEY); await goPublic(own);
 const adm=await mk('admin'); await signup(adm,'snowyy'); await unlock(adm,AKEY); await goPublic(adm);
 const kid=await mk('kid'); await signup(kid,'Kid123'); await goPublic(kid);
 const quiet=await mk('quiet'); await signup(quiet,'Quiet1'); // never goes public
 const pal=await mk('pal'); await signup(pal,'Pal99'); await goPublic(pal);
 // owner adds a public player: instant
 await players_(own); await openP(own,'kid123'); await own.click('#pmBody [data-fr="add"]'); await own.waitForTimeout(1500);
 ok('owner: adding is instant (no request)', (await own.textContent('#pmBody')).includes('Friends') && !(await own.textContent('#pmBody')).includes('Request sent'));
 ok('owner toast says friends', (await own.textContent('#toast')).includes('now friends'));
 await own.keyboard.press('Escape');
 // kid sees it without accepting
 await H.reloadKeep(kid); await kid.waitForTimeout(1500);
 ok('player is told the owner added them', (await kid.textContent('#toast')).includes('Owner) added you as a friend'), await kid.textContent('#toast'));
 ok("player's friends list shows the owner, no request to accept", (await kid.textContent('#friendsBox')).includes('Jinx002') && (await kid.$$('#friendsBox [data-fr="add"]')).length===0 && (await kid.textContent('#friendsBox')).includes('Added by the owner'));
 ok('no red request dot for staff adds', (await kid.$$('#nav [data-route="players"].has-req')).length===0);
 ok('player cannot remove a friendship the owner made', (await kid.$$('#friendsBox [data-fr="remove"][data-u="jinx002"]')).length===0);
 // owner adds a private player by username
 await own.fill('#addFriendIn','quiet1'); await own.click('#addFriendForm .btn'); await own.waitForTimeout(1500);
 ok('owner can add a private player by username', pay('p-jinx002').fr.includes('quiet1') && (await own.textContent('#friendsBox')).includes('quiet1'));
 await own.click('#friendsBox [data-player="quiet1"]'); await own.waitForTimeout(800); const pc=await own.textContent('#pmBody');
 ok("owner sees why a private player's stats can't be shown", pc.includes('stored only on their own device') && pc.includes('Friends'));
 await own.screenshot({path:D+'shots2/owner-private-card.png'}); await own.keyboard.press('Escape');
 await players_(quiet);
 ok('private player still gets the owner as a friend', (await quiet.textContent('#friendsBox')).includes('Jinx002'));
 // admin adds a regular player instantly, but needs the owner's OK
 await players_(adm); await openP(adm,'kid123'); await adm.click('#pmBody [data-fr="add"]'); await adm.waitForTimeout(1500);
 ok('admin: adding a regular player is instant', (await adm.textContent('#pmBody')).includes('Friends') && !(await adm.textContent('#pmBody')).includes('Request sent'));
 await adm.keyboard.press('Escape'); await openP(adm,'jinx002'); await adm.click('#pmBody [data-fr="add"]'); await adm.waitForTimeout(1500);
 ok('admin adding the owner is only a request', (await adm.textContent('#pmBody')).includes('Request sent'));
 await adm.keyboard.press('Escape');
 await players_(own);
 ok('owner gets a normal request from the admin', (await own.$$('#friendsBox [data-fr="add"][data-u="snowyy"]')).length===1);
 // a regular player still needs approval
 await players_(kid); await kid.fill('#addFriendIn','pal99'); await kid.click('#addFriendForm .btn'); await kid.waitForTimeout(1500);
 ok('regular players still send requests', (await kid.textContent('#friendsBox')).includes('Sent requests'));
 await kid.fill('#addFriendIn','quiet1'); await kid.click('#addFriendForm .btn'); await kid.waitForTimeout(800);
 ok('regular players cannot add private players by username', (await kid.textContent('#toast')).includes('No public player'));
 // counts and leaderboard tags
 await players_(kid); const t=await openP(kid,'kid123');
 ok('friend count includes staff friendships', /Friends\s*2/.test(t.replace(/\s+/g,' ')), t.replace(/\s+/g,' ').slice(0,160));
 await kid.keyboard.press('Escape'); await kid.click('[data-lbtab="friends"]'); await kid.waitForTimeout(200);
 const fr=await kid.$$eval('#lbList .lb-row',els=>els.map(e=>e.dataset.player).sort().join());
 ok('Friends tab shows owner + admin', fr==='jinx002,kid123,snowyy', fr);
 await kid.screenshot({path:D+'shots2/staff-added.png'});
 console.log(res.join('\n')); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
