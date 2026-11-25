// Launcher scanners against a fake disk and a fake registry (companion/scanners.js).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../../companion/scanners');

// A tiny in-memory Windows disk: paths are case-insensitive, backslashes only.
function fakeFs(files) {
  const norm = p => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const map = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
  const dirs = new Map();
  for (const k of Object.keys(files)) { const parts = k.replace(/\//g, '\\').split('\\'); for (let i = 1; i < parts.length; i++) { const d = norm(parts.slice(0, i).join('\\')); if (!dirs.has(d)) dirs.set(d, new Set()); dirs.get(d).add(parts[i]); } }
  const enoent = p => Object.assign(new Error('ENOENT ' + p), {code: 'ENOENT'});
  return {promises: {
    async readFile(p, enc) { const v = map.get(norm(p)); if (v === undefined) throw enoent(p); return enc ? String(v) : Buffer.isBuffer(v) ? v : Buffer.from(String(v)); },
    async readdir(p) { const d = dirs.get(norm(p)); if (!d) throw enoent(p); return [...d]; },
    async access(p) { if (!map.has(norm(p)) && !dirs.has(norm(p))) throw enoent(p); },
  }};
}
const regText = entries => Object.entries(entries).map(([key, vals]) => key + '\r\n' + Object.entries(vals).map(([n, v]) => `    ${n}    REG_SZ    ${v}`).join('\r\n')).join('\r\n\r\n');

const gamingRoot = rel => Buffer.concat([Buffer.from('RGBX\x01\x00\x00\x00', 'latin1'), Buffer.from(rel + '\0', 'utf16le')]);

const FILES = {
  'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf': `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"D:\\\\SteamLibrary"\n\t\t"apps"\t{ "1245620" "123" }\n\t}\n}`,
  'C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_228980.acf': `"AppState" { "appid" "228980" "name" "Steamworks Common Redistributables" "installdir" "Steamworks Shared" }`,
  'C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_730.acf': `"AppState"\n{\n\t"appid"\t\t"730"\n\t"name"\t\t"Counter-Strike 2"\n\t"installdir"\t\t"Counter-Strike Global Offensive"\n}`,
  'D:\\SteamLibrary\\steamapps\\appmanifest_1245620.acf': `"AppState" { "appid" "1245620" "name" "ELDEN RING" "installdir" "ELDEN RING" }`,
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\A1.item': JSON.stringify({AppName: 'Fortnite', DisplayName: 'Fortnite', InstallLocation: 'C:\\Program Files\\Epic Games\\Fortnite', LaunchExecutable: 'FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe', AppCategories: ['public', 'games', 'applications']}),
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\B2.item': JSON.stringify({AppName: 'UE_5.3', DisplayName: 'Unreal Engine 5.3', InstallLocation: 'C:\\Program Files\\Epic Games\\UE_5.3', LaunchExecutable: 'Engine/Binaries/Win64/UnrealEditor.exe', AppCategories: ['engines']}),
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\C3.item': JSON.stringify({AppName: 'Sugar', DisplayName: 'Rocket League', InstallLocation: 'D:\\Epic\\rocketleague', LaunchExecutable: 'Binaries/Win64/RocketLeague.exe', AppCategories: ['games']}),
  'E:\\.GamingRoot': gamingRoot('Games\\Xbox'),
  'E:\\Games\\Xbox\\Forza Horizon 5\\Content\\MicrosoftGame.config': `<?xml version="1.0"?><Game><ExecutableList><Executable Name="ForzaHorizon5.exe" Id="Game"/></ExecutableList><ShellVisuals DefaultDisplayName="Forza Horizon 5"/></Game>`,
  'C:\\XboxGames\\Minecraft Launcher\\Content\\MicrosoftGame.config': `<Game><ExecutableList><Executable Name="MinecraftLauncher.exe"/></ExecutableList><ShellVisuals DefaultDisplayName="ms-resource:AppName"/></Game>`,
};
const REG = {
  'HKCU\\Software\\Valve\\Steam': regText({'HKEY_CURRENT_USER\\Software\\Valve\\Steam': {SteamPath: 'c:/program files (x86)/steam'}}),
  'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games': regText({'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1207664663': {gameName: 'The Witcher 3: Wild Hunt', path: 'C:\\GOG Games\\The Witcher 3 Wild Hunt GOTY', exe: 'C:\\GOG Games\\The Witcher 3 Wild Hunt GOTY\\bin\\x64\\witcher3.exe', gameID: '1207664663'}}),
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall': regText({
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Uplay Install 5059': {DisplayName: "Assassin's Creed Valhalla", Publisher: 'Ubisoft', InstallLocation: 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Assassins Creed Valhalla', DisplayIcon: 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Assassins Creed Valhalla\\ACValhalla.exe'},
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Uplay': {DisplayName: 'Ubisoft Connect', Publisher: 'Ubisoft', InstallLocation: 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher'},
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Riot Game valorant.live': {DisplayName: 'VALORANT', Publisher: 'Riot Games, Inc', InstallLocation: 'C:\\Riot Games\\VALORANT\\live', DisplayIcon: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe'},
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Notepad++': {DisplayName: 'Notepad++', Publisher: 'Notepad++ Team', InstallLocation: 'C:\\Program Files\\Notepad++'},
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 730': {DisplayName: 'Counter-Strike 2', Publisher: 'Valve', InstallLocation: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive'},
  }),
};
const env = () => ({fs: fakeFs(FILES), readReg: async k => { if (REG[k] === undefined) throw new Error('not found'); return REG[k]; }, drives: ['C:', 'D:', 'E:'], programData: 'C:\\ProgramData', programFilesX86: 'C:\\Program Files (x86)'});

