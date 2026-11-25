// Talks to the website's backend (Wix) for the desktop app: signing in, and saving/reading the member's own data.
// Sign-in uses Wix's own login page in the normal browser (OAuth with PKCE). The app never sees the password; it
// receives a code on a one-time local address (http://localhost:<port>/callback) and swaps it for tokens.
// All requests go to https://www.wixapis.com. Collections only let each member read and change their own items.
'use strict';
const http = require('http'), crypto = require('crypto');

const CLIENT_ID = '71e92457-9a77-4b96-8d3c-a3281c3bff9d';
const API = 'https://www.wixapis.com';
const SITE_URL = 'https://headless-bjzqdbegqqy-wanling326002-140d.wix-site-host.com/';
const PORTS = [47321, 47322, 47323]; // must match the allowed redirect addresses in the site's Headless settings
const COL = {sessions: 'GameSessions', devices: 'CompanionDevices', config: 'CompanionConfig'};

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

class WixError extends Error { constructor(status, body, msg) { super(msg || `Wix ${status}`); this.status = status; this.body = body; } }

async function call(fetchImpl, method, path, body, token) {
  const r = await fetchImpl(API + path, {method, headers: {'Content-Type': 'application/json', ...(token ? {Authorization: token} : {})}, body: body ? JSON.stringify(body) : undefined});
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw new WixError(r.status, j);
  return j;
}

/* ---------- sign-in ---------- */
function listenLocal(handler) { // the first free port of PORTS, on the loopback address only
  return new Promise((resolve, reject) => {
    const tryPort = i => {
      if (i >= PORTS.length) return reject(new Error('No free local port for sign-in (47321-47323). Close other copies of the app and try again.'));
      const srv = http.createServer(handler);
      srv.once('error', () => tryPort(i + 1));
      srv.listen(PORTS[i], '127.0.0.1', () => resolve({srv, port: PORTS[i]}));
    };
    tryPort(0);
  });
}
const PAGE = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06060b;color:#f3f1ff;font:16px/1.5 system-ui,sans-serif}main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#a8a3c7;margin:0}</style>
<main><h1>${title}</h1><p>${text}</p></main>`;

// Opens the Wix login page and waits for the member to finish. Resolves with tokens and the member's basic details.
async function signIn({openExternal, fetchImpl = fetch, timeoutMs = 5 * 60000, lang = 'en'}) {
  const verifier = b64url(crypto.randomBytes(32)), challenge = b64url(crypto.createHash('sha256').update(verifier).digest()), state = b64url(crypto.randomBytes(16));
  let done, fail; const result = new Promise((res, rej) => { done = res; fail = rej; });
  const {srv, port} = await listenLocal((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
    const code = u.searchParams.get('code'), st = u.searchParams.get('state'), err = u.searchParams.get('error');
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    if (err || !code || st !== state) { res.end(PAGE('Not connected', 'The sign-in was cancelled or did not match. Go back to LevelUp Life and try again.')); return fail(new Error(err || 'The sign-in did not match. Please try again.')); }
    res.end(PAGE("You're connected", 'You can close this tab and go back to LevelUp Life.'));
    done(code);
  });
  const redirectUri = `http://localhost:${port}/callback`;
  const timer = setTimeout(() => fail(new Error('Sign-in timed out. Please try again.')), timeoutMs);
  try {
    const anon = await call(fetchImpl, 'POST', '/oauth2/token', {clientId: CLIENT_ID, grantType: 'anonymous'});
    const sess = await call(fetchImpl, 'POST', '/_api/redirects-api/v1/redirect-session', {
      auth: {authRequest: {redirectUri, clientId: CLIENT_ID, codeChallenge: challenge, codeChallengeMethod: 'S256', responseMode: 'query', responseType: 'code', scope: 'offline_access', state}},
      preferences: {additionalQueryParameters: {lang}},
    }, anon.access_token);
    const url = sess.redirectSession && sess.redirectSession.fullUrl;
    if (!url) throw new Error('The website did not return a sign-in page.');
    await openExternal(url);
    const code = await result;
    const tok = await call(fetchImpl, 'POST', '/oauth2/token', {clientId: CLIENT_ID, grantType: 'authorization_code', redirectUri, code, codeVerifier: verifier});
    const auth = new WixAuth({refreshToken: tok.refresh_token, fetchImpl});
    auth.access = tok.access_token; auth.exp = Date.now() + ((tok.expires_in || 14400) - 120) * 1000;
    const me = await auth.member();
    return {refreshToken: auth.refreshToken, member: me};
  } finally { clearTimeout(timer); srv.close(); }
}

