// Translations for what the desktop app shows outside its pages: notifications, the tray menu and the splash screen.
// Uses the same word lists as the website (web/lang/keys.js + web/lang/<code>.js) and the same rules:
// "#" stands for a number and "{s}" for any other text (translated on its own if it can be).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const LANGS = ['en', 'de', 'nl', 'ja', 'ko', 'zh'];

function load(lang, webDir) {
  if (!LANGS.includes(lang) || lang === 'en') return null;
  const got = {}, ctx = {LEVELUP_LANG: (l, text) => { got[l] = text; }};
  for (const f of ['keys', lang]) vm.runInNewContext(fs.readFileSync(path.join(webDir, 'lang', f + '.js'), 'utf8'), ctx, {timeout: 2000});
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('##'));
  const K = lines(got.keys), V = lines(got[lang]);
  if (!K.length || K.length !== V.length) return null; // an incomplete list: stay in English
  const dict = new Map(), pats = [];
  K.forEach((k, i) => {
    if (!k.includes('{s}')) { dict.set(k, V[i]); return; }
    const re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{s\}/g, '(.+?)').replace(/#/g, '(\\d+)') + '$');
    pats.push({re, v: V[i], n: k.replace(/\{s\}|#/g, '').length});
  });
  pats.sort((a, b) => b.n - a.n);
  return {dict, pats};
}
const fill = (v, vals) => { if (/\{\d+\}/.test(v)) return v.replace(/\{(\d+)\}/g, (_, i) => vals[+i] ?? ''); let i = 0; return v.replace(/\{s\}|#/g, () => vals[i++] ?? ''); };

// Returns t(text): the translation of text in lang, or text itself.
function translator(lang, webDir) {
  let d = null; try { d = load(lang, webDir); } catch { d = null; }
  if (!d) return s => s;
  const t = (s, depth = 0) => {
    const core = String(s).replace(/\s+/g, ' ').trim(); if (!core) return s;
    const v = d.dict.get(core.replace(/\d+/g, '#'));
    if (v !== undefined) return fill(v, core.match(/\d+/g) || []);
    if (depth < 3) for (const p of d.pats) { const m = p.re.exec(core); if (m) return fill(p.v, m.slice(1).map(x => /^\d+$/.test(x) ? x : t(x, depth + 1))); }
    return s;
  };
  return t;
}

module.exports = {translator, LANGS};