test('Steam: every library folder is read; tools and redistributables are skipped', async () => {
  const g = await S.scanSteam(env());
  assert.deepEqual(g.map(x => x.name).sort(), ['Counter-Strike 2', 'ELDEN RING']);
  assert.equal(g.find(x => x.id === 'steam-1245620').dirs[0], 'D:\\SteamLibrary\\steamapps\\common\\ELDEN RING');
});

test('Epic: games only, with the launch executable when the manifest names it', async () => {
  const g = await S.scanEpic(env());
  assert.deepEqual(g.map(x => x.name).sort(), ['Fortnite', 'Rocket League']);
  assert.deepEqual(g.find(x => x.name === 'Fortnite').exes, ['fortniteclient-win64-shipping.exe']);
});

test('Xbox / Game Pass: XboxGames folders, including custom ones from .GamingRoot; launcher exes are not used', async () => {
  const g = await S.scanXbox(env());
  const fh = g.find(x => x.name === 'Forza Horizon 5');
  assert.ok(fh); assert.deepEqual(fh.exes, ['forzahorizon5.exe']); assert.equal(fh.dirs[0], 'E:\\Games\\Xbox\\Forza Horizon 5\\Content');
  const mc = g.find(x => x.id === 'xbox-minecraft-launcher');
  assert.equal(mc.name, 'Minecraft Launcher', 'a display name that is only a resource reference falls back to the folder name');
  assert.deepEqual(mc.exes, [], 'MinecraftLauncher.exe is a launcher');
});

test('GOG: registry entries', async () => {
  const g = await S.scanGog(env());
  assert.equal(g[0].name, 'The Witcher 3: Wild Hunt'); assert.deepEqual(g[0].exes, ['witcher3.exe']);
});

test('publisher installs: games yes, launchers and unrelated programs no', async () => {
  const g = await S.scanUninstall(env());
  assert.deepEqual(g.map(x => x.name).sort(), ["Assassin's Creed Valhalla", 'VALORANT']);
  assert.deepEqual(g.find(x => x.name === 'VALORANT').exes, [], 'the icon points at the Riot Client, which is not the game');
  assert.deepEqual(g.find(x => x.source === 'ubisoft').exes, ['acvalhalla.exe']);
});

test('scanAll combines sources, removes duplicates and survives missing launchers', async () => {
  const e = env(); e.readReg = async () => { throw new Error('reg.exe not available'); };
  const r = await S.scanAll(e);
  assert.ok(r.games.length >= 5);
  const full = await S.scanAll(env());
  assert.equal(full.games.filter(x => x.name === 'Counter-Strike 2').length, 1, 'Steam and the uninstall list found the same folder once');
});

test('VDF and reg query parsers handle the real formats', () => {
  const v = S.parseVdf('"a" { "b" "c\\\\d" "e" { "f" "g" } }');
  assert.deepEqual(v, {a: {b: 'c\\d', e: {f: 'g'}}});
  const r = S.parseRegQuery('\r\nHKEY_CURRENT_USER\\Software\\X\r\n    (Default)    REG_SZ    \r\n    Path    REG_SZ    C:\\A B\\c\r\n    N    REG_DWORD    0x1\r\n');
  assert.deepEqual(r['HKEY_CURRENT_USER\\Software\\X'], {'': '', Path: 'C:\\A B\\c', N: '0x1'});
});
