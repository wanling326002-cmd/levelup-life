// Desktop-side translations (companion/i18n.js): notifications, tray and splash in every language, words in the right order.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const {translator} = require('../../companion/i18n');
const core = require('../../web/companion-core.js');
const WEB = path.join(__dirname, '..', '..', 'web');

// Every text the desktop app shows outside its pages (main.js, companion/service.js, companion-core warnings).
const DESKTOP_TEXT = [
  'Starting…', 'Checking for updates…', 'Downloading update 1.2.0…', 'Downloading update… 42%', 'Installing update…', 'Start without updating', 'Level up your day', 'Version 1.2.0',
  'Tracking paused', 'Tracking on · {s}', 'Tracking on · no game running', 'Connected to your account', 'Offline: will sync later', 'Sign-in expired: connect again', 'Not connected (this PC only)',
  'Today: {s}', 'Open LevelUp Life', 'Pause tracking', 'Resume tracking', 'Launch at Windows startup', 'Restart to update', 'Quit (stops tracking)',
  "Choose the game's program (.exe)", 'Programs', 'Add another program for {s}',
  'Disconnected', 'This PC was disconnected from your account on the website. Tracking continues on this PC only.',
  'Still tracking in the tray', 'Tracking is paused. Right-click the LevelUp Life tray icon to resume or quit.', 'LevelUp Life keeps tracking your games. Right-click the tray icon to pause or quit.',
  'LevelUp Life is running', 'Game tracking is paused. Open the tray icon to resume.', 'Game tracking is on. You can find LevelUp Life in the system tray.',
  'Update ready', 'A new version of LevelUp Life will be installed the next time it starts. Use "Restart to update" in the tray to do it now.',
];
const warnings = [core.warningText(30, 'ELDEN RING', false), core.warningText(10, 'gaming', true), core.warningText(0, 'ELDEN RING', false), core.warningText(0, 'gaming', true)].flatMap(w => [w.title, w.body]);

for (const lang of ['de', 'nl', 'ja', 'ko', 'zh']) {
  test(`${lang}: every desktop notification, tray and splash text is translated`, () => {
    const t = translator(lang, WEB);
    const same = {de: ['Version 1.2.0']}[lang] || []; // words that really are the same in that language
    const missing = [...DESKTOP_TEXT, ...warnings].filter(s => t(s) === s && !same.includes(s));
    assert.deepEqual(missing, []);
  });
}

test('the game name and the minutes land in the right place in every language', () => {
  for (const lang of ['de', 'nl', 'ja', 'ko', 'zh']) {
    const out = translator(lang, WEB)('10 minutes of ELDEN RING left today.');
    assert.ok(out.includes('ELDEN RING') && out.includes('10'), lang + ': ' + out);
    assert.ok(!/ELDEN RING\D*分|10は/.test(out) || lang !== 'ja', lang + ': ' + out);
  }
  assert.equal(translator('ja', WEB)('10 minutes of ELDEN RING left today.'), '今日のELDEN RINGは残り10分です。');
  assert.equal(translator('zh', WEB)('10 minutes of ELDEN RING left today.'), '今天的 ELDEN RING 还剩 10 分钟。');
});

test('English and unknown languages leave text as it is', () => {
  assert.equal(translator('en', WEB)('Daily limit reached'), 'Daily limit reached');
  assert.equal(translator('xx', WEB)('Daily limit reached'), 'Daily limit reached');
});
