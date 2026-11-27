// Logging in when email + password can't work: "Continue with Google or Wix" (Wix's own sign-in page, PKCE, back to
// the website with a code), choosing / entering the LevelUp Life password that locks synced progress, clear messages
// that tell a wrong password apart from a problem after a correct one, and the reCAPTCHA box without white edges.
const {chromium} = require('playwright'); const {spawn} = require('child_process');
const H = require('./harness'); const D = H.OUT;
const SITE = D + 'served23/'; H.copySite(SITE);
const PORT = 8774, ROOT = `http://localhost:${PORT}/`, BASE = ROOT + 'app.html'; // the app; sign-in returns to the main address (ROOT), whose front page hands it on to the app
const hdr = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json'};
const CAPTCHA_JS = "(function(){var g={render:function(el,o){el.innerHTML='<div style=\"width:304px;height:78px;background:#fff\"><div><label class=\"fakecap\"><input type=\"checkbox\" class=\"fakeCaptcha\"> I am not a robot</label></div></div>';return 1;},getResponse:function(){var c=document.querySelector('.fakeCaptcha');return c&&c.checked?'ok-token':'';},reset:function(){var c=document.querySelector('.fakeCaptcha');if(c)c.checked=false;}};window.grecaptcha={enterprise:g};var m=(document.currentScript.src.match(/onload=([A-Za-z_]+)/)||[])[1];if(m&&window[m])window[m]();})();";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEMBER = {id: '5ca76327-a370-4d1a-a8df-e4efd142b0b2', loginEmail: 'owner@example.com', profile: {nickname: 'Owner Person'}};
const memberData = new Map(), calls = []; let sessionFails = false;
async function mock(route) {
  const req = route.request(), u = req.url(), body = req.postData() ? JSON.parse(req.postData()) : {}, auth = req.headers()['authorization'] || '';
  calls.push({u, body});
  const ok = o => route.fulfill({status: 200, headers: hdr, body: JSON.stringify(o)}), bad = (s, o) => route.fulfill({status: s, headers: hdr, body: JSON.stringify(o)});
  if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: hdr});
  if (u.includes('/oauth2/token')) {
    if (body.grantType === 'authorization_code' && body.code === 'hosted-code') {
      if (body.redirectUri !== ROOT || !body.codeVerifier) return bad(400, {error: 'invalid_request'});
      return ok({access_token: 'mem-owner', refresh_token: 'rt-owner', expires_in: 14400});
    }
    if (body.grantType === 'refresh_token' && body.refreshToken === 'rt-owner') return ok({access_token: 'mem-owner', refresh_token: 'rt-owner', expires_in: 14400});
    if (body.grantType === 'authorization_code') return bad(400, {error: 'invalid_grant'});
    return ok({access_token: 'anon', expires_in: 3600});
  }
  if (u.endsWith('/_api/redirects-api/v1/redirect-session')) {
    const a = body.auth.authRequest;
    if (a.responseMode === 'query') { // the hosted sign-in page
      if (a.redirectUri !== ROOT || a.codeChallengeMethod !== 'S256' || !a.codeChallenge) return bad(400, {});
      return ok({redirectSession: {id: 'rs', fullUrl: 'https://login.mock.test/login?state=' + a.state + '&to=' + encodeURIComponent(a.redirectUri)}});
    }
    if (sessionFails) return bad(500, {message: 'boom'});
    return ok({redirectSession: {id: 'rs2', fullUrl: 'https://auth.mock.test/authorize?state=' + a.state}});
  }
  if (u.includes('/members/v1/members/my')) return auth === 'mem-owner' ? ok({member: MEMBER}) : bad(401, {});
  if (u.endsWith('/_api/iam/authentication/v2/login')) {
    if (((body.captcha_tokens || [])[0] || {}).Recaptcha !== 'ok-token') return bad(403, {message: "Didn't receive Captcha token"});
    if (body.loginId.email === 'right@example.com' && body.password === 'rightpassword') return ok({state: 'SUCCESS', sessionToken: 'sess-1', identity: {id: 'mbr-2-abcdef12', identityProfile: {nickname: 'right'}}});
    return bad(403, {message: 'wrong credentials'});
  }
  if (u.endsWith('/wix-data/v2/items/query') && body.dataCollectionId === 'MemberData') {
    if (auth !== 'mem-owner') return bad(403, {});
    const it = memberData.get(body.query.filter._id); return ok({dataItems: it ? [it] : []});
  }
  if (u.endsWith('/wix-data/v2/items/save') && body.dataCollectionId === 'MemberData') {
    if (auth !== 'mem-owner') return bad(403, {});
    const it = {id: body.dataItem.id, data: {...body.dataItem.data, _id: body.dataItem.id}}; memberData.set(it.id, it); return ok({dataItem: it});
  }
  if (u.endsWith('/wix-data/v2/items/query')) return ok({dataItems: []});
  return ok({});
}

