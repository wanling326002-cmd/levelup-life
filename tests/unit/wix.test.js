// The desktop app's Wix client against a fake Wix (companion/wix.js).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../../companion/wix');

// A fake www.wixapis.com: records calls and keeps collections in memory.
function fakeWix() {
  const state = {calls: [], items: {GameSessions: new Map(), CompanionDevices: new Map(), CompanionConfig: new Map()}, lastAuth: null, refreshCount: 0, failSaveIds: new Set(), refreshFails: false};
  const json = (status, body) => ({ok: status < 400, status, json: async () => body});
  const fetchImpl = async (url, opt = {}) => {
    const path = url.replace(W.API, ''), body = opt.body ? JSON.parse(opt.body) : null, auth = (opt.headers || {}).Authorization;
    state.calls.push({method: opt.method, path, body, auth});
    if (path === '/oauth2/token') {
      if (body.grantType === 'anonymous') return json(200, {access_token: 'anon', expires_in: 3600});
      if (body.grantType === 'authorization_code') { state.lastAuth = body; return json(200, {access_token: 'member-at-1', refresh_token: 'rt-1', expires_in: 14400}); }
      if (body.grantType === 'refresh_token') { if (state.refreshFails) return json(400, {message: 'invalid refresh token'}); state.refreshCount++; return json(200, {access_token: 'member-at-' + (state.refreshCount + 1), refresh_token: 'rt-' + (state.refreshCount + 1), expires_in: 14400}); }
    }
    if (path === '/_api/redirects-api/v1/redirect-session') {
      const a = body.auth.authRequest; state.session = a;
      return json(200, {redirectSession: {id: 'r1', fullUrl: 'https://login.example/authorize?state=' + a.state + '&redirectUri=' + encodeURIComponent(a.redirectUri)}});
    }
    if (path.startsWith('/members/v1/members/my')) return json(200, {member: {id: 'member-1', loginEmail: 'player@example.com', profile: {nickname: 'Player1'}}});
    if (!auth || auth === 'anon') return json(403, {message: 'members only'});
    const col = body && state.items[body.dataCollectionId];
    if (path === '/wix-data/v2/bulk/items/save') return json(200, {results: body.dataItems.map((d, i) => { const ok = !state.failSaveIds.has(d.id); if (ok) col.set(d.id, {id: d.id, data: d.data}); return {itemMetadata: {id: d.id, originalIndex: i, success: ok}}; })});
    if (path === '/wix-data/v2/items/save') { col.set(body.dataItem.id, {id: body.dataItem.id, data: body.dataItem.data}); return json(200, {dataItem: body.dataItem}); }
    if (path === '/wix-data/v2/items') { if (col.has(body.dataItem.id)) return json(409, {}); col.set(body.dataItem.id, {id: body.dataItem.id, data: body.dataItem.data}); return json(200, {dataItem: body.dataItem}); }
    if (path === '/wix-data/v2/items/query') {
      let all = [...col.values()]; const f = body.query.filter || {};
      if (f._id) all = all.filter(i => i.id === f._id);
      if (body.query.sort) all.sort((a, b) => b.data.updatedAt - a.data.updatedAt);
      return json(200, {dataItems: all.slice(0, body.query.paging.limit)});
    }
    if (opt.method === 'PATCH' && path.startsWith('/wix-data/v2/items/')) {
      const it = col.get(body.patch.dataItemId); if (!it) return json(404, {});
      for (const m of body.patch.fieldModifications) it.data[m.fieldPath] = m.setFieldOptions.value;
      return json(200, {dataItem: it});
    }
    if (path === '/wix-data/v2/bulk/items/remove') { for (const id of body.dataItemIds) col.delete(id); return json(200, {results: []}); }
    return json(404, {message: 'not mocked: ' + path});
  };
  return {state, fetchImpl};
}

