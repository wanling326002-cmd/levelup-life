const {chromium}=require('playwright'); const H=require('./harness');
const URL=H.FILE_URL;
const OUT=H.OUT+'shots2/';
const TABS=['home','study','focus','gaming','series','youtube','balance','impact','options','help','privacy'];
const seed=()=>{const S=JSON.parse(localStorage.getItem('levelup-life-v1'));const pad=n=>String(n).padStart(2,'0');const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`};
  for(let i=1;i<7;i++){S.log.push({d:d(i),cat:'learn',m:20+i*9%50},{d:d(i),cat:'play',m:60+(i*37)%80,g:'Elden Ring'},{d:d(i),cat:'watch',m:30+(i*23)%60});}
  S.series=[{id:'a',title:'Arcane',platform:'Netflix',s:2,e:3,status:'watching'},{id:'b',title:'Severance',platform:'Apple TV',s:1,e:0,status:'plan'}];
  S.backlog=[{id:'c',title:'Elden Ring',platform:'PC',status:'playing'},{id:'d',title:'Hollow Knight',platform:'Switch',status:'backlog'}];
  S.yt=[{id:'e',url:'https://www.youtube.com/watch?v=abcdefghijk',title:'CSS Grid in 20 minutes',kind:'learn',mins:20,watched:false}];
  S.tasks=[{id:'t1',text:'Finish flexbox exercise',done:false}];
  S.paths=[{id:'pa',name:'Spanish',steps:[{id:'s1',t:'Learn the alphabet',url:''},{id:'s2',t:'100 common words',url:'https://example.com/words'}]}]; S.path='pa';
  localStorage.setItem('levelup-life-v1',JSON.stringify(S));};
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[];
 const ok=(name,cond,extra='')=>res.push(`${cond?'PASS':'FAIL'}  ${name} ${extra}`);
 const ctx=await b.newContext({viewport:{width:1440,height:950}});
 await ctx.route(/fonts\.(googleapis|gstatic)|ytimg/, r=>r.abort());
 const p=await ctx.newPage(); p.on('pageerror',e=>errs.push('desktop: '+e.message));
 await p.goto(URL); await p.click('#guestBtn');
 const st=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('levelup-life-v1')));
 await p.evaluate(seed); await H.reloadKeep(p);
 await p.goto(URL+'#study'); let xp0=(await st()).xp;
 await p.click('[data-step="s1"]'); await p.click('[data-step="s1"]');
 let s=await st(); ok('study step untick removes minutes & XP', s.log.filter(x=>x.ref).length===0 && s.xp===xp0, `xp ${xp0}->${s.xp}`);
 xp0=s.xp; await p.click('[data-task="t1"]'); await p.click('[data-task="t1"]'); s=await st();
 ok('task untick takes XP back', s.xp===xp0);
 await p.goto(URL+'#youtube'); xp0=(await st()).xp;
 await p.click('[data-yw="e"]'); await p.click('[data-yw="e"]'); s=await st();
 ok('video unwatch removes minutes & XP', s.xp===xp0 && !s.log.some(x=>x.ref==='yt:e'));
 await p.goto(URL+'#gaming'); xp0=(await st()).xp;
 for(const v of ['finished','playing','finished']) await p.selectOption('[data-bstat="d"]',v);
 s=await st(); ok('finished game gives XP once', s.xp===xp0+10, `${xp0}->${s.xp}`);
 await p.goto(URL+'#series'); await p.click('[data-sep="b"]'); s=await st();
 ok('+1 ep starts a planned show', s.series.find(x=>x.id==='b').status==='watching');
 await p.goto(URL+'#focus'); await p.click('#tGo'); await p.waitForTimeout(400);
 const t1=await p.title(); await p.click('#tGo'); const t2=await p.title();
 ok('tab title restored after pause', /Focus · LevelUp Life/.test(t2), `"${t1}" -> "${t2}"`);
 await p.click('#tGo'); await p.waitForTimeout(300); await H.reloadKeep(p); await p.waitForTimeout(400);
 ok('running focus timer survives reload', /Pause/.test(await p.textContent('#tGo')));
 await p.click('#tGo');
 await p.goto(URL+'#gaming'); await p.fill('#gGame','Hades'); await p.click('#gGo'); await H.reloadKeep(p); await p.waitForTimeout(400);
 ok('gaming session survives reload', /Stop/.test(await p.textContent('#gGo')));
 await p.click('#gGo');
 await p.goto(URL+'#focus'); ok('focus sessions count ignores lessons', (await p.textContent('.c5 .stat .v'))==='0');
 await p.goto(URL+'#gaming'); await p.focus('.skip'); await p.keyboard.press('Enter');
 ok('skip link stays on tab', (await p.textContent('#pageTitle'))==='Gaming');
 await p.evaluate(()=>localStorage.setItem('levelup-life-v1',JSON.stringify({agreed:true,track:'nope',series:[{id:'"><img src=x onerror=window.pwned=1>',title:'<b>x</b>',s:'2"',e:'x',status:'zzz'}],yt:[{title:'t',url:'javascript:alert(1)',mins:'"><b>'}],goals:{learn:'abc'},
   paths:[{id:'"><img src=x onerror=window.pwned=1>',name:'<img src=x onerror=window.pwned=1>',steps:[{id:'z',t:'<img src=x onerror=window.pwned=1>',url:'javascript:window.pwned=1'},{t:''},null]},{name:''},'x'],path:'nope'})));
 await H.reloadKeep(p); await p.waitForTimeout(300);
 for(const t of TABS){ await p.goto(URL+'#'+t); await p.waitForTimeout(80); }
 ok('broken/malicious backup handled safely', !(await p.evaluate(()=>window.pwned)) && (await p.$$('img[src="x"]')).length===0);
 await p.goto(URL+'#study'); await p.waitForTimeout(150);
 ok('a booby-trapped study path shows as plain text, with no javascript: link', (await p.textContent('.sp-head h2')).includes('<img') && (await p.$$('.sp-steps a[href^="javascript"]')).length===0 && (await p.$$('[data-path]')).length===1);
 // clean demo data for screenshots
 await p.evaluate(()=>localStorage.clear()); await p.goto(URL); await p.click('#guestBtn');
 await p.evaluate(seed); await p.evaluate(()=>{const S=JSON.parse(localStorage.getItem('levelup-life-v1'));const x=new Date();const pad=n=>String(n).padStart(2,'0');const t=`${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;S.log.push({d:t,cat:'learn',m:45},{d:t,cat:'play',m:70,g:'Elden Ring'},{d:t,cat:'watch',m:40});S.xp=140;localStorage.setItem('levelup-life-v1',JSON.stringify(S));});
 const data=await p.evaluate(()=>localStorage.getItem('levelup-life-v1'));
 for(const t of ['home','balance','impact']){ await p.goto(URL+'#'+t); await H.reloadKeep(p); await p.waitForTimeout(450); await p.screenshot({path:`${OUT}d-${t}.png`,fullPage:true}); }
 await p.evaluate(()=>{const S=JSON.parse(localStorage.getItem('levelup-life-v1'));S.theme='light';localStorage.setItem('levelup-life-v1',JSON.stringify(S));});
 await p.goto(URL+'#focus'); await H.reloadKeep(p); await p.waitForTimeout(450); await p.screenshot({path:`${OUT}d-light-focus.png`,fullPage:true});
 const m=await (await b.newContext({viewport:{width:375,height:812}})).newPage(); m.on('pageerror',e=>errs.push('mobile: '+e.message));
 await m.route(/fonts\.(googleapis|gstatic)|ytimg/, r=>r.abort());
 await m.goto(URL); await m.evaluate(d=>localStorage.setItem('levelup-life-v1',d),data); await m.reload();
 const over=[];
 for(const t of TABS){ await m.goto(URL+'#'+t); await m.waitForTimeout(150); const w=await m.evaluate(()=>document.documentElement.scrollWidth); if(w>375) over.push(`${t}:${w}`); }
 ok('no sideways scroll on phone (all tabs)', over.length===0, over.join(' '));
 for(const t of ['home','series']){ await m.goto(URL+'#'+t); await m.waitForTimeout(400); await m.screenshot({path:`${OUT}m-${t}.png`,fullPage:true}); }
 console.log(res.join('\n')); console.log('JS errors:', errs.length? errs : 'none'); await b.close();
})();
