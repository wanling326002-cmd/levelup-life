const {chromium}=require('playwright');
const fs=require('fs');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await p.goto(URL); await p.click('#guestBtn');
  await p.goto(URL+'#options'); await p.fill('#ownKey',H.AKEY); await p.click('#ownForm .btn.primary'); await p.waitForTimeout(5000);
  await p.setInputFiles('#upBanner',H.FIX+'media/banner.gif'); await p.waitForTimeout(1500);
  await p.setInputFiles('#upPfp',H.FIX+'media/pfp.png'); await p.waitForTimeout(1500);
  console.log('studioErr:', await p.textContent('#studioErr'), '| keys:', await p.evaluate(()=>new Promise(r=>{const q=indexedDB.open('levelup-media');q.onsuccess=()=>{const t=q.result.transaction('files').objectStore('files').getAllKeys();t.onsuccess=()=>r(JSON.stringify(t.result))};q.onerror=()=>r('open error')})));
  console.log((await p.$$('.pc-banner img')).length===1?'PASS  admin banner shows on profile':'FAIL  admin banner');
  console.log((await p.$$('#avatar img')).length===1?'PASS  admin profile picture shows':'FAIL  admin pfp');
  await p.fill('#emoName','gg'); await p.setInputFiles('#emoFile',H.FIX+'media/gg.gif'); await p.waitForTimeout(1500);
  console.log((await p.$$('.emo-tile')).length===1 && (await p.textContent('#main')).includes('1/80')?'PASS  admin can add custom emoji (1/80)':'FAIL  admin emoji');
  await p.screenshot({path:D+'shots2/admin-profile.png',clip:{x:0,y:0,width:1280,height:720}});
  console.log('JS errors:',errs.length?errs:'none'); await b.close();
})();