test('sign-in: opens the Wix login page and swaps the returned code for tokens (PKCE)', async () => {
  const {state, fetchImpl} = fakeWix();
  let opened = '';
  const r = await W.signIn({fetchImpl, openExternal: async url => {
    opened = url;
    const u = new URL(url), back = decodeURIComponent(u.searchParams.get('redirectUri'));
    setTimeout(() => fetch(`${back}?code=CODE123&state=${u.searchParams.get('state')}`).then(x => x.text()).then(t => { state.page = t; }), 10); // the browser coming back
  }});
  assert.match(opened, /^https:\/\/login\.example\//);
  assert.match(state.session.redirectUri, /^http:\/\/localhost:4732[1-3]\/callback$/);
  assert.equal(state.session.codeChallengeMethod, 'S256');
  assert.equal(state.lastAuth.code, 'CODE123');
  assert.ok(state.lastAuth.codeVerifier.length >= 43, 'sends the verifier that matches the challenge');
  assert.equal(require('crypto').createHash('sha256').update(state.lastAuth.codeVerifier).digest('base64url'), state.session.codeChallenge);
  assert.equal(r.refreshToken, 'rt-1');
  assert.deepEqual(r.member, {id: 'member-1', email: 'player@example.com', nickname: 'Player1'});
  await new Promise(res => setTimeout(res, 50));
  assert.match(state.page, /connected/i);
  assert.ok(!JSON.stringify(state.calls).includes('password'), 'no password ever passes through the app');
});

test('sign-in: a reply with the wrong state is refused', async () => {
  const {fetchImpl} = fakeWix();
  await assert.rejects(W.signIn({fetchImpl, openExternal: async url => {
    const back = decodeURIComponent(new URL(url).searchParams.get('redirectUri'));
    setTimeout(() => fetch(`${back}?code=EVIL&state=forged`).catch(() => {}), 10);
  }}), /did not match/);
});

test('tokens refresh when needed, and a rejected refresh means signed out', async () => {
  const {state, fetchImpl} = fakeWix();
  const saved = [];
  const auth = new W.WixAuth({refreshToken: 'rt-1', fetchImpl, onRefreshToken: t => saved.push(t)});
  assert.equal(await auth.token(), 'member-at-2');
  assert.equal(await auth.token(), 'member-at-2', 'reused until it expires');
  assert.deepEqual(saved, ['rt-2'], 'a new refresh token is saved');
  auth.exp = 0; state.refreshFails = true;
  await assert.rejects(auth.token(), e => e.signedOut === true);
});

test('session pieces are upserted by id in chunks, and any failed piece fails the upload', async () => {
  const {state, fetchImpl} = fakeWix();
  const remote = new W.WixRemote({auth: new W.WixAuth({refreshToken: 'rt-1', fetchImpl}), fetchImpl});
  const segs = Array.from({length: 120}, (_, i) => ({id: `s${i}_2026-11-25`, sid: 's' + i, game: 'g', name: 'G', day: '2026-11-25', start: i, end: i + 10, open: false, rev: i + 10.5}));
  await remote.saveSegments(segs); await remote.saveSegments(segs);
  assert.equal(state.items.GameSessions.size, 120);
  assert.equal(state.calls.filter(c => c.path === '/wix-data/v2/bulk/items/save').length, 6, '3 chunks of up to 50, twice');
  state.failSaveIds.add('s7_2026-11-25');
  await assert.rejects(remote.saveSegments(segs.slice(0, 10)), /not saved/);
});

test('check-ins create the device once, then only update their own fields; a disconnect from the website sticks', async () => {
  const {state, fetchImpl} = fakeWix();
  const remote = new W.WixRemote({auth: new W.WixAuth({refreshToken: 'rt-1', fetchImpl}), fetchImpl});
  const dev = {device: 'abc', name: 'Gaming PC', appVersion: '1.1.0', lastSeen: 1, tracking: true, playing: [{game: 'g', name: 'G', since: 1}]};
  assert.deepEqual(await remote.heartbeat(dev), {revoked: false});
  assert.deepEqual(await remote.heartbeat({...dev, lastSeen: 2}), {revoked: false});
  assert.equal(state.items.CompanionDevices.get('dev-abc').data.lastSeen, 2);
  state.items.CompanionDevices.get('dev-abc').data.revoked = true;   // the member pressed "Disconnect" on the website
  assert.deepEqual(await remote.heartbeat({...dev, lastSeen: 3}), {revoked: true});
  assert.equal(state.items.CompanionDevices.get('dev-abc').data.revoked, true);
  assert.equal(state.items.CompanionDevices.get('dev-abc').data.lastSeen, 2, 'a disconnected device writes nothing more');
});

test('settings: one item per member, newest wins; deleting history removes every session', async () => {
  const {state, fetchImpl} = fakeWix();
  const remote = new W.WixRemote({auth: new W.WixAuth({refreshToken: 'rt-1', fetchImpl}), fetchImpl});
  assert.equal(await remote.getConfig(), null);
  const id = await remote.putConfig(null, {overallLimitMin: 120}, 10);
  assert.match(id, /^cfg-[0-9a-f]{24}$/);
  await remote.putConfig(id, {overallLimitMin: 90}, 20);
  assert.deepEqual((await remote.getConfig()).data, {overallLimitMin: 90});
  for (let i = 0; i < 250; i++) state.items.GameSessions.set('x' + i, {id: 'x' + i, data: {}});
  await remote.deleteAllSessions();
  assert.equal(state.items.GameSessions.size, 0);
});
