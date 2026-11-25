// A small fake of the Wix endpoints the desktop app uses, served over HTTP on 127.0.0.1 for end-to-end tests.
'use strict';
const http = require('http');

function startMockWix() {
  const state = {calls: [], sessions: new Map(), devices: new Map(), config: new Map(), codes: 0};
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null, path = req.url, auth = req.headers.authorization || '';
      state.calls.push({method: req.method, path, body});
      const send = (status, obj) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(obj)); };
      if (path === '/oauth2/token') {
        if (body.grantType === 'anonymous') return send(200, {access_token: 'anon', expires_in: 3600});
        if (body.grantType === 'authorization_code') return body.code === 'TESTCODE' && body.codeVerifier ? send(200, {access_token: 'member', refresh_token: 'rt-1', expires_in: 14400}) : send(400, {error: 'invalid_grant'});
        if (body.grantType === 'refresh_token') return body.refreshToken === 'rt-1' ? send(200, {access_token: 'member', refresh_token: 'rt-1', expires_in: 14400}) : send(400, {error: 'invalid_grant'});
      }
      if (path === '/_api/redirects-api/v1/redirect-session') {
        const a = body.auth.authRequest;
        return send(200, {redirectSession: {id: 'rs', fullUrl: `https://login.example/authorize?state=${a.state}&redirectUri=${encodeURIComponent(a.redirectUri)}`}});
      }
      if (path.startsWith('/members/v1/members/my')) return send(200, {member: {id: 'member-1', loginEmail: 'player@example.com', profile: {nickname: 'Player1'}}});
      if (auth !== 'member') return send(403, {message: 'members only'});
      const col = {GameSessions: state.sessions, CompanionDevices: state.devices, CompanionConfig: state.config}[body && body.dataCollectionId];
      if (!col) return send(404, {});
      if (path === '/wix-data/v2/bulk/items/save') return send(200, {results: body.dataItems.map((d, i) => { col.set(d.id, {id: d.id, data: d.data}); return {itemMetadata: {id: d.id, originalIndex: i, success: true}}; })});
      if (path === '/wix-data/v2/items/save') { col.set(body.dataItem.id, {id: body.dataItem.id, data: body.dataItem.data}); return send(200, {dataItem: body.dataItem}); }
      if (path === '/wix-data/v2/items' && req.method === 'POST') { if (col.has(body.dataItem.id)) return send(409, {}); col.set(body.dataItem.id, {id: body.dataItem.id, data: body.dataItem.data}); return send(200, {dataItem: body.dataItem}); }
      if (path === '/wix-data/v2/items/query') {
        let all = [...col.values()]; const f = body.query.filter || {};
        if (f._id) all = all.filter(i => i.id === f._id);
        if (body.query.sort) all.sort((a, b) => (b.data.updatedAt || 0) - (a.data.updatedAt || 0));
        return send(200, {dataItems: all.slice(0, (body.query.paging || {}).limit || 50)});
      }
      if (req.method === 'PATCH' && path.startsWith('/wix-data/v2/items/')) {
        const it = col.get(body.patch.dataItemId); if (!it) return send(404, {});
        for (const m of body.patch.fieldModifications) it.data[m.fieldPath] = m.setFieldOptions.value;
        return send(200, {dataItem: it});
      }
      if (path === '/wix-data/v2/bulk/items/remove') { for (const id of body.dataItemIds) col.delete(id); return send(200, {results: []}); }
      send(404, {message: 'not mocked'});
    });
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({url: `http://127.0.0.1:${srv.address().port}`, state, close: () => srv.close()})));
}

module.exports = {startMockWix};
