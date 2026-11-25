// Builds the Windows installer. On Windows this is plain electron-builder.
// On Linux, electron-builder normally runs the installer under Wine to extract its uninstaller; this uses
// electron-builder's own Wine-free extractor instead (the one it uses on macOS), so Linux builds don't need Wine.
// Usage: node scripts/build-win.js [nsis|dir] [--publish always|never]
'use strict';
const target = process.argv[2] || 'nsis';
const publish = process.argv.includes('--publish') ? process.argv[process.argv.indexOf('--publish') + 1] : 'never';

if (process.platform !== 'win32') {
  const mv = require('app-builder-lib/out/util/macosVersion');
  const orig = mv.isMacOsCatalina;
  // Only the uninstaller step (computeScriptAndSignUninstaller) gets "yes", which selects the Wine-free extractor.
  mv.isMacOsCatalina = () => /computeScriptAndSignUninstaller/.test(new Error().stack || '') ? true : orig();
}

require('electron-builder').build({win: [target], x64: true, publish})
  .then(files => { console.log('built:\n  ' + files.join('\n  ')); })
  .catch(e => { console.error(e); process.exit(1); });
