const {chromium}=require('playwright');
const fs=require('fs');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
const KEY=H.OKEY;
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[];
 const ok=(n,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${n} ${x}`);
 const ctx=await b.newContext({viewport:{width:1440,height:950}});
 await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
 const signup=async(u,pw)=>{ await p.fill('#suUser',u); await p.fill('#suPass',pw); await p.fill('#suPass2',pw); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await p.waitForTimeout(900); };
 await p.goto(URL); await signup('Jinx002','ownerpass1');
 // before unlocking: no studio
 await p.goto(URL+'#badges'); await p.waitForTimeout(200);
 ok('no owner extras before unlocking', (await p.$$('#upPfp')).length===0);
 await p.goto(URL+'#options'); await p.fill('#ownKey',KEY); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(2500);
 ok('owner is level 100', (await p.textContent('#lvl'))==='1000 MAX');
 ok('owner studio visible', (await p.$$('#upPfp')).length===1);
 await p.setInputFiles('#upPfp', H.FIX+'media/pfp.png'); await p.waitForTimeout(1200);
 ok('profile picture shows in top bar', (await p.$$('#avatar img')).length===1);
 await p.setInputFiles('#upBanner', H.FIX+'media/banner.gif'); await p.waitForTimeout(1200);
 ok('animated GIF banner shows', (await p.$$('.pc-banner img')).length===1);
 const blobType=await p.evaluate(async()=>{const r=await fetch(document.querySelector('.pc-banner img').src);return (await r.blob()).type;});
 ok('GIF banner kept animated (not converted)', blobType==='image/gif', blobType);
 await p.setInputFiles('#emoFile', H.FIX+'media/tri.png'); await p.waitForTimeout(400);
 ok('emoji needs a name first', /name first/.test(await p.textContent('#emoErr')));
 await p.fill('#emoName','tri'); await p.setInputFiles('#emoFile', H.FIX+'media/tri.png'); await p.waitForTimeout(1000);
 await p.fill('#emoName',':gg:'); await p.setInputFiles('#emoFile', H.FIX+'media/gg.gif'); await p.waitForTimeout(1000);
 const tags=await p.$$eval('.emo-tile .tag',els=>els.map(e=>e.textContent));
 ok('still + live emoji added', tags.join(',')==='Still,Live', tags.join(','));
 await p.fill('#emoName','tri'); await p.setInputFiles('#emoFile', H.FIX+'media/tri.png'); await p.waitForTimeout(500);
 ok('duplicate emoji name blocked', /already exists/.test(await p.textContent('#emoErr')));
 await p.screenshot({path:D+'shots2/owner-studio.png',fullPage:true});
 // use emoji in a task
 await p.goto(URL+'#study'); await p.fill('#taskIn','Beat the boss :gg: then study :tri:'); await p.press('#taskIn','Enter'); await p.waitForTimeout(300);
 ok('emoji render inside task text', (await p.$$('.item .t img.emoji')).length===2);
 // survives reload
 await p.reload(); await p.waitForTimeout(2500); await p.goto(URL+'#badges'); await p.waitForTimeout(500);
 ok('pfp, banner, emoji survive reload', (await p.$$('#avatar img')).length===1 && (await p.$$('.pc-banner img')).length===1 && (await p.$$('.emo-tile')).length===2);
 // XSS-ish names in task with unknown emoji stay text
 // another user: nothing
 await p.goto(URL+'#options'); await p.click('#acLogout'); await signup('friend','friendpass1');
 await p.goto(URL+'#badges'); await p.waitForTimeout(500);
 ok('other accounts get no owner extras', (await p.$$('#upPfp')).length===0 && (await p.$$('.pc-banner')).length===0 && (await p.$$('#avatar img')).length===0 && (await p.textContent('#lvl'))!=='1000 MAX');
 await p.goto(URL+'#study'); await p.fill('#taskIn','hi :gg:'); await p.press('#taskIn','Enter'); await p.waitForTimeout(200);
 ok("other accounts can't use the owner's emoji", (await p.$$('.item .t img.emoji')).length===0);
 // delete owner emoji works
 await p.goto(URL+'#options'); await p.click('#acLogout'); await p.click('[data-auth="login"]'); await p.fill('#liUser','jinx002'); await p.fill('#liPass','ownerpass1'); await p.click('#loginForm .btn.primary'); await p.waitForTimeout(2500);
 await p.goto(URL+'#badges'); await p.waitForTimeout(400); await p.click('[data-emodel] >> nth=0'); await p.waitForTimeout(500);
 ok('delete emoji works', (await p.$$('.emo-tile')).length===1);
 const m=await (await b.newContext({viewport:{width:375,height:812}})).newPage(); m.on('pageerror',e=>errs.push('m:'+e.message));
 console.log(res.join('\n')); console.log('JS errors:', errs.length?errs:'none'); await b.close();
})();
