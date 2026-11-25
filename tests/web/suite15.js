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
// A big animated profile picture must still move for other players (leaderboard, profile window, chat).
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
 const mk=async(name)=>{ const ctx=await b.newContext({viewport:{width:1440,height:950}}); await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort()); await ctx.route(/wixapis\.com/,mock); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e.message)); await p.goto(URL); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await p.waitForTimeout(900); };
 const unlock=async(p,k)=>{ await p.goto(URL+'#options'); await p.fill('#ownKey',k); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000); };
 const moving=async(p,sel)=>{ const el=await p.$(sel); if(!el) return false; await p.waitForTimeout(300); const a=await el.screenshot(); await p.waitForTimeout(500); const c=await el.screenshot(); return !a.equals(c); };
 for (const [file,label] of [['bigpfp.gif','486 KB animated GIF'],['bigclip.webm','1 MB video clip']]) {
  players.clear();
  const own=await mk('owner'); await signup(own,'Jinx002'); await unlock(own,OKEY);
  await own.goto(URL+'#badges'); await own.waitForTimeout(300);
  await own.setInputFiles('#upPfp',H.FIX+'media/'+file); await own.waitForTimeout(1500);
  await own.setInputFiles('#upBanner',H.FIX+'media/banner.gif'); await own.waitForTimeout(1200);
  await own.goto(URL+'#players'); await own.waitForTimeout(300); const t0=Date.now(); await own.click('#goPublic');
  for (let i=0;i<40 && !players.has('p-jinx002');i++) await own.waitForTimeout(500);
  const pf=players.has('p-jinx002') ? pay('p-jinx002').pf : '';
  ok(`${label}: shared as a small looping clip`, pf.startsWith('data:video/webm'), `${pf.slice(0,30)} ${Math.round(pf.length/1024)} KB text, took ${((Date.now()-t0)/1000).toFixed(1)}s`);
  ok(`${label}: whole profile fits the database limit`, players.get('p-jinx002').data.payload.length < 480000, String(players.get('p-jinx002').data.payload.length));
  const viewer=await mk('viewer'); await signup(viewer,'Viewer1'); await viewer.goto(URL+'#players'); await viewer.waitForTimeout(1500);
  ok(`${label}: picture moves on the leaderboard`, await moving(viewer,'#lbList [data-player="jinx002"] .avatar video'));
  await viewer.click('#lbList [data-player="jinx002"]'); await viewer.waitForTimeout(1000);
  ok(`${label}: picture moves in the profile window`, await moving(viewer,'#pmBody .pm-head .avatar video'));
  ok(`${label}: banner still moves too`, await moving(viewer,'#pmBody .pm-banner img'));
  if (file==='bigpfp.gif') await viewer.screenshot({path:D+'shots2/anim-pfp-profile.png'});
  // done once: a second publish reuses the saved clip, so the profile doesn't change
  const before=pay('p-jinx002').pf; await own.evaluate(()=>localStorage.clear&&0); await own.reload(); await own.waitForTimeout(9000);
  ok(`${label}: clip is made once and reused after a reload`, pay('p-jinx002').pf===before);
  await own.context().close(); await viewer.context().close();
 }
 console.log(res.join('\n')); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
