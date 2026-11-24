// Sets the app icon + version info on the Windows .exe without Wine.
import * as ResEdit from 'resedit';
import * as PELibrary from 'pe-library';
import fs from 'node:fs';
const exe = 'dist/win-unpacked/LevelUp Life.exe';
const pe = PELibrary.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = PELibrary.NtExecutableResource.from(pe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync('build/icon.ico'));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  const l = { lang: 1033, codepage: 1200 };
  vi.setStringValues(l, { ProductName: 'LevelUp Life', FileDescription: 'LevelUp Life', CompanyName: 'LevelUp Life', OriginalFilename: 'LevelUp Life.exe', InternalName: 'LevelUp Life' });
  vi.setFileVersion(1, 0, 0, 0, 1033); vi.setProductVersion(1, 0, 0, 0, 1033); vi.outputToResourceEntries(res.entries);
}
res.outputResource(pe);
fs.writeFileSync(exe, Buffer.from(pe.generate()));
console.log('icon + version info set');
