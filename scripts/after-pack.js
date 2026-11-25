// electron-builder hook: sets the LevelUp Life icon and version details on the Windows .exe after packing.
// Works on any build machine (no Wine needed on Linux).
const fs = require('fs'), path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit'), PELibrary = await import('pe-library');
  const name = context.packager.appInfo.productFilename, version = context.packager.appInfo.version;
  const exe = path.join(context.appOutDir, `${name}.exe`);
  const pe = PELibrary.NtExecutable.from(fs.readFileSync(exe), {ignoreCert: true});
  const res = PELibrary.NtExecutableResource.from(pe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const [a, b, c] = version.split('.').map(n => parseInt(n, 10) || 0), l = {lang: 1033, codepage: 1200};
    vi.setStringValues(l, {ProductName: 'LevelUp Life', FileDescription: 'LevelUp Life', CompanyName: 'LevelUp Life', OriginalFilename: `${name}.exe`, InternalName: 'LevelUp Life', ProductVersion: version, FileVersion: version});
    vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033); vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log(`  • icon and version ${version} set on ${name}.exe`);
};
