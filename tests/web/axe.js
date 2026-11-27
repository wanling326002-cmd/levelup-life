// Accessibility audit with axe-core: every page, dark + light, desktop + phone, plus open dialogs.
const {chromium}=require('playwright'); const fs=require('fs');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
const AXE=H.AXE;
const OKEY=H.OKEY;
const ROUTES=['home','study','focus','gaming','series','youtube','balance','impact','chat','messages','players','badges','options','help','privacy'];
(async()=>{
 const b=await chromium.launch(); const found=new Map();
 const run=async(p,label,ctx='')=>{ await p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))); /* colours are measured after fade-ins finish */ await p.addScriptTag({path:AXE}); const r=await p.evaluate(async()=>{ const res=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']},resultTypes:['violations']}); return res.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').split('\n').slice(1,2).join('').slice(0,140))})); });
   for (const v of r) { const k=v.id; if(!found.has(k)) found.set(k,{...v,where:new Set(),nodes:new Set()}); const f=found.get(k); f.where.add(label+ctx); v.nodes.forEach(n=>f.nodes.size<6&&f.nodes.add(n)); } };
 for (const [w,h,tag] of [[1440,950,'desktop'],[375,812,'phone']]) {
  const ctx=await b.newContext({viewport:{width:w,height:h}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis|ytimg/,r=>r.abort());
  const p=await ctx.newPage(); await p.goto(URL); await p.waitForTimeout(300);
  await run(p,'signup dialog',' '+tag);
  await p.fill('#suUser','Jinx002'); await p.fill('#suPass','password123'); await p.fill('#suPass2','password123'); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(900);
  if (tag==='desktop') { await p.goto(URL+'#options'); await p.fill('#ownKey',OKEY); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000);
    await p.goto(URL+'#study'); await p.fill('#taskIn','Read about flexbox'); await p.press('#taskIn','Enter'); await p.goto(URL+'#series'); await p.fill('#sTitle','Arcane'); await p.press('#sTitle','Enter'); }
  for (const theme of ['dark','light']) {
    await p.evaluate(t=>{ document.documentElement.dataset.theme=t; },theme);
    for (const r of ROUTES) { await p.goto(URL+'#'+r); await p.evaluate(t=>{ document.documentElement.dataset.theme=t; },theme); await p.waitForTimeout(250); await run(p,r,` ${tag}/${theme}`); }
  }
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150); await run(p,'search palette',' '+tag); await p.keyboard.press('Escape');
  await ctx.close();
 }
 const out=[...found.values()].sort((a,b)=>['critical','serious','moderate','minor'].indexOf(a.impact)-['critical','serious','moderate','minor'].indexOf(b.impact));
 console.log(`axe found ${out.length} kinds of problems`);
 for (const v of out) { console.log(`\n[${v.impact}] ${v.id}: ${v.help}\n  pages: ${[...v.where].slice(0,8).join(', ')}${v.where.size>8?' …(+'+(v.where.size-8)+')':''}`); [...v.nodes].forEach(n=>console.log('   - '+n)); }
 await b.close();
})();
