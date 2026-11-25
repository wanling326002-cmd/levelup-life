// Shared setup for the browser test suites.
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

module.exports = {
  ROOT, WEB, SITE, OUT, FIX,
  OKEY: keys.OKEY, AKEY: keys.AKEY,
  FILE_URL: 'file://' + (process.platform === 'win32' ? '/' : '') + path.join(SITE, 'index.html').split(path.sep).join('/'),
  SERVE: path.join(__dirname, 'serve.js'),
  AXE: require.resolve('axe-core/axe.min.js'),
  copySite,
};
