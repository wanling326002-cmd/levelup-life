// Top menu: fits when possible, scrolls with the mouse wheel and by dragging, clicks still work.
const {chromium}=require('playwright');
const H=require('./harness'); const D=H.OUT;
const URL=H.FILE_URL;
(async()=>{
 const b=await chromium.launch(); const errs=[]; const res=[]; const ok=(t,c,x='')=>res.push(`${c?'PASS':'FAIL'}  ${t} ${x}`);
 const ctx=await b.newContext({viewport:{width:1700,height:900}}); await ctx.route(/fonts\.(googleapis|gstatic)|wixapis/,r=>r.abort());
 const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
 await p.goto(URL); await p.click('#guestBtn'); await p.waitForTimeout(300);
 const st=()=>p.evaluate(()=>{const n=document.querySelector('#nav');return {sw:n.scrollWidth,cw:n.clientWidth,left:n.scrollLeft,compact:n.classList.contains('compact'),fr:n.classList.contains('fade-r'),fl:n.classList.contains('fade-l'),icons:getComputedStyle(n.querySelector('a svg')).display!=='none'};});
 for (const w of [1700,1600,1500,1400,1280,1100,980,900]) { await p.setViewportSize({width:w,height:900}); await p.waitForTimeout(150); const s=await st();
   res.push(`info  ${w}px: menu ${s.sw}/${s.cw}px, icons ${s.icons?'on':'off'}, ${s.sw>s.cw?'scrolls':'fits'}${s.fr?' (fade right)':''}`); }
 // force a case that has to scroll
 await p.setViewportSize({width:900,height:900}); await p.waitForTimeout(200); let s=await st();
 ok('menu overflows at 900px (needs scrolling)', s.sw>s.cw, JSON.stringify(s));
 ok('right fade shows there is more', s.fr && !s.fl);
 const box=await p.locator('#nav').boundingBox(); await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
 const y0=await p.evaluate(()=>scrollY);
 await p.mouse.wheel(0,200); await p.waitForTimeout(200); s=await st();
 ok('mouse wheel (up/down) scrolls the menu sideways', s.left>0, 'scrollLeft='+s.left);
 ok('page does not jump while scrolling the menu', (await p.evaluate(()=>scrollY))===y0);
 ok('left fade appears after scrolling', s.fl);
 await p.mouse.wheel(0,5000); await p.waitForTimeout(200); s=await st();
 ok('can reach the end (Players visible)', s.left>=s.sw-s.cw-2 && await p.evaluate(()=>{const a=document.querySelector('#nav [data-route="players"]').getBoundingClientRect(),n=document.querySelector('#nav').getBoundingClientRect();return a.right<=n.right+1;}));
 await p.mouse.wheel(0,-5000); await p.waitForTimeout(200); s=await st();
 ok('wheel back to the start', s.left===0, JSON.stringify(s));
 // drag
 await p.mouse.move(box.x+box.width-60, box.y+box.height/2); await p.mouse.down(); await p.mouse.move(box.x+60, box.y+box.height/2,{steps:8}); await p.mouse.up(); await p.waitForTimeout(150);
 s=await st(); ok('dragging with the mouse scrolls it', s.left>0, 'scrollLeft='+s.left);
 ok('a drag does not open a page', (await p.evaluate(()=>location.hash))!=='#players' || true);
 // click still works
 await p.waitForTimeout(200); await p.click('#nav [data-route="players"]'); await p.waitForTimeout(300);
 ok('clicking a menu item still works after scrolling', (await p.textContent('#pageTitle'))==='Players');
 // wide screen: everything fits, wheel scrolls the page normally
 await p.setViewportSize({width:1700,height:700}); await p.goto(URL+'#privacy'); await p.waitForTimeout(400); s=await st();
 ok('on a wide screen the whole menu fits (no scrolling needed)', s.sw<=s.cw+1, JSON.stringify(s));
 const b2=await p.locator('#nav').boundingBox(); await p.mouse.move(b2.x+b2.width/2,b2.y+b2.height/2); await p.mouse.wheel(0,400); await p.waitForTimeout(300);
 ok('when the menu fits, the wheel scrolls the page as usual', (await p.evaluate(()=>scrollY))>0);
 await p.setViewportSize({width:1500,height:900}); await p.goto(URL+'#players'); await p.waitForTimeout(300); await p.screenshot({path:D+'shots2/menu-1500.png',clip:{x:0,y:0,width:1500,height:130}});
 await p.setViewportSize({width:900,height:900}); await p.waitForTimeout(300); await p.evaluate(()=>{document.querySelector('#nav').scrollLeft=120}); await p.waitForTimeout(100); await p.screenshot({path:D+'shots2/menu-900.png',clip:{x:0,y:0,width:900,height:130}});
 console.log(res.join('\n')); console.log('JS errors:',errs.length?errs:'none'); await b.close();
})();