(async () => {
  const srv = spawn(process.execPath, [H.SERVE, SITE, String(PORT)], {stdio: 'ignore'}); process.on('exit', () => srv.kill()); await sleep(600);
  const b = await chromium.launch(); const res = [], errs = [];
  const ok = (t, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${t} ${c ? '' : x}`);
  const mk = async () => {
    const ctx = await b.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: 'block'});
    await ctx.route(/wixapis\.com/, mock);
    await ctx.route(/google\.com\/recaptcha/, r => r.fulfill({status: 200, headers: {'content-type': 'text/javascript'}, body: CAPTCHA_JS}));
    await ctx.route(/api\.github\.com/, r => r.fulfill({status: 404, headers: hdr, body: '{}'}));
    // Wix's sign-in page: the person signs in (with Google, say) and is sent back with a one-time code
    await ctx.route(/login\.mock\.test/, r => { const q = new URL(r.request().url()).searchParams;
      r.fulfill({status: 200, headers: {'content-type': 'text/html'}, body: `<title>Sign in</title><button id="google" onclick="location.href='${decodeURIComponent(q.get('to'))}?code=hosted-code&state=${q.get('state')}'">Continue with Google</button><button id="cancel" onclick="location.href='${decodeURIComponent(q.get('to'))}?error=access_denied&state=${q.get('state')}'">Cancel</button>`}); });
    await ctx.route(/auth\.mock\.test/, r => r.fulfill({status: 200, headers: {'content-type': 'text/html'}, body: '<script>var q=new URLSearchParams(location.search);parent.postMessage({code:"code-1",state:q.get("state")},"*");</script>'}));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE); await p.waitForTimeout(400); return p;
  };
  const settle = async p => { await p.waitForTimeout(300); for (let i = 0; i < 40; i++) { const busy = await p.evaluate(() => { const x = document.querySelector('#onlineForm .btn.primary'); return !!(x && x.disabled); }); if (!busy) break; await p.waitForTimeout(250); } await p.waitForTimeout(500); };
  const err = p => p.textContent('#olErr');

  // 1. a wrong password says so, and points to the other way in
  let p = await mk();
  await p.click('[data-auth="online"]'); await p.waitForTimeout(300); await p.click('[data-olmode="login"]'); await p.waitForTimeout(300);
  ok('the online form offers "Continue with Google or Wix"', await p.isVisible('#olHosted') && (await p.textContent('#onlineForm')).includes('or with email and password'));
  const capBox = await p.$eval('#olCaptcha > div', e => { const r = e.getBoundingClientRect(); return {w: r.width, h: r.height, o: getComputedStyle(e).overflow}; });
  ok('the "I\'m not a robot" box is clipped, so its light frame and corners never show', capBox.w === 302 && capBox.h === 76 && capBox.o === 'hidden', JSON.stringify(capBox));
  await p.fill('#olEmail', 'owner@example.com'); await p.fill('#olPass', 'ThisIsNotIt99'); await p.check('.fakeCaptcha'); await p.click('#onlineForm .btn.primary'); await settle(p);
  let e = await err(p);
  ok('a wrong password explains it and suggests "Continue with Google or Wix"', e.includes('Wrong email or password') && e.includes('Continue with Google or Wix'), e);

  // 2. a correct password with a problem afterwards is not called a wrong password
  sessionFails = true;
  await p.fill('#olEmail', 'right@example.com'); await p.fill('#olPass', 'rightpassword'); await p.check('.fakeCaptcha'); await p.click('#onlineForm .btn.primary'); await settle(p);
  e = await err(p); sessionFails = false;
  ok('a problem after a correct password says the password was accepted', e.includes('were accepted') && !e.includes('Wrong'), e);

  // 3. cancelling on the sign-in page comes back with a clear note
  await p.click('#olHosted'); await p.waitForURL(/login\.mock\.test/); await p.click('#cancel'); await p.waitForURL(u => String(u).startsWith(BASE)); await p.waitForTimeout(800);
  ok('cancelling on the sign-in page comes back to the form with a note', (await err(p)).includes('cancelled') && !(await p.evaluate(() => location.search)), await err(p));

  // 4. Continue with Google or Wix: sign in there, choose a LevelUp Life password here, and you're in
  await p.click('#olHosted'); await p.waitForURL(/login\.mock\.test/);
  ok('the sign-in page is opened with PKCE and returns to this website', calls.some(c => c.u.endsWith('redirect-session') && c.body.auth.authRequest.responseMode === 'query' && c.body.auth.authRequest.codeChallengeMethod === 'S256'));
  await p.click('#google'); await p.waitForURL(u => String(u).startsWith(BASE));
  await p.waitForSelector('#olSync', {timeout: 8000}).catch(() => {});
  let t = (await p.textContent('#onlineForm')).replace(/\s+/g, ' ');
  ok('back on the website, it asks for a LevelUp Life password for this member', await p.isVisible('#olSync') && await p.isVisible('#olSync2') && t.includes('owner@example.com'), t.slice(0, 200));
  ok('the one-time code is removed from the address bar', !(await p.evaluate(() => location.search)));
  await p.fill('#olSync', 'short'); await p.click('#onlineForm .btn.primary'); await settle(p);
  ok('the password must be at least 8 characters', (await err(p)).includes('at least 8'));
  await p.fill('#olSync', 'MyLevelUpPass1'); await p.fill('#olSync2', 'MyLevelUpPass2'); await p.click('#onlineForm .btn.primary'); await settle(p);
  ok('the two passwords must match', (await err(p)).includes('do not match'));
  await p.fill('#olSync2', 'MyLevelUpPass1'); await p.click('#onlineForm .btn.primary'); await settle(p);
  await p.waitForFunction(() => document.querySelector('#consent').hidden, null, {timeout: 8000}).catch(() => {});
  const acc = await p.evaluate(() => JSON.parse(localStorage.getItem('levelup-accounts-v1')));
  const u = acc.users[acc.current.toLowerCase()];
  ok('the member is signed in as an online account on this device', !!(u && u.online && u.online.id === MEMBER.id && u.online.rt === 'rt-owner'), JSON.stringify(acc).slice(0, 300));
  ok('the account is named after the member', /^Owner/.test(acc.current) || /^owner/.test(acc.current), acc.current);
  await p.waitForFunction(() => true); await sleep(2500);
  const saved = memberData.get('m-' + MEMBER.id);
  ok('progress is uploaded locked (encrypted), never in plain text', !!saved && !!saved.data.payload && !/"xp"|"log"/.test(saved.data.payload));
  await p.context().close();

  // 5. on another device: the same sign-in, then the same password unlocks the saved progress
  p = await mk();
  ok('the first screen leads with "Continue with Google or Wix", with LevelUp accounts below', await p.isVisible('#authHosted') && (await p.textContent('.auth-quick')).includes('or use a LevelUp account') && await p.isVisible('#signupForm'));
  ok('...and Create account below it is a plain button, so there is one main button', await p.evaluate(() => getComputedStyle(document.querySelector('#signupForm .btn.primary')).backgroundImage === 'none'));
  ok('the whole sign-in box fits on the screen', await p.evaluate(() => { const r = document.querySelector('.auth').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  await p.click('[data-auth="online"]'); await p.waitForTimeout(200);
  ok('the Online tab does not repeat it at the top (it has its own button)', !(await p.isVisible('#authHosted')) && await p.isVisible('#olHosted'));
  await p.click('[data-auth="signup"]'); await p.waitForTimeout(200);
  await p.click('#authHosted'); await p.waitForURL(/login\.mock\.test/); await p.click('#google'); await p.waitForURL(u2 => String(u2).startsWith(BASE));
  await p.waitForSelector('#olSync', {timeout: 8000}).catch(() => {});
  ok('with saved progress it asks to unlock it (one password box)', await p.isVisible('#olSync') && !(await p.$('#olSync2')) && (await p.textContent('#onlineForm')).includes('Unlock your saved progress'));
  await p.fill('#olSync', 'WrongPassword9'); await p.click('#onlineForm .btn.primary'); await settle(p);
  ok('a wrong LevelUp Life password does not unlock it', (await err(p)).includes("didn't unlock"));
  await p.fill('#olSync', 'MyLevelUpPass1'); await p.click('#onlineForm .btn.primary'); await settle(p);
  await p.waitForFunction(() => document.querySelector('#consent').hidden, null, {timeout: 8000}).catch(() => {});
  ok('the right password unlocks it and signs in', await p.evaluate(() => document.querySelector('#consent').hidden) && await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('levelup-accounts-v1')); return !!a.users[a.current.toLowerCase()].online; }));
  await p.context().close();

  console.log(res.join('\n')); console.log('JS errors:', errs.length ? errs : 'none');
  await b.close(); srv.kill();
})().catch(e => { console.log('CRASH:', e && e.stack || e); process.exit(1); });
