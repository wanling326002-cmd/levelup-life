// Shared setup for the browser test suites.
/* global document */
// Builds a throwaway copy of web/ where the owner and admin keys are replaced by freshly generated TEST keys,
// so the suites never need (or contain) the real keys. Each run gets its own copy and output folder.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const RUN = process.env.LEVELUP_TEST_DIR || path.join(os.tmpdir(), 'levelup-tests-' + process.pid);
const SITE = path.join(RUN, 'site');
const OUT = path.join(RUN, 'out') + path.sep; // screenshots and scratch files
const FIX = path.join(__dirname, 'fixtures') + path.sep;

const normKey = k => String(k).toUpperCase().replace(/[^A-Z0-9]/g, '');
const pbkdf2Hex = (secret, saltBytes) => crypto.pbkdf2Sync(Buffer.from(secret, 'utf8'), saltBytes, 200000, 32, 'sha256').toString('hex');
const sha256Hex = s => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const b64 = buf => Buffer.from(buf).toString('base64');

// A role key: the check hash the app compares against, a signing key pair, and the private part sealed with the key.
function makeRole(key, saltHex, signSalt) {
  const n = normKey(key);
  const check = sha256Hex(pbkdf2Hex(n, Buffer.from(saltHex, 'hex')));
  const {privateKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'P-256'});
  const jwk = privateKey.export({format: 'jwk'});
  const aesKey = crypto.pbkdf2Sync(Buffer.from(n, 'utf8'), Buffer.from(signSalt, 'utf8'), 200000, 32, 'sha256');
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ct = Buffer.concat([c.update(Buffer.from(jwk.d, 'utf8')), c.final(), c.getAuthTag()]); // WebCrypto layout: ciphertext then tag
  return {check, pub: {kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y}, sealed: {iv: b64(iv), ct: b64(ct)}};
}

function replaceConst(src, name, value) {
  const re = new RegExp(`^const ${name} = .*?;( *//.*)?$`, 'm');
  if (!re.test(src)) throw new Error(`harness: constant ${name} not found in app.js`);
  return src.replace(re, (m, comment) => `const ${name} = ${value};${comment || ''}`);
}

// A suite run on its own uses a folder named after its process id. Ids get reused, so a folder left by an earlier
// run could hold an old copy of the site: start such a run from a clean folder (run.js gives each run a fresh one).
if (!process.env.LEVELUP_TEST_DIR && fs.existsSync(RUN) && !process.env.LEVELUP_KEEP_RUN) fs.rmSync(RUN, {recursive: true, force: true});
function build() {
  const ready = path.join(RUN, 'keys.json');
  if (fs.existsSync(ready)) return JSON.parse(fs.readFileSync(ready, 'utf8'));
  fs.rmSync(SITE, {recursive: true, force: true});
  fs.mkdirSync(OUT + 'shots2', {recursive: true});
  fs.cpSync(WEB, SITE, {recursive: true});
  const OKEY = 'TESTOWNER-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const AKEY = 'TESTADMIN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const src = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8');
  const salt = name => (src.match(new RegExp(`^const ${name} = '([0-9a-f]+)';`, 'm')) || [])[1];
  const own = makeRole(OKEY, salt('OWNER_SALT'), 'levelup-sign-v1');
  const adm = makeRole(AKEY, salt('ADMIN_SALT'), 'levelup-admin-sign-v1');
  let out = src;
  out = replaceConst(out, 'OWNER_CHECK', `'${own.check}'`);
  out = replaceConst(out, 'ADMIN_CHECK', `'${adm.check}'`);
  out = replaceConst(out, 'OWNER_PUB', JSON.stringify(own.pub));
  out = replaceConst(out, 'ADMIN_PUB', JSON.stringify(adm.pub));
  out = replaceConst(out, 'OWNER_SIGN', JSON.stringify(own.sealed));
  out = replaceConst(out, 'ADMIN_SIGN', JSON.stringify(adm.sealed));
  fs.writeFileSync(path.join(SITE, 'app.js'), out);
  const keys = {OKEY, AKEY};
  fs.writeFileSync(ready, JSON.stringify(keys));
  return keys;
}

const keys = build();
// A fresh copy of the patched site, for suites that change files or serve from their own folder.
function copySite(dest) { fs.rmSync(dest, {recursive: true, force: true}); fs.cpSync(SITE, dest, {recursive: true}); }

// The suites open the site over http://127.0.0.1 (a tiny server inside this process), not as file:// pages:
// on a busy machine Chrome can drop localStorage writes on a file:// page that reloads right away, which made
// suites that save, reload and read back fail now and then. The offline helper (service worker) is an empty one here,
// so these pages behave exactly like the file:// pages did (nothing is cached); the offline suites use their own server for it.
function startServer() {
  const http = require('http'), {execFileSync} = require('child_process');
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();})"], {encoding: 'utf8'}));
  const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'};
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(SITE, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(SITE)) { res.writeHead(404); return res.end(); }
    if (/levelup-sw\.js$/.test(f)) { res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-store'}); return res.end('// (test copy: an offline helper that does nothing)\n'); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, {'Content-Type': 'text/html'}); return res.end('<h1>404</h1>'); }
      res.writeHead(200, {'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store'}); res.end(data);
    });
  });
  srv.listen(port, '127.0.0.1'); srv.unref(); // (unref: the server never keeps a finished suite running)
  return `http://127.0.0.1:${port}/app.html`;
}
const PAGE_URL = startServer();

// Creating an account or logging in hashes the password (150,000 rounds), which can take seconds on a busy machine.
// The forms grey out their button while they work, so wait for that instead of guessing a fixed time.
const authDone = page => page.waitForFunction(() => ![...document /* (runs in the page) */.querySelectorAll('#signupForm .btn.primary, #loginForm .btn.primary')].some(b => b.disabled),
  null, {timeout: 30000, polling: 50}).catch(() => {});
// A reload always opens Home (see app.js). Tests that check that something survives a reload on a certain tab
// use this: reload, then go back to the tab the page was on.
const reloadKeep = async page => { const h = await page.evaluate(() => globalThis.location.hash); await page.reload(); // (these run in the page)
  if (h && h !== '#home') await page.evaluate(x => { globalThis.location.hash = x; }, h); };

module.exports = {
  ROOT, WEB, SITE, OUT, FIX,
  OKEY: keys.OKEY, AKEY: keys.AKEY,
  FILE_URL: PAGE_URL, // (kept under its old name: every suite uses it) the site's page over http://127.0.0.1
  REAL_FILE_URL: 'file://' + (process.platform === 'win32' ? '/' : '') + path.join(SITE, 'app.html').split(path.sep).join('/'),
  SERVE: path.join(__dirname, 'serve.js'),
  AXE: require.resolve('axe-core/axe.min.js'),
  copySite, authDone, reloadKeep,
};
