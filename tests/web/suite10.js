// Banner/pfp animation test: uploads each format as an admin banner and checks it really moves.
const {chromium}=require('playwright'); const fs=require('fs');
const H=require('./harness'); const D=H.OUT;
const URL=process.argv[2]||H.FILE_URL;
const AKEY=H.AKEY;
const CASES=[['banner.gif','real animated GIF',true],['anim-webp-named.gif','WebP saved with a .gif name',true],['anim.webp','animated WebP',true],
 ['anim.png','animated PNG',true],['clip.webm','WebM clip',true],['clip-mp4-named.gif','MP4 saved with a .gif name',true],['still.gif','one-frame GIF',false],['pfp.png','normal picture',false]];
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900}}); await ctx.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(URL); await p.click('#guestBtn'); await p.goto(URL+'#options'); await p.fill('#ownKey',AKEY); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000);
 for (const [f,label,shouldMove] of CASES){
  await p.setInputFiles('#upBanner',H.FIX+'media/'+f); await p.waitForTimeout(1500);
  const err=(await p.textContent('#studioErr')).trim(), toast=(await p.textContent('#toast').catch(()=>''))||'';
  const el=await p.$('.pc-banner img, .pc-banner video'); let moved=false, tag='none';
  if(el){ tag=await el.evaluate(e=>e.tagName.toLowerCase()); await p.waitForTimeout(300); const a=await el.screenshot(); await p.waitForTimeout(450); const c=await el.screenshot(); moved=!a.equals(c); }
  const live=(await p.$$('.studio-row:has(#upBanner) .tag.p')).length===1;
  const pass = shouldMove ? (moved && live) : (!moved && !!el);
  console.log(`${pass?'PASS':'FAIL'}  ${label.padEnd(30)} shown as <${tag}> moving=${moved} liveTag=${live}${err?' error="'+err+'"':''}`);
 }
 // the stored banner should still move after a reload
 await p.setInputFiles('#upBanner',H.FIX+'media/anim-webp-named.gif'); await p.waitForTimeout(1200); await p.reload(); await p.waitForTimeout(3000); await p.goto(URL+'#badges'); await p.waitForTimeout(800);
 const el=await p.$('.pc-banner img'); const a=await el.screenshot(); await p.waitForTimeout(450); const c=await el.screenshot();
 console.log(`${!a.equals(c)?'PASS':'FAIL'}  animated banner still moves after reload`);
 // video profile picture shows in the top bar
 await p.setInputFiles('#upPfp',H.FIX+'media/clip.webm'); await p.waitForTimeout(1500);
 console.log(`${(await p.$$('#avatar video')).length===1?'PASS':'FAIL'}  video profile picture shows in the top bar`);
 // emoji refuse video
 await p.fill('#emoName','vid'); await p.setInputFiles('#emoFile',H.FIX+'media/clip.webm'); await p.waitForTimeout(800);
 console.log(`${/PNG, JPG, WebP or GIF/.test(await p.textContent('#emoErr'))?'PASS':'FAIL'}  emoji refuse video files`);
 await p.setInputFiles('#upBanner',H.FIX+'media/banner.gif'); await p.waitForTimeout(1200); await p.screenshot({path:D+'shots2/banner-live.png',clip:{x:0,y:0,width:1280,height:600}});
 console.log('JS errors:',errs.length?errs:'none'); await b.close();
})();
