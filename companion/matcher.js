// Decides which running processes belong to which tracked game.
// A game lists executable names and/or install folders. Launchers, updaters, crash reporters and anti-cheat
// programs never count as play, even when they sit inside a game's folder.
'use strict';
const path = require('path');

// Exact executable names (lower case) that are never a game.
const EXCLUDED_NAMES = new Set([
  // launchers and their helpers
  'steam.exe', 'steamwebhelper.exe', 'steamservice.exe', 'steamerrorreporter.exe', 'steamerrorreporter64.exe', 'gameoverlayui.exe',
  'epicgameslauncher.exe', 'epicwebhelper.exe', 'epiconlineservices.exe', 'epiconlineserviceshost.exe', 'epiconlineservicesuserhelper.exe',
  'eosoverlayrenderer-win64-shipping.exe', 'eosoverlayrenderer-win32-shipping.exe',
  'xboxpcapp.exe', 'xboxapp.exe', 'gamingservices.exe', 'gamingservicesnet.exe', 'gamebar.exe', 'gamebarftserver.exe', 'xboxpcappft.exe',
  'eadesktop.exe', 'eabackgroundservice.exe', 'ealocalhostsvc.exe', 'eaconnect_microsoft.exe', 'origin.exe', 'originwebhelperservice.exe', 'link2ea.exe',
  'upc.exe', 'ubisoftconnect.exe', 'uplaywebcore.exe', 'ubisoftgamelauncher.exe', 'ubisoftgamelauncher64.exe', 'uplayservice.exe',
  'battle.net.exe', 'agent.exe', 'blizzard error reporter.exe', 'blizzardbrowser.exe',
  'galaxyclient.exe', 'galaxyclient helper.exe', 'galaxycommunication.exe', 'gog galaxy notifications renderer.exe',
  'riotclientservices.exe', 'riotclientux.exe', 'riotclientuxrender.exe', 'riotclientcrashhandler.exe',
  'rockstarservice.exe', 'launcherpatcher.exe', 'socialclubhelper.exe', 'playgtav.exe',
  'itch.exe', 'amazongames.exe', 'amazon games ui.exe', 'playnite.desktopapp.exe', 'playnite.fullscreenapp.exe',
  'discord.exe', 'overwolf.exe', 'medal.exe', 'obs64.exe', 'nvcontainer.exe', 'nvidia share.exe', 'radeonsoftware.exe',
  // anti-cheat
  'easyanticheat.exe', 'easyanticheat_eos.exe', 'easyanticheat_eos_setup.exe', 'easyanticheat_setup.exe',
  'beservice.exe', 'beservice_x64.exe', 'battleye.exe', 'vgc.exe', 'vgtray.exe', 'faceit.exe', 'faceitservice.exe',
  'eaanticheat.gameservice.exe', 'eaanticheat.installer.exe', 'mhyprot.exe', 'xigncode.exe', 'nprotect.exe', 'gameguard.exe',
  // crash reporters, installers and runtimes
  'unitycrashhandler64.exe', 'unitycrashhandler32.exe', 'crashreportclient.exe', 'crashpad_handler.exe', 'crashsender.exe',
  'ue4prereqsetup_x64.exe', 'ueprereqsetup_x64.exe', 'dxsetup.exe', 'dotnetfx.exe', 'vcredist_x64.exe', 'vcredist_x86.exe',
  'vc_redist.x64.exe', 'vc_redist.x86.exe', 'unins000.exe', 'unins001.exe', 'uninstall.exe', 'setup.exe', 'installer.exe',
  'quicksfv.exe', 'cefprocess.exe', 'cefsharp.browsersubprocess.exe', 'qtwebengineprocess.exe', 'zfgamebrowser.exe',
]);
// Words in a name that mark a helper rather than the game itself.
const EXCLUDED_PATTERN = /(crash|report(er)?|updat|patcher|anti-?cheat|redist|prereq|uninst|setup|install|launcher|bootstrap|helper|webhelper|overlay|service)/i;

const norm = p => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
const exeOf = p => path.win32.basename(String(p || '')).toLowerCase();

function isExcluded(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return true;
  return EXCLUDED_NAMES.has(n) || EXCLUDED_PATTERN.test(n.replace(/\.exe$/, ''));
}

// games: [{id, name, exes: ['game.exe'], dirs: ['C:\\Games\\X'], enabled}]
// processes: [{pid, name, path}] (path may be '' when Windows won't share it)
// Returns Map(gameId -> {game, pids: [..]}).
function matchProcesses(games, processes) {
  const active = games.filter(g => g.enabled !== false && !g.deleted); // removed games are kept only as markers
  const byExe = new Map(), dirs = [];
  for (const g of active) {
    for (const e of g.exes || []) byExe.set(String(e).toLowerCase(), g); // listed names count even if they look like helpers: the user chose them
    for (const d of g.dirs || []) if (d) dirs.push({dir: norm(d) + '\\', game: g});
  }
  dirs.sort((a, b) => b.dir.length - a.dir.length); // the deepest folder wins when folders are nested
  const out = new Map();
  for (const p of processes) {
    const name = String(p.name || exeOf(p.path)).toLowerCase(), full = norm(p.path);
    let game = null;
    if (full) {
      const exact = active.find(g => (g.paths || []).some(x => norm(x) === full)); // a specific .exe the user picked
      if (exact) game = exact;
    }
    if (!game && byExe.has(name)) game = byExe.get(name);
    if (!game && full && !isExcluded(name)) { const hit = dirs.find(d => full.startsWith(d.dir)); if (hit) game = hit.game; }
    if (!game) continue;
    const m = out.get(game.id) || {game, pids: []};
    m.pids.push(p.pid); out.set(game.id, m);
  }
  return out;
}

module.exports = {EXCLUDED_NAMES, EXCLUDED_PATTERN, isExcluded, matchProcesses, norm, exeOf};
