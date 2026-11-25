// Turns i18n/keys.txt and i18n/<lang>.txt into web/lang/*.js (run: node i18n/build.js)
const fs = require('fs'), path = require('path'), dir = __dirname, out = path.join(dir, '..', 'web', 'lang');
fs.mkdirSync(out, {recursive:true});
for (const name of ['keys', 'de', 'nl', 'ja', 'ko', 'zh']) {
  const text = fs.readFileSync(path.join(dir, name + '.txt'), 'utf8').replace(/\n$/, '');
  if (/[`\\]|\$\{/.test(text)) throw new Error(name + ': contains a backtick, backslash or ${');
  fs.writeFileSync(path.join(out, name + '.js'), `/* LevelUp Life word list (${name}): one phrase per line, in the same order as keys.js */\nLEVELUP_LANG('${name}', \`\n${text}\n\`);\n`);
}
console.log('built', fs.readdirSync(out).join(' '));
