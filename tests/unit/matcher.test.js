// Which processes count as which game (companion/matcher.js).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {matchProcesses, isExcluded} = require('../../companion/matcher');

test('launchers, updaters, crash reporters and anti-cheat are excluded', () => {
  for (const n of ['steam.exe', 'EpicGamesLauncher.exe', 'EasyAntiCheat_EOS.exe', 'BEService.exe', 'vgc.exe', 'RiotClientServices.exe',
    'UnityCrashHandler64.exe', 'CrashReportClient.exe', 'MyGameLauncher.exe', 'GameUpdater.exe', 'UE4PrereqSetup_x64.exe', 'Battle.net.exe', 'EADesktop.exe'])
    assert.ok(isExcluded(n), n);
  for (const n of ['FortniteClient-Win64-Shipping.exe', 'eldenring.exe', 'Minecraft.Windows.exe', 'RocketLeague.exe', 'cs2.exe', 'VALORANT-Win64-Shipping.exe'])
    assert.ok(!isExcluded(n), n);
});

test('a game can have several executable names, matched without caring about case', () => {
  const games = [{id: 'mc', name: 'Minecraft', exes: ['javaw.exe', 'Minecraft.Windows.exe']}];
  const m = matchProcesses(games, [{pid: 1, name: 'JAVAW.EXE', path: ''}, {pid: 2, name: 'minecraft.windows.exe', path: ''}]);
  assert.deepEqual(m.get('mc').pids, [1, 2]);
});

test('an executable the user picked counts even if its name looks like a helper', () => {
  const games = [{id: 'x', name: 'Old Game', paths: ['C:\\Games\\Old\\GameLauncher.exe']}];
  assert.ok(matchProcesses(games, [{pid: 3, name: 'GameLauncher.exe', path: 'C:\\Games\\Old\\GameLauncher.exe'}]).has('x'));
  assert.ok(!matchProcesses(games, [{pid: 4, name: 'GameLauncher.exe', path: 'C:\\Other\\GameLauncher.exe'}]).has('x'), 'same name elsewhere is a different program');
});

test('nested install folders go to the most specific game, and disabled games are ignored', () => {
  const games = [
    {id: 'outer', name: 'Collection', dirs: ['C:\\Games\\Collection']},
    {id: 'inner', name: 'Part 2', dirs: ['C:\\Games\\Collection\\Part2']},
    {id: 'off', name: 'Not tracked', dirs: ['C:\\Games\\Off'], enabled: false},
  ];
  const m = matchProcesses(games, [
    {pid: 1, name: 'part2.exe', path: 'C:\\Games\\Collection\\Part2\\bin\\part2.exe'},
    {pid: 2, name: 'part1.exe', path: 'C:\\Games\\Collection\\Part1\\part1.exe'},
    {pid: 3, name: 'off.exe', path: 'C:\\Games\\Off\\off.exe'},
  ]);
  assert.deepEqual([...m.keys()].sort(), ['inner', 'outer']);
});

test('a folder name that only starts the same is not a match', () => {
  const games = [{id: 'a', name: 'A', dirs: ['C:\\Games\\Halo']}];
  assert.ok(!matchProcesses(games, [{pid: 1, name: 'x.exe', path: 'C:\\Games\\Halo Infinite\\x.exe'}]).has('a'));
});
