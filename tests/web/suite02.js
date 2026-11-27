const {chromium}=require('playwright'); const H=require('./harness');
const fs=require('fs');
const URL=H.FILE_URL;
const OUT=H.OUT+'shots2/';
const KEY=H.OKEY;
const TABS=['home','study','focus','gaming','series','youtube','balance','impact','badges','options','help','privacy'];
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[];
 const ok=(name,cond,extra='')=>res.push(`${cond?'PASS':'FAIL'}  ${name} ${extra}`);
 const ctx=await b.newContext({viewport:{width:1440,height:950}});
 await ctx.route(/fonts\.(googleapis|gstatic)|ytimg/, r=>r.abort());
 const p=await ctx.newPage(); p.on('pageerror',e=>errs.push('desktop: '+e.message));
 const acc=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('levelup-accounts-v1')||'{}'));
 // 1. an existing guest user (from before accounts) is not forced to sign up
 await p.goto(URL); await p.evaluate(()=>localStorage.setItem('levelup-life-v1',JSON.stringify({agreed:true,name:'Old',xp:120,questsTotal:3})));
 await p.reload(); ok('existing guest keeps using app', await p.isHidden('#consent'));
 // 2. guest signs up -> progress carried over
 await p.goto(URL+'#options'); await p.click('[data-open-auth="signup"]');
 await p.fill('#suUser','x'); await p.click('#signupForm .btn.primary'); await H.authDone(p);
 ok('bad username rejected', /3–20/.test(await p.textContent('#suErr')));
 await p.fill('#suUser','Wan_Gamer'); await p.fill('#suPass','supersecret1'); await p.fill('#suPass2','supersecret2'); await p.click('#signupForm .btn.primary'); await H.authDone(p);
 ok('password mismatch rejected', /do not match/.test(await p.textContent('#suErr')));
 await p.fill('#suPass2','supersecret1'); await p.click('#signupForm .btn.primary'); await H.authDone(p);
 ok('privacy agreement required', /agree/.test(await p.textContent('#suErr')));
 await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(800);
 let a=await acc(); const u=a.users&&a.users.wan_gamer;
 ok('account created, password hashed not stored', u && u.hash && u.hash.length===64 && !JSON.stringify(a).includes('supersecret1'));
 ok('email optional (none saved)', u && u.email==='');
 const data=await p.evaluate(()=>JSON.parse(localStorage.getItem('levelup-life-v1:u:wan_gamer')));
 ok('guest progress moved into account', data && console.log('xp',data.xp)===undefined && data.xp===125 && data.questsTotal===3);
 // 3. log out / wrong password / log in
 await p.goto(URL+'#options'); await p.click('#acLogout'); await p.waitForTimeout(300);
 ok('log out shows sign-in', await p.isVisible('#consent'));
 await p.click('[data-auth="login"]'); await p.fill('#liUser','wan_gamer'); await p.fill('#liPass','wrongpass'); await p.click('#loginForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(600);
 ok('wrong password rejected', /Wrong username or password/.test(await p.textContent('#liErr')));
 await p.fill('#liPass','supersecret1'); await p.click('#loginForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(800);
 ok('log in works (case-insensitive username)', await p.isHidden('#consent') && (await p.textContent('#avatar'))==='W');
 // 4. second account with email, separate data
 await p.goto(URL+'#options'); await p.click('#acLogout'); await p.waitForTimeout(200);
 await p.fill('#suUser','sis'); await p.fill('#suPass','anotherpass'); await p.fill('#suPass2','anotherpass'); await p.fill('#suEmail','bad-email'); await p.check('#suAgree'); await p.click('#signupForm .btn.primary'); await H.authDone(p);
 ok('bad email rejected', /email/.test(await p.textContent('#suErr')));
 await p.fill('#suEmail','sis@example.com'); await p.click('#signupForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(800);
 const sis=await p.evaluate(()=>JSON.parse(localStorage.getItem('levelup-life-v1:u:sis')));
 ok('second account has its own fresh data', sis && sis.questsTotal===0 && (await acc()).users.sis.email==='sis@example.com');
 // 5. faked owner value is rejected
 await p.evaluate(()=>{const k='levelup-life-v1:u:sis';const d=JSON.parse(localStorage.getItem(k));d.ownerProof='a'.repeat(64);localStorage.setItem(k,JSON.stringify(d));});
 await p.reload(); await p.waitForTimeout(500);
 ok('faked owner data does not unlock', !(await p.textContent('#lvl')).includes('MAX'));
 // 6. wrong key rejected, real key unlocks
 await p.goto(URL+'#options'); await p.fill('#ownKey','LVL-AAAAA-BBBBB-CCCCC-DDDDD'); await p.click('#ownForm .btn'); await p.waitForTimeout(1500);
 ok('wrong owner key rejected', /not right/.test(await p.textContent('#ownErr')));
 await p.evaluate(()=>location.hash='#home'); await p.click('.profile'); await p.goto(URL+'#options');
 await p.evaluate(()=>{ for (const k of Object.keys(localStorage)) if (k.endsWith(':u:sis')) {} });
 // log in as owner account first
 await p.click('#acLogout'); await p.click('[data-auth="login"]'); await p.fill('#liUser','Wan_Gamer'); await p.fill('#liPass','supersecret1'); await p.click('#loginForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(800);
 await p.goto(URL+'#options'); await p.fill('#ownKey',KEY.toLowerCase().replace(/-/g,' ')); await p.click('#ownForm .btn'); await p.waitForTimeout(2500);
 ok('owner key unlocks (any case/spacing)', (await p.textContent('#pageTitle'))==='Badges' && (await p.textContent('#lvl'))==='1000 MAX');
 ok('all badges Challenger + Founder', (await p.$$('.badge-tile.top')).length===10 && (await p.$$('.badge-tile.tier-owner')).length===1);
 await p.reload(); await p.waitForTimeout(1500);
 ok('owner status survives reload', (await p.textContent('#lvl'))==='1000 MAX');
 await p.screenshot({path:OUT+'owner-badges.png',fullPage:true});
 // 7. other account is not owner
 await p.goto(URL+'#options'); await p.click('#acLogout'); await p.click('[data-auth="login"]'); await p.fill('#liUser','sis'); await p.fill('#liPass','anotherpass'); await p.click('#loginForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(1200);
 await p.goto(URL+'#badges'); await p.waitForTimeout(300);
 ok('other accounts are not owner', !(await p.textContent('#lvl')).includes('MAX') && (await p.$$('.badge-tile.tier-owner')).length===0);
 await p.screenshot({path:OUT+'user-badges.png',fullPage:true});
 // 8. delete account
 await p.goto(URL+'#options'); await p.click('#acDelete'); await p.click('#acDelete'); await p.waitForTimeout(300);
 ok('delete account removes it', !(await acc()).users.sis && !(await p.evaluate(()=>localStorage.getItem('levelup-life-v1:u:sis'))));
 // 9. walk all tabs logged in as owner, check errors + phone overflow + fresh visitor sees sign up
 await p.click('[data-auth="login"]'); await p.fill('#liUser','wan_gamer'); await p.fill('#liPass','supersecret1'); await p.click('#loginForm .btn.primary'); await H.authDone(p); await p.waitForTimeout(800);
 for(const t of TABS){ await p.goto(URL+'#'+t); await p.waitForTimeout(80); }
 const all=await p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))));
 const m=await (await b.newContext({viewport:{width:375,height:812}})).newPage(); m.on('pageerror',e=>errs.push('mobile: '+e.message));
 await m.route(/fonts\.(googleapis|gstatic)|ytimg/, r=>r.abort());
 await m.goto(URL); await m.waitForTimeout(300);
 ok('new visitor sees create-account screen', await m.isVisible('#signupForm'));
 await m.screenshot({path:OUT+'m-signup.png'});
 await m.evaluate(s=>{const o=JSON.parse(s);for(const k in o) localStorage.setItem(k,o[k]);},all); await m.reload(); await m.waitForTimeout(1500);
 const over=[]; for(const t of TABS){ await m.goto(URL+'#'+t); await m.waitForTimeout(150); const w=await m.evaluate(()=>document.documentElement.scrollWidth); if(w>375) over.push(`${t}:${w}`); }
 ok('no sideways scroll on phone (all tabs)', over.length===0, over.join(' '));
 await m.goto(URL+'#badges'); await m.waitForTimeout(400); await m.screenshot({path:OUT+'m-badges.png',fullPage:true});
 await p.goto(URL+'#home'); await p.waitForTimeout(300); await p.screenshot({path:OUT+'owner-home.png'});
 // the sign-in box puts the cursor in Username a moment after it opens; if you are already typing in another box
 // by then (a slow device), it must not jump back and send your password into the username box
 await p.goto(URL+'#options'); await p.waitForTimeout(300);
 await p.evaluate(()=>{ document.querySelector('#acLogout').click(); document.querySelector('#suPass').focus(); });
 await p.waitForTimeout(250);
 ok('the sign-in box does not move the cursor once you have started typing', await p.evaluate(()=>document.activeElement && document.activeElement.id==='suPass'), await p.evaluate(()=>document.activeElement && document.activeElement.id));
 console.log(res.join('\n')); console.log('JS errors:', errs.length? errs : 'none'); await b.close();
})();