/* ---------- tokens ---------- */
class WixAuth {
  constructor({refreshToken, fetchImpl = fetch, onRefreshToken = () => {}}) { this.refreshToken = refreshToken; this.fetchImpl = fetchImpl; this.onRefreshToken = onRefreshToken; this.access = ''; this.exp = 0; }
  async token() {
    if (this.access && Date.now() < this.exp) return this.access;
    let j;
    try { j = await call(this.fetchImpl, 'POST', '/oauth2/token', {clientId: CLIENT_ID, grantType: 'refresh_token', refreshToken: this.refreshToken}); }
    catch (e) { if (e.status === 400 || e.status === 401 || e.status === 403) e.signedOut = true; throw e; }
    this.access = j.access_token; this.exp = Date.now() + ((j.expires_in || 14400) - 120) * 1000;
    if (j.refresh_token && j.refresh_token !== this.refreshToken) { this.refreshToken = j.refresh_token; this.onRefreshToken(j.refresh_token); }
    return this.access;
  }
  async member() {
    const j = await call(this.fetchImpl, 'GET', '/members/v1/members/my?fieldsets=FULL', null, await this.token());
    const m = j.member || {};
    return {id: m.id || '', email: m.loginEmail || '', nickname: (m.profile && m.profile.nickname) || ''};
  }
}

/* ---------- the member's data ---------- */
class WixRemote {
  constructor({auth, fetchImpl = fetch}) { this.auth = auth; this.fetchImpl = fetchImpl; }
  async req(method, path, body) { return call(this.fetchImpl, method, path, body, await this.auth.token()); }

  // Upsert session pieces by id: sending the same piece twice replaces it instead of adding it.
  async saveSegments(segments) {
    for (let i = 0; i < segments.length; i += 50) {
      const chunk = segments.slice(i, i + 50);
      const j = await this.req('POST', '/wix-data/v2/bulk/items/save', {dataCollectionId: COL.sessions, dataItems: chunk.map(s => ({id: s.id, data: {
        sid: s.sid, device: this.deviceId || '', game: s.game, name: s.name, day: s.day, start: s.start, end: s.end, open: !!s.open, rev: s.rev}}))});
      const bad = (j.results || []).filter(r => !(r.itemMetadata && r.itemMetadata.success));
      if (bad.length || (j.results || []).length !== chunk.length) throw new WixError(200, j, `${bad.length || 'some'} session pieces were not saved`);
    }
  }
  // Check in: who is playing, whether tracking is on. Only these fields are written, so a "disconnected" mark set
  // from the website is never overwritten. Returns {revoked}.
  async heartbeat(dev) {
    const id = 'dev-' + dev.device;
    const found = await this.req('POST', '/wix-data/v2/items/query', {dataCollectionId: COL.devices, query: {filter: {_id: id}, paging: {limit: 1}}});
    const item = (found.dataItems || [])[0];
    const fields = {device: dev.device, name: dev.name, appVersion: dev.appVersion, lastSeen: dev.lastSeen, tracking: !!dev.tracking, playing: JSON.stringify(dev.playing || [])};
    if (!item) { await this.req('POST', '/wix-data/v2/items', {dataCollectionId: COL.devices, dataItem: {id, data: {...fields, revoked: false, connectedAt: Date.now()}}}); return {revoked: false}; }
    if (item.data && item.data.revoked) return {revoked: true};
    await this.req('PATCH', '/wix-data/v2/items/' + encodeURIComponent(id), {dataCollectionId: COL.devices, patch: {dataItemId: id, fieldModifications: Object.entries(fields).map(([fieldPath, value]) => ({fieldPath, action: 'SET_FIELD', setFieldOptions: {value}}))}});
    return {revoked: false};
  }
  async markDisconnected(device) {
    const id = 'dev-' + device;
    try { await this.req('PATCH', '/wix-data/v2/items/' + encodeURIComponent(id), {dataCollectionId: COL.devices, patch: {dataItemId: id, fieldModifications: [{fieldPath: 'revoked', action: 'SET_FIELD', setFieldOptions: {value: true}}, {fieldPath: 'playing', action: 'SET_FIELD', setFieldOptions: {value: '[]'}}]}}); } catch {}
  }
  // Games and limits, shared with the website. One item per member; the newest change wins.
  async getConfig() {
    const j = await this.req('POST', '/wix-data/v2/items/query', {dataCollectionId: COL.config, query: {sort: [{fieldName: 'updatedAt', order: 'DESC'}], paging: {limit: 1}}});
    const it = (j.dataItems || [])[0];
    if (!it) return null;
    let data = null; try { data = JSON.parse(it.data.data); } catch {}
    return {id: it.id, updatedAt: Number(it.data.updatedAt) || 0, data};
  }
  async putConfig(id, data, updatedAt) {
    const itemId = id || 'cfg-' + crypto.randomBytes(12).toString('hex'); // random: nobody can claim someone else's id
    await this.req('POST', '/wix-data/v2/items/save', {dataCollectionId: COL.config, dataItem: {id: itemId, data: {data: JSON.stringify(data), updatedAt}}});
    return itemId;
  }
  // Delete every session this member has stored online.
  async deleteAllSessions() {
    for (let guard = 0; guard < 200; guard++) {
      const j = await this.req('POST', '/wix-data/v2/items/query', {dataCollectionId: COL.sessions, query: {paging: {limit: 100}}});
      const ids = (j.dataItems || []).map(i => i.id);
      if (!ids.length) return;
      await this.req('POST', '/wix-data/v2/bulk/items/remove', {dataCollectionId: COL.sessions, dataItemIds: ids});
    }
  }
}

module.exports = {CLIENT_ID, API, SITE_URL, PORTS, COL, signIn, WixAuth, WixRemote, WixError};
