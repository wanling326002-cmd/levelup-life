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
// Bug scan: every page, every role, desktop + phone. Looks for crashes, console errors, broken text, overflow,
// duplicate ids, unnamed buttons, HTML injection, bad backups and keyboard shortcuts.
const ROUTES=['messages','home','study','focus','gaming','companion','series','youtube','balance','impact','chat','players','badges','options','help','privacy'];
const XSS='<img src=x onerror="window.__xss=1"><b id=pwn>x</b>';
(async()=>{
 const b=await chromium.launch(); const issues=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
 const mk=async(name,w=1440,h=950)=>{ const ctx=await b.newContext({viewport:{width:w,height:h}}); await ctx.route(/fonts\.(googleapis|gstatic)|ytimg|youtube\.com/,r=>r.abort()); await ctx.route(/wixapis\.com/,mock); const p=await ctx.newPage(); p._name=name;
   p.on('pageerror',e=>issues.push(`${name}: JS error: ${e.message}`)); p.on('dialog',d=>{issues.push(`${name}: unexpected dialog: ${d.message()}`); d.dismiss();});
   p.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED|ERR_ABORTED|Failed to load resource/.test(m.text())) issues.push(`${name}: console error: ${m.text()}`); }); await p.goto(URL); return p; };
 const signup=async(p,u,pw='password123')=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await p.waitForTimeout(900); };
 const unlock=async(p,k)=>{ await p.goto(URL+'#options'); await p.fill('#ownKey',k); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000); };
 const goPublic=async p=>{ await p.goto(URL+'#players'); await p.waitForTimeout(300); const g=await p.$('#goPublic'); if(g){ await g.click(); await p.waitForTimeout(2500);} };
 const scan=async(p)=>{ for (const r of ROUTES) { await p.goto(URL+'#'+r); await p.waitForTimeout(r==='players'||r==='chat'?900:250);
   const f=await p.evaluate(()=>{ const main=document.querySelector('#main'), txt=main.innerText, out=[];
     const m=txt.match(/\b(undefined|NaN|null)\b|\[object Object\]|Infinity/); if(m) out.push('broken text "'+m[0]+'" near: '+txt.slice(Math.max(0,txt.indexOf(m[0])-40),txt.indexOf(m[0])+30).replace(/\s+/g,' '));
     if(document.documentElement.scrollWidth>innerWidth+1) out.push('sideways scroll '+document.documentElement.scrollWidth+'>'+innerWidth);
     const ids={}; document.querySelectorAll('[id]').forEach(e=>ids[e.id]=(ids[e.id]||0)+1); const d=Object.keys(ids).filter(k=>ids[k]>1); if(d.length) out.push('duplicate ids: '+d.join(','));
     const unnamed=[...document.querySelectorAll('#main button, #main a[href], #main input:not([type=hidden]):not([hidden]), #main select, #main textarea')].filter(e=>e.offsetParent!==null && !e.closest('details:not([open])') && !(e.getAttribute('aria-label')||e.title||e.innerText.trim()||e.placeholder||(e.labels&&e.labels.length&&e.labels[0].innerText.trim())||e.closest('label')));
     if(unnamed.length) out.push('unnamed controls: '+unnamed.slice(0,4).map(e=>e.outerHTML.slice(0,90)).join(' | '));
     if(!document.querySelector('#pageTitle').textContent.trim()) out.push('empty page title');
     return out; });
   f.forEach(x=>issues.push(`${p._name} #${r}: ${x}`)); } };
 // roles
 const guest=await mk('guest'); await guest.click('#guestBtn');
 const priv=await mk('private'); await signup(priv,'Private1');
 const pub=await mk('public'); await signup(pub,'Public1'); await goPublic(pub);
 const adm=await mk('admin'); await signup(adm,'snowyy'); await unlock(adm,AKEY); await goPublic(adm);
 const own=await mk('owner'); await signup(own,'Jinx002'); await unlock(own,OKEY);
 await own.goto(URL+'#badges'); await own.setInputFiles('#upPfp',H.FIX+'media/bigpfp.gif'); await own.waitForTimeout(1200); await own.setInputFiles('#upBanner',H.FIX+'media/banner.gif'); await own.waitForTimeout(1000);
 await own.fill('#emoName','gg'); await own.setInputFiles('#emoFile',H.FIX+'media/gg.gif'); await own.waitForTimeout(1000);
 await goPublic(own); await own.waitForTimeout(3000);
 await own.goto(URL+'#chat'); await own.click('#newCode'); const code=await own.inputValue('#joinCode'); await own.click('#joinForm .btn'); await own.waitForTimeout(1500);
 for (const p of [guest,priv,pub,adm]) { await p.goto(URL+'#chat'); await p.fill('#joinCode',code); await p.click('#joinForm .btn'); await p.waitForTimeout(1200); }
 // fill every role's app with some data, including injection attempts
 for (const p of [guest,priv,pub,adm,own]) {
   await p.goto(URL+'#study'); await p.fill('#taskIn',XSS); await p.press('#taskIn','Enter'); await p.waitForTimeout(150);
   await p.fill('#chatIn',XSS).catch(()=>{});
   await p.goto(URL+'#chat'); await p.waitForTimeout(300); await p.fill('#chatIn',XSS+' gg :gg:'); await p.click('#chatForm .btn.primary'); await p.waitForTimeout(2700);
 }
 const LONG='W'.repeat(140);
 const stuff=async p=>{ for (const [r,id] of [['series','sTitle'],['gaming','gGame'],['youtube','yTitle'],['study','taskIn']]) { await p.goto(URL+'#'+r); await p.waitForTimeout(150); if(!(await p.$('#'+id))) { issues.push('missing input #'+id); continue; } await p.fill('#'+id, LONG+XSS); await p.press('#'+id,'Enter'); await p.waitForTimeout(250); } };
 await stuff(own); await own.goto(URL+'#chat'); await own.waitForTimeout(300); await own.fill('#chatIn',LONG); await own.click('#chatForm .btn.primary'); await own.waitForTimeout(2700);
 await pub.goto(URL+'#players'); await pub.waitForTimeout(800); const add=await pub.$('#lbList [data-player="jinx002"]'); if(add){ await add.click(); await pub.waitForTimeout(800); const a2=await pub.$('#pmBody [data-fr="add"]'); if(a2){ await a2.click(); await pub.waitForTimeout(1200);} await pub.keyboard.press('Escape'); }
 for (const p of [guest,priv,pub,adm,own]) await scan(p);
 // phone
 const phone=await mk('phone',375,812); await signup(phone,'Phone1'); await goPublic(phone); await phone.goto(URL+'#chat'); await phone.fill('#joinCode',code); await phone.click('#joinForm .btn'); await phone.waitForTimeout(1500); await scan(phone);
 await stuff(phone); await scan(phone);
 await phone.click('#moreBtn'); await phone.waitForTimeout(200); ok('phone: More sheet opens with every page', (await phone.$$('#sheet .tile')).length===ROUTES.length, String((await phone.$$('#sheet .tile')).length));
 // injection: no script ran, no injected element anywhere
 let pwned=false; for (const p of [guest,priv,pub,adm,own,phone]) { for (const r of ['study','chat','players']) { await p.goto(URL+'#'+r); await p.waitForTimeout(r==='study'?150:1500); if(await p.evaluate(()=>!!(window.__xss||document.getElementById('pwn')))) pwned=true; } }
 ok('HTML/script injection is blocked everywhere (tasks, chat, profiles)', !pwned);
 // profile window from chat for each kind of sender
 await adm.goto(URL+'#chat'); await adm.waitForTimeout(4500);
 const cnt=await adm.$$eval('#chatList .msg-h .name-btn',els=>els.length); ok('chat has messages from every role', cnt>=5, String(cnt));
 for (let i=0;i<cnt;i++) { const n=await adm.evaluate(i=>{ const b=document.querySelectorAll('#chatList .msg-h .name-btn')[i]; if(!b) return ''; b.click(); return b.textContent; },i); await adm.waitForTimeout(1100);
   const t=await adm.textContent('#pmBody'); if(!t.trim()||/undefined|NaN|\[object/.test(t)) issues.push(`admin: chat profile for ${n} looks broken: ${t.slice(0,80)}`); await adm.keyboard.press('Escape'); }
 // corrupted backups must not crash
 const bad=[['not json','garbage {{'],['wrong shape','{"xp":"lots","tasks":"nope","log":[{"d":"x","cat":"zzz","m":-5}],"series":[null,{"title":{}}],"friends":[1,2,"<b>"]}'],['huge numbers','{"xp":1e308,"focus":{"work":-1,"count":"9"},"stats":{"episodes":-9}}']];
 for (const [label,txt] of bad) { fs.writeFileSync(D+'bad.json',txt); await priv.goto(URL+'#options'); await priv.setInputFiles('#stImport',D+'bad.json'); await priv.waitForTimeout(500); for (const r of ['home','badges','players','balance']) { await priv.goto(URL+'#'+r); await priv.waitForTimeout(200); } }
 ok('corrupted backup files are rejected or cleaned (no crash)', !issues.some(x=>x.startsWith('private') && /JS error/.test(x)));
 // keyboard shortcuts + palette + theme
 await own.goto(URL+'#home'); await own.keyboard.press('Control+k'); await own.waitForTimeout(200); ok('Ctrl+K opens search', await own.isVisible('#palette'));
 await own.keyboard.type('privacy'); await own.keyboard.press('Enter'); await own.waitForTimeout(300); ok('search jumps to a page', (await own.textContent('#pageTitle'))==='Privacy Terms');
 await own.click('#themeBtn'); await own.waitForTimeout(200); for (const r of ROUTES) { await own.goto(URL+'#'+r); await own.waitForTimeout(120); } await own.click('#themeBtn');
 for (const k of ['1','2','3','4','5','6','7','8','9','0']) { await own.goto(URL+'#home'); await own.waitForTimeout(80); await own.keyboard.press(k); await own.waitForTimeout(120); }
 ok('number-key shortcuts work', (await own.textContent('#pageTitle'))==='Settings');
 const uniq=[...new Set(issues)];
 console.log(res.join('\n')); console.log(`\nISSUES FOUND: ${uniq.length}`); uniq.forEach(x=>console.log(' - '+x.slice(0,300)));
 await b.close();
})();
