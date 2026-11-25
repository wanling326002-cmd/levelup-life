/* LevelUp Life — local-first life hub. All data lives in localStorage on this device. */
(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pad2 = n => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; // YYYY-MM-DD, local time
const dayOffset = n => { const d = new Date(); d.setDate(d.getDate() - n); return today(d); };
const fmtMin = m => m >= 60 ? `${Math.floor(m/60)}h ${m%60 ? (m%60)+'m' : ''}`.trim() : `${m}m`;
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 65% 55%)`; };
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const ytId = u => { try { const x = new URL(u); if (x.hostname.includes('youtu.be')) return x.pathname.slice(1, 12);
  if (x.hostname.includes('youtube.com')) return x.searchParams.get('v') || (x.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/) || [])[2] || ''; } catch {} return ''; };

/* ---------- languages ----------
   The app is written in English. For another language, index.html first loads lang/keys.js (the English phrases)
   and lang/<code>.js (the same phrases translated, line by line), and every text on screen is swapped as it appears.
   In a phrase, "#" stands for a number and "{s}" for any other text (a name, or a phrase that is translated on its own).
   Anything inside an element with translate="no" (chat messages, bios, the Privacy Terms) stays as it is. */
const LANGS = {en:'English', de:'Deutsch', nl:'Nederlands', ja:'日本語', ko:'한국어', zh:'中文（简体）'};
const LANG = (() => { try { const l = localStorage.getItem('levelup-lang'); return l && Object.hasOwn(LANGS, l) ? l : 'en'; } catch { return 'en'; } })();
const I18 = {dict:null, pats:[], done:new WeakMap(), attr:new WeakMap()};
const I18_ATTRS = ['placeholder', 'title', 'aria-label'];
const i18Fill = (v, vals) => { if (/\{\d+\}/.test(v)) return v.replace(/\{(\d+)\}/g, (_, i) => vals[+i] ?? ''); let i = 0; return v.replace(/\{s\}|#/g, () => vals[i++] ?? ''); };
function tr(s, depth = 0) {
  if (!I18.dict) return s;
  const core = s.replace(/\s+/g, ' ').trim(); if (!core || !/\p{L}/u.test(core)) return s;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], v = I18.dict.get(core.replace(/\d+/g, '#'));
  if (v !== undefined) return lead + i18Fill(v, core.match(/\d+/g) || []) + trail;
  if (depth < 3) for (const p of I18.pats) { const m = p.re.exec(core); if (m) return lead + i18Fill(p.v, m.slice(1).map(x => /^\d+$/.test(x) ? x : tr(x, depth + 1))) + trail; }
  return s;
}
const i18Skip = el => !!(el && el.closest('[translate="no"], script, style, textarea, code'));
function trText(n) {
  const v = n.nodeValue; if (I18.done.get(n) === v || i18Skip(n.parentElement)) return;
  const o = tr(v); if (o !== v) n.nodeValue = o; I18.done.set(n, n.nodeValue);
}
function trAttrs(el) {
  if (!el.getAttribute) return;
  for (const a of I18_ATTRS) { const v = el.getAttribute(a); if (!v) continue; const d = I18.attr.get(el) || {}; if (d[a] === v) continue;
    const o = tr(v); if (o !== v) el.setAttribute(a, o); d[a] = o; I18.attr.set(el, d); }
}
function trTree(root) {
  if (root.nodeType === 3) return trText(root);
  if (root.nodeType !== 1) return;
  if (root.tagName === 'TEXTAREA' && !i18Skip(root.parentElement)) return trAttrs(root); // its placeholder, not what was typed
  if (i18Skip(root)) return;
  trAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {acceptNode:n => { if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT; if (n.tagName === 'TEXTAREA') { trAttrs(n); return NodeFilter.FILTER_REJECT; }
    return n.getAttribute('translate') === 'no' || /^(SCRIPT|STYLE|CODE)$/.test(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }});
  let n; while ((n = w.nextNode())) n.nodeType === 3 ? trText(n) : trAttrs(n);
}
(function i18nSetup() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-Hans' : LANG;
  const src = window.LEVELUP_I18N || {}, keys = src.keys, vals = src[LANG];
  if (LANG === 'en' || typeof keys !== 'string' || typeof vals !== 'string') return;
  const lines = s => s.split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('##'));
  const K = lines(keys), V = lines(vals); if (K.length !== V.length) return; // an incomplete download: stay in English
  I18.dict = new Map();
  K.forEach((k, i) => {
    if (!k.includes('{s}')) { I18.dict.set(k, V[i]); return; }
    const re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{s\}/g, '(.+?)').replace(/#/g, '(\\d+)') + '$');
    I18.pats.push({re, v:V[i], n:k.replace(/\{s\}|#/g, '').length});
  });
  I18.pats.sort((a, b) => b.n - a.n); // the most specific phrase wins
  trTree(document.documentElement);
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') trText(m.target); else if (m.type === 'attributes') trAttrs(m.target); else m.addedNodes.forEach(trTree); } })
    .observe(document.documentElement, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:I18_ATTRS});
})();

/* ---------- icons ---------- */
const P = {
  home:'<rect x="3" y="3" width="7" height="7" rx="3.5"/><rect x="14" y="3" width="7" height="7" rx="3.5"/><rect x="3" y="14" width="7" height="7" rx="3.5"/><rect x="14" y="14" width="7" height="7" rx="3.5"/>',
  study:'<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  focus:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  gaming:'<rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r=".6"/><circle cx="18" cy="13.5" r=".6"/>',
  series:'<rect x="3" y="5" width="18" height="13" rx="3"/><path d="M8 21h8M10 9.5v5l4-2.5z"/>',
  youtube:'<rect x="2" y="5" width="20" height="14" rx="5"/><path d="m10 9 5 3-5 3z"/>',
  balance:'<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
  impact:'<path d="M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11z"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
  privacy:'<rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  play:'<path d="m8 5 11 7-11 7z"/>', pause:'<path d="M8 5v14M16 5v14"/>', reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  star:'<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  players:'<path d="M8 21h8M12 16v5M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  userplus:'<circle cx="9" cy="8" r="4"/><path d="M2 21c1.2-3.6 3.8-6 7-6s5.8 2.4 7 6M19 8v6M16 11h6"/>',
  check:'<path d="m5 12 5 5L20 7"/>', x:'<path d="M6 6l12 12M18 6 6 18"/>',
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01"/>',
  crown:'<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>', badge:'<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
  messages:'<path d="M4 6h16v10H8l-4 4z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>', back:'<path d="M15 5l-7 7 7 7"/>',
  bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>', upload:'<path d="M12 21V9m-5 5 5-5 5 5M4 3h16"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

/* ---------- routes ---------- */
const ROUTES = [
  {id:'home', name:'Home', sub:'Your day at a glance.', key:'1', main:true},
  {id:'study', name:'Study Path', short:'Study', sub:'Learn Web Design & App Development, step by step.', key:'2', main:true},
  {id:'focus', name:'Focus', sub:'Pomodoro timer — deep work, then a real break.', key:'3', main:true},
  {id:'gaming', name:'Gaming', sub:'Track sessions, your backlog and healthy breaks.', key:'4', main:true},
  {id:'series', name:'Series', sub:'Never forget which episode you are on.', key:'5', main:true},
  {id:'youtube', name:'YouTube', sub:'Save videos to learn from — or just enjoy.', key:'6', main:true},
  {id:'balance', name:'Balance', sub:'Play, watch and learn — see how your week adds up.', key:'7', main:true},
  {id:'impact', name:'Help the World', short:'Impact', sub:'Small daily quests that make things better.', key:'8', main:true},
  {id:'chat', name:'Chat', sub:'Talk with everyone who has your invite code.', main:true},
  {id:'messages', name:'Messages', sub:'Private, end-to-end encrypted chats with your friends.', main:true},
  {id:'players', name:'Players', sub:'Leaderboard, friends and player profiles.', main:true},
  {id:'badges', name:'Badges', sub:'Your level, rank and achievements.', key:'9'},
  {id:'options', name:'Settings', sub:'Your account, preferences and data.', key:'0'},
  {id:'help', name:'Help', sub:'How to use LevelUp Life, and keyboard shortcuts.'},
  {id:'privacy', name:'Privacy Terms', sub:'Short version: your data stays on your device.'},
];
const iconFor = id => icon(id === 'options' ? 'settings' : id === 'badges' ? 'badge' : id);

/* ---------- learning content ---------- */
const TRACKS = {
  web: {name:'Web Design', modules:[
    {t:'HTML foundations', l:[['How the web works','https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Web_standards/How_the_web_works'],['HTML elements & structure','https://web.dev/learn/html'],['Forms & semantic HTML','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content'],['Build: a personal profile page','https://www.freecodecamp.org/learn']]},
    {t:'CSS & layout', l:[['Selectors, box model, colours','https://web.dev/learn/css'],['Flexbox','https://css-tricks.com/snippets/css/a-guide-to-flexbox/'],['Grid','https://css-tricks.com/snippets/css/complete-guide-grid/'],['Responsive design','https://web.dev/learn/design'],['Build: recreate a dashboard like this app','https://developer.mozilla.org/en-US/docs/Web/CSS']]},
    {t:'Design principles', l:[['Typography & spacing','https://m3.material.io/styles/typography/overview'],['Colour & contrast','https://webaim.org/resources/contrastchecker/'],['Laws of UX','https://lawsofux.com/'],['Figma basics','https://help.figma.com/hc/en-us']]},
    {t:'JavaScript', l:[['Variables, functions, loops','https://javascript.info/first-steps'],['DOM & events','https://javascript.info/document'],['Fetch & APIs','https://javascript.info/fetch'],['Build: a to-do app','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting']]},
    {t:'Accessibility & shipping', l:[['Accessibility intro','https://www.w3.org/WAI/fundamentals/accessibility-intro/'],['Git & GitHub','https://git-scm.com/book/en/v2'],['Deploy a site for free','https://docs.github.com/en/pages'],['Build: your portfolio','https://web.dev/learn']]},
  ]},
  app: {name:'App Development', modules:[
    {t:'Programming basics', l:[['Think like a programmer (JS)','https://javascript.info/'],['Data structures basics','https://www.freecodecamp.org/learn'],['Git version control','https://git-scm.com/book/en/v2']]},
    {t:'Modern UI with React', l:[['React: Quick start','https://react.dev/learn'],['Thinking in React','https://react.dev/learn/thinking-in-react'],['State & effects','https://react.dev/learn/managing-state'],['Build: a watchlist app','https://react.dev/learn/tutorial-tic-tac-toe']]},
    {t:'Mobile apps', l:[['React Native: get started','https://reactnative.dev/docs/getting-started'],['Flutter: get started','https://docs.flutter.dev/get-started'],['Android (Kotlin) courses','https://developer.android.com/courses'],['iOS: SwiftUI tutorials','https://developer.apple.com/tutorials/swiftui']]},
    {t:'Desktop apps', l:[['Electron: build your first app','https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites'],['Package an .exe installer','https://www.electron.build/'],['Build: turn a website into an app','https://www.electronjs.org/docs/latest/']]},
    {t:'Backend & publishing', l:[['HTTP & REST APIs','https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview'],['Databases intro (SQL)','https://sqlbolt.com/'],['Publish to app stores','https://developer.android.com/studio/publish'],['Build: ship your first app','https://docs.github.com/en/get-started']]},
  ]},
};
const YT_SEARCHES = [
  ['HTML & CSS full course','html css full course beginners'],['JavaScript for beginners','javascript full course beginners'],
  ['Web design in Figma','figma web design tutorial'],['React tutorial','react tutorial beginners'],
  ['Flutter app tutorial','flutter tutorial beginners'],['Game dev with Godot','godot beginner tutorial'],
  ['UI/UX design principles','ui ux design principles'],['Build an Electron app','electron js tutorial'],
];

/* ---------- impact content ---------- */
const QUESTS = [
  ['Thank someone','Send a genuine thank-you message to a friend, teammate or creator.','kind'],
  ['Be a good teammate','Play one match where you only give positive comms. No flame.','kind'],
  ['Teach what you learn','Explain one thing you learned today to someone (or write it down).','learn'],
  ['Lights & power','Switch off your PC/console fully instead of standby tonight.','eco'],
  ['Refill, not rebuy','Use a reusable bottle or cup all day.','eco'],
  ['Report, don\'t rage','Report toxic behaviour in a game instead of fighting it.','kind'],
  ['20-20-20 for your eyes','Every 20 min, look 20 feet away for 20 seconds — 3 times today.','health'],
  ['Walk it off','Take a 10-minute walk outside between sessions.','health'],
  ['Support a small creator','Like and leave a kind comment on a small YouTuber\'s video.','kind'],
  ['Answer a question','Help a beginner on a forum, Discord or Reddit.','learn'],
  ['Donate idle GPU time','Run Folding@home while you are away to help disease research.','world'],
  ['Freerice round','Answer 10 questions on Freerice — each one donates rice.','world'],
  ['Declutter digitally','Unsubscribe from 5 emails/channels you never open.','health'],
  ['Hydrate','Drink 6+ glasses of water today.','health'],
  ['Accessibility check','Turn on subtitles and notice how many people rely on them.','learn'],
  ['Pick up 3','Pick up 3 pieces of litter on your next walk.','eco'],
];
const ORGS = [
  ['Folding@home','Use your gaming PC\'s spare power for disease research.','https://foldingathome.org/'],
  ['AbleGamers','Helps people with disabilities play games.','https://ablegamers.org/'],
  ['Child\'s Play','Gamers bringing games & toys to children\'s hospitals.','https://www.childsplaycharity.org/'],
  ['Freerice','Answer quiz questions to donate food (UN WFP).','https://freerice.com/'],
  ['Zooniverse','Do real science from your browser.','https://www.zooniverse.org/'],
  ['Be My Eyes','Volunteer to help blind people over video.','https://www.bemyeyes.com/'],
  ['Games for Change','Games that make a positive social impact.','https://www.gamesforchange.org/'],
  ['freeCodeCamp','Learn to code for free — and help others learn.','https://www.freecodecamp.org/'],
];

/* ---------- accounts ----------
   Accounts live on this device only. Passwords are never stored: only a salted PBKDF2-SHA256 hash.
   Each account keeps its own progress under its own storage key. */
const ACC_KEY = 'levelup-accounts-v1', GUEST_KEY = 'levelup-life-v1', GUEST = '__guest__';
const keyFor = name => name && name !== GUEST ? `${GUEST_KEY}:u:${name.toLowerCase()}` : GUEST_KEY;
const loadJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch { return d; } };
let ACC = loadJSON(ACC_KEY, {});
if (!ACC.users || typeof ACC.users !== 'object' || Array.isArray(ACC.users)) ACC.users = {};
const saveAcc = () => { try { localStorage.setItem(ACC_KEY, JSON.stringify(ACC)); } catch {} };
const me = () => ACC.current && ACC.current !== GUEST ? ACC.users[String(ACC.current).toLowerCase()] || null : null;
if (ACC.current && ACC.current !== GUEST && !me()) ACC.current = null;
if (!ACC.current && loadJSON(GUEST_KEY, {}).agreed === true) { ACC.current = GUEST; saveAcc(); } // people who used the app before accounts existed
let KEY = keyFor(ACC.current);
const USER_RE = /^[A-Za-z0-9_]{3,20}$/, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- crypto helpers (Web Crypto) ---------- */
const enc = new TextEncoder();
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randHex = n => toHex(crypto.getRandomValues(new Uint8Array(n)));
async function pbkdf2(secret, saltHex, iterations) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return toHex(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations}, k, 256));
}
const sha256 = async s => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const safeEq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
async function setPassword(u, pw) { u.salt = randHex(16); u.iter = 150000; u.hash = await pbkdf2(pw, u.salt, u.iter); }
async function checkPassword(u, pw) { return !!(u && u.salt && u.hash) && safeEq(await pbkdf2(pw, u.salt, u.iter || 150000), u.hash); }

/* ---------- owner ----------
   Only a hash of the owner key's PBKDF2 output is in this file, so the key can't be read from the code.
   Owner status is re-checked every time the app loads; editing saved data can't fake it. */
const OWNER_CHECK = '22c14d7502ee76c4cebd42bd61044ac94f3666f80082df1364e4ffe140d1fb17';
const OWNER_SALT = '6c6576656c75702d6f776e65722d7631'; // "levelup-owner-v1"
const normKey = k => String(k).toUpperCase().replace(/[^A-Z0-9]/g, '');
/* Admin: a second key the owner can give to a trusted friend. Fewer powers than the owner; the full list is in ownerCard(). */
const ADMIN_CHECK = 'ef9bc3e4cc48760b188f2519758f3d018ff3c043ee123dcba58d700dc55f9f80';
const ADMIN_SALT = '6c6576656c75702d61646d696e2d7631'; // "levelup-admin-v1"
const ADMIN_LEVEL_BOOST = 100; // admins get a one-time boost to this level
let isOwner = false, isAdmin = false;
const isAdminOnly = () => isAdmin && !isOwner;
async function verifyOwner() { // checks both roles
  let ok = false, adm = false;
  try { ok = !!S.ownerProof && safeEq(await sha256(S.ownerProof), OWNER_CHECK); } catch {}
  try { adm = !!S.adminProof && safeEq(await sha256(S.adminProof), ADMIN_CHECK); } catch {}
  if (ok !== isOwner || adm !== isAdmin) { isOwner = ok; isAdmin = adm; await loadMedia(); paintPlayer(); if (['home', 'badges', 'options', 'study', 'gaming', 'series', 'youtube', 'chat', 'players'].includes(current)) rerender(); }
  if (S.pub) schedulePublish(4000); // keep the public profile up to date (it skips the upload when nothing changed)
  if (isOwner || isAdmin) setTimeout(() => loadReports(), 3000); // a dot on Players when there are open reports
}
async function claimOwner(key) { // returns 'owner', 'admin' or false
  const n = normKey(key);
  const proof = await pbkdf2(n, OWNER_SALT, 200000);
  if (safeEq(await sha256(proof), OWNER_CHECK)) { S.ownerProof = proof; save(); await unlockSignKey(key); await verifyOwner(); return 'owner'; }
  const aproof = await pbkdf2(n, ADMIN_SALT, 200000);
  if (!safeEq(await sha256(aproof), ADMIN_CHECK)) return false;
  S.adminProof = aproof;
  if (!S.adminBoost) { S.adminBoost = true; let need = 0; for (let l = 1; l < ADMIN_LEVEL_BOOST; l++) need += xpForNext(l); S.xp = Math.max(S.xp, need); }
  save(); await unlockAdminSignKey(key); await verifyOwner(); return 'admin';
}

/* ---------- owner media (profile picture, banner, custom emoji) ----------
   Images are stored as files in IndexedDB on this device, keyed per account. Only the owner can add or see them. */
let mediaDb;
const idb = () => mediaDb ||= new Promise((res, rej) => { const r = indexedDB.open('levelup-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function mediaOp(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('files', mode), req = fn(tx.objectStore('files')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
const mk = k => KEY + '|' + k;
const mediaGet = k => mediaOp('readonly', s => s.get(mk(k)));
const mediaPut = (k, v) => mediaOp('readwrite', s => s.put(v, mk(k)));
const mediaDel = k => mediaOp('readwrite', s => s.delete(mk(k)));
async function mediaWipe() { const pre = KEY + '|'; try { const ks = await mediaOp('readonly', s => s.getAllKeys()); for (const k of ks) if (String(k).startsWith(pre)) await mediaOp('readwrite', s => s.delete(k)); } catch {} }
const M = {pfp:'', banner:'', pfpVid:false, bannerVid:false, pfpLive:false, bannerLive:false, emoji:new Map()};
function clearMedia() { [M.pfp, M.banner, ...M.emoji.values()].forEach(u => u && URL.revokeObjectURL(u)); M.pfp = M.banner = ''; M.pfpVid = M.bannerVid = M.pfpLive = M.bannerLive = false; M.emoji = new Map(); }
async function loadMedia() {
  clearMedia(); if (!(isOwner || isAdmin) || !window.indexedDB) return;
  try {
    const url = b => b ? URL.createObjectURL(b) : '';
    for (const k of ['pfp', 'banner']) { const b = await mediaGet(k); if (!b) continue;
      const a = await inspectMedia(b); M[k] = url(b); M[k + 'Vid'] = a.video; M[k + 'Live'] = a.live; }
    for (const e of S.emoji) { const b = await mediaGet('emoji:' + e.id); if (b) M.emoji.set(e.name, URL.createObjectURL(b)); }
  } catch {}
}
/* Work out what a file really is from its first bytes, not its name: "GIFs" saved from Discord, Tenor or Giphy
   are often really WebP or MP4 files with a .gif name. Animated files are kept exactly as they are so they keep moving. */
const MIME = {gif:'image/gif', png:'image/png', jpeg:'image/jpeg', webp:'image/webp', mp4:'video/mp4', webm:'video/webm'};
const hasBytes = (b, s, from = 0, to = b.length) => { const c = [...s].map(ch => ch.charCodeAt(0));
  outer: for (let i = from; i <= Math.min(to, b.length) - c.length; i++) { for (let j = 0; j < c.length; j++) if (b[i + j] !== c[j]) continue outer; return true; } return false; };
async function inspectMedia(file) {
  const b = new Uint8Array(await file.slice(0, 16 * 1048576).arrayBuffer()), at = (i, s) => hasBytes(b, s, i, i + s.length);
  let kind = '';
  if (at(0, 'GIF8')) kind = 'gif';
  else if (b[0] === 0x89 && at(1, 'PNG')) kind = 'png';
  else if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) kind = 'jpeg';
  else if (at(0, 'RIFF') && at(8, 'WEBP')) kind = 'webp';
  else if (at(4, 'ftyp')) kind = 'mp4';
  else if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) kind = 'webm';
  let live = false;
  if (kind === 'gif') { let frames = 0; for (let i = 0; i < b.length - 2 && frames < 2; i++) if (b[i] === 0x21 && b[i + 1] === 0xF9 && b[i + 2] === 0x04) frames++;
    live = frames > 1 || hasBytes(b, 'NETSCAPE2.0') || hasBytes(b, 'ANIMEXTS1.0'); }
  else if (kind === 'png') live = hasBytes(b, 'acTL', 8, 65536); // animated PNG
  else if (kind === 'webp') live = (at(12, 'VP8X') && (b[20] & 0x02) !== 0) || hasBytes(b, 'ANIM', 12, 65536);
  else if (kind === 'mp4' || kind === 'webm') live = true;
  return {kind, mime:MIME[kind] || '', live, video:kind === 'mp4' || kind === 'webm'};
}
async function prepImage(file, kind) { // still images are resized to save space; animated ones are kept as they are so they keep moving
  const L = {pfp:{max:8, w:320, h:320, crop:true, video:true}, banner:{max:15, w:1800, h:600, video:true}, emoji:{max:2, w:128, h:128}}[kind];
  if (!file) throw new Error('Choose a file first.');
  if (file.size > L.max * 1048576) throw new Error(`That file is too big. The limit is ${L.max} MB.`);
  const a = await inspectMedia(file);
  if (!a.kind || (a.video && !L.video)) throw new Error(L.video ? 'Use a PNG, JPG, WebP, GIF, MP4 or WebM file.' : 'Use a PNG, JPG, WebP or GIF image.');
  if (a.live || a.kind === 'gif') return {blob:new Blob([file], {type:a.mime}), live:a.live, video:a.video, gif:a.kind === 'gif'};
  const img = await createImageBitmap(file);
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (L.crop) { const sq = Math.min(sw, sh); sx = (sw - sq) / 2; sy = (sh - sq) / 2; sw = sh = sq; }
  const scale = Math.min(1, L.w / sw, L.h / sh), cw = Math.max(1, Math.round(sw * scale)), ch = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', .9)) || await new Promise(r => c.toBlob(r, 'image/png'));
  return {blob, live:false};
}
// escape text, then turn :name: into the owner's custom emoji
const emo = s => { const h = esc(s); return M.emoji.size ? h.replace(/:([a-z0-9_]{2,24}):/g, (m, n) => M.emoji.has(n) ? `<img class="emoji" src="${M.emoji.get(n)}" alt=":${n}:" title=":${n}:">` : m) : h; };
const pic = (src, vid) => vid ? `<video src="${src}" autoplay muted loop playsinline disablepictureinpicture aria-hidden="true"></video>` : `<img src="${src}" alt="">`;
const avatarInner = () => M.pfp ? pic(M.pfp, M.pfpVid) : esc(displayName().trim().charAt(0).toUpperCase());

/* ---------- state ---------- */
const DEFAULT = {
  name:'', agreed:false, theme:'dark', xp:0, notify:false, thumbs:true, breakEvery:60, epLen:40, track:'web',
  goals:{learn:60, play:120, watch:90},
  log:[],                         // {d, cat:'learn'|'play'|'watch', m}
  lessons:{},                     // id -> date
  tasks:[],                       // {id,text,done}
  focus:{work:25, short:5, long:15, count:0},
  backlog:[],                     // {id,title,platform,status}
  series:[],                      // {id,title,platform,s,e,status}
  yt:[],                          // {id,url,title,kind,watched,mins}
  quests:{},                      // date -> [index]
  questsTotal:0,
  run:{},                         // running timers, so a reload does not lose them
  stats:{episodes:0, chat:0, dm:0, group:0, wkAll:0},
  ownerProof:'',
  adminProof:'',
  adminBoost:false,
  chatCode:'',
  emoji:[],                       // owner's custom emoji: {id, name, live}; the images live in IndexedDB
  pub:false,                      // public profile on the leaderboard (opt-in)
  pubHash:'', pubAt:0,            // what was last published, and when
  friends:[],                     // usernames I added as friends
  ignored:[],                     // friend requests I declined
  modHidden:[],                   // owner/admin: players hidden from the leaderboard
  packHash:'',                    // owner/admin: last published chat emoji pack
  staffAdds:[],                   // the owner/admins who added me (so I'm told only once)
  toured:false,                   // saw the first-visit tour
  since:0, lastBackup:0, backupSnooze:0, // backup reminder
  repAt:[],                       // when I sent reports (a simple rate limit)
  days:[],                        // days I opened the app (login streak)
  wk:{id:'', xp:0, base:null, done:[]}, // this week: XP, counters at the start of the week, finished challenges
  ach:{},                         // achievements: id -> date unlocked
  bio:'', favs:[],                // shown on the public profile
  season:'auto',                  // seasonal theme
  notes:[],                       // notifications
  seen:{at:0, req:[], fr:[], rep:[], repAt:0}, // what was already turned into a notification
  dm:{}, dmRead:{}, dmDirty:false, // private messages per friend, when I last read each, unsent changes
  group:'', gid:'',               // study group code, and this device's id in groups
};
/* Every value read from storage or a backup file is checked, so a broken or edited file can't crash the app or inject HTML. */
const num = (v, d, lo = 0, hi = 1e6) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; };
const str = (v, max = 200) => typeof v === 'string' ? v.slice(0, max) : '';
const arr = v => Array.isArray(v) ? v : [];
const okId = v => typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : uid();
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const CATS = ['learn', 'play', 'watch'];
function clean(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}, d = structuredClone(DEFAULT);
  d.name = str(s.name, 24); d.agreed = s.agreed === true; d.theme = s.theme === 'light' ? 'light' : 'dark';
  d.xp = num(s.xp, 0); d.notify = s.notify === true; d.thumbs = s.thumbs !== false;
  d.breakEvery = num(s.breakEvery, 60, 0, 600); d.epLen = num(s.epLen, 40, 1, 300); d.track = TRACKS[s.track] ? s.track : 'web';
  const g = s.goals || {}; d.goals = {learn:num(g.learn, 60, 0, 1440), play:num(g.play, 120, 0, 1440), watch:num(g.watch, 90, 0, 1440)};
  d.log = arr(s.log).filter(x => x && isDay(x.d) && CATS.includes(x.cat)).map(x => {
    const e = {d:x.d, cat:x.cat, m:num(x.m, 0, 0, 1440)}; if (x.g) e.g = str(x.g, 60); if (x.ref) e.ref = str(x.ref, 60); return e; });
  for (const [k, v] of Object.entries(s.lessons || {})) if (/^\w+\.\d+\.\d+$/.test(k)) d.lessons[k] = str(v, 10);
  d.tasks = arr(s.tasks).filter(x => x && x.text).map(x => ({id:okId(x.id), text:str(x.text, 120), done:x.done === true}));
  const f = s.focus || {}; d.focus = {work:num(f.work, 25, 1, 120), short:num(f.short, 5, 1, 120), long:num(f.long, 15, 1, 120), count:num(f.count, 0)};
  d.backlog = arr(s.backlog).filter(x => x && x.title).map(x => ({id:okId(x.id), title:str(x.title, 60), platform:str(x.platform, 30),
    status:['playing', 'backlog', 'finished'].includes(x.status) ? x.status : 'backlog', xpDone:x.xpDone === true || x.status === 'finished'}));
  d.series = arr(s.series).filter(x => x && x.title).map(x => ({id:okId(x.id), title:str(x.title, 60), platform:str(x.platform, 30),
    s:num(x.s, 1, 1, 999), e:num(x.e, 0, 0, 9999), status:['watching', 'plan', 'done'].includes(x.status) ? x.status : 'watching'}));
  d.yt = arr(s.yt).filter(x => x && (x.title || x.url)).map(x => ({id:okId(x.id), url:safeUrl(str(x.url, 500)), title:str(x.title, 90) || 'YouTube video',
    kind:x.kind === 'fun' ? 'fun' : 'learn', mins:num(x.mins, 10, 1, 1440), watched:x.watched === true}));
  for (const [k, v] of Object.entries(s.quests || {})) if (isDay(k)) d.quests[k] = [...new Set(arr(v).map(i => num(i, 0, 0, QUESTS.length - 1)))];
  d.questsTotal = num(s.questsTotal, 0);
  d.chatCode = str(s.chatCode, 64);
  const st = s.stats || {}; d.stats = {episodes:num(st.episodes, d.series.reduce((a, x) => a + x.e, 0), 0, 1e6), chat:num(st.chat, 0, 0, 1e7), dm:num(st.dm, 0, 0, 1e7), group:num(st.group, 0, 0, 1e6), wkAll:num(st.wkAll, 0, 0, 1e5)};
  const seen = new Set(); d.emoji = arr(s.emoji).filter(x => x && typeof x.name === 'string' && /^[a-z0-9_]{2,24}$/.test(x.name) && !seen.has(x.name) && seen.add(x.name)).slice(0, 100).map(x => ({id:okId(x.id), name:x.name, live:x.live === true}));
  d.ownerProof = typeof s.ownerProof === 'string' && /^[0-9a-f]{64}$/.test(s.ownerProof) ? s.ownerProof : '';
  d.adminProof = typeof s.adminProof === 'string' && /^[0-9a-f]{64}$/.test(s.adminProof) ? s.adminProof : '';
  d.adminBoost = s.adminBoost === true;
  const names = (v, max) => [...new Set(arr(v).filter(x => typeof x === 'string' && /^[a-z0-9_]{3,20}$/.test(x)))].slice(-max);
  d.pub = s.pub === true; d.pubHash = /^[0-9a-f]{64}$/.test(s.pubHash || '') ? s.pubHash : ''; d.pubAt = num(s.pubAt, 0, 0, 1e15);
  d.friends = names(s.friends, 200); d.ignored = names(s.ignored, 200); d.modHidden = names(s.modHidden, 500);
  d.packHash = /^[0-9a-f]{64}$/.test(s.packHash || '') ? s.packHash : ''; d.packPages = num(s.packPages, 1, 1, 9);
  d.staffAdds = names(s.staffAdds, 50);
  const ctl = v => String(v).replace(/\p{Cc}/gu, ' ');
  d.days = [...new Set(arr(s.days).filter(isDay))].sort().slice(-400);
  const w = s.wk || {}; d.wk = {id:isDay(w.id) ? w.id : '', xp:num(w.xp, 0, 0, 1e7), base:null, done:[...new Set(arr(w.done).filter(x => typeof x === 'string' && /^[a-z]{2,12}$/.test(x)))].slice(0, 3)};
  if (w.base && typeof w.base === 'object' && ['focus', 'lessons', 'deeds', 'vids', 'chat', 'dm', 'group'].every(k => Number.isFinite(Number(w.base[k])))) d.wk.base = Object.fromEntries(['focus', 'lessons', 'deeds', 'vids', 'chat', 'dm', 'group'].map(k => [k, num(w.base[k], 0, 0, 1e9)]));
  for (const [k, v] of Object.entries(s.ach || {})) if (/^[a-z0-9]{2,20}$/.test(k) && isDay(v)) d.ach[k] = v;
  d.bio = ctl(str(s.bio, 160)).trim(); d.favs = arr(s.favs).filter(x => typeof x === 'string').map(x => ctl(x).trim().slice(0, 40)).filter(Boolean).slice(0, 5);
  d.season = ['auto', 'off', 'winter', 'spring', 'summer', 'autumn', 'halloween', 'festive', 'newyear'].includes(s.season) ? s.season : 'auto';
  d.notes = arr(s.notes).filter(n => n && typeof n.t === 'string').slice(0, 60).map(n => ({id:okId(n.id), t:ctl(str(n.t, 160)), at:num(n.at, 0, 0, 1e15), r:n.r === true,
    h:typeof n.h === 'string' && /^#[a-z]{2,12}$/.test(n.h) ? n.h : '', u:typeof n.u === 'string' && /^[a-z0-9_]{3,20}$/.test(n.u) ? n.u : ''}));
  const sn = s.seen || {}; d.seen = {at:num(sn.at, 0, 0, 1e15), req:names(sn.req, 200), fr:names(sn.fr, 200), rep:arr(sn.rep).filter(x => typeof x === 'string' && /^[\w-]{1,60}$/.test(x)).slice(0, 200), repAt:num(sn.repAt, 0, 0, 1e15)};
  for (const [u, list] of Object.entries(s.dm || {})) if (/^[a-z0-9_]{3,20}$/.test(u)) { const l = arr(list).filter(x => x && typeof x.t === 'string' && /^[0-9a-f]{8,32}$/.test(x.id)).map(x => ({id:x.id, f:x.f === true, t:ctl(str(x.t, 500)), at:num(x.at, 0, 0, 1e15)})).slice(-200); if (l.length) d.dm[u] = l; }
  for (const [u, v] of Object.entries(s.dmRead || {})) if (/^[a-z0-9_]{3,20}$/.test(u)) d.dmRead[u] = num(v, 0, 0, 1e15);
  d.dmDirty = s.dmDirty === true;
  d.group = str(s.group, 40); d.gid = typeof s.gid === 'string' && /^[0-9a-f]{16}$/.test(s.gid) ? s.gid : randHex(8);
  d.toured = s.toured === true || d.xp >= 60; // people who already use the app don't need the tour
  d.since = num(s.since, 0, 0, 1e15) || Date.now(); d.lastBackup = num(s.lastBackup, 0, 0, 1e15); d.backupSnooze = num(s.backupSnooze, 0, 0, 1e15);
  d.repAt = arr(s.repAt).map(x => num(x, 0, 0, 1e15)).filter(x => x > Date.now() - 864e5).slice(-20);
  const r = s.run || {};
  if (r.game && num(r.game.start, 0, 0, 1e15) > 0) d.run.game = {start:num(r.game.start, 0, 0, 1e15), game:str(r.game.game, 60) || 'Gaming'};
  if (r.focus && ['work', 'short', 'long'].includes(r.focus.mode) && num(r.focus.end, 0, 0, 1e15) > 0) d.run.focus = {mode:r.focus.mode, end:num(r.focus.end, 0, 0, 1e15)};
  return d;
}
let S;
try { S = clean(JSON.parse(localStorage.getItem(KEY) || '{}')); }
catch { S = clean({}); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} if (S.pub) schedulePublish(); queueProgress(); };

const addLog = (cat, m, ref) => { if (m > 0) { const e = {d: today(), cat, m: Math.round(m)}; if (ref) e.ref = ref; S.log.push(e); save(); } };
const dropLog = ref => { S.log = S.log.filter(x => x.ref !== ref); save(); };
const minsOn = (d, cat) => S.log.filter(x => x.d === d && (!cat || x.cat === cat)).reduce((a, x) => a + x.m, 0);
const MAX_LEVEL = 1000, OWNER_LEVEL = MAX_LEVEL;
const xpForNext = lv => Math.min(100 + (lv - 1) * 25, 500); // XP to go from lv to lv + 1; capped so level 1000 is reachable
const level = () => {
  if (isOwner) return {lv:OWNER_LEVEL, xp:1, need:1, max:true};
  let lv = 1, need = xpForNext(1), xp = S.xp;
  while (xp >= need && lv < MAX_LEVEL) { xp -= need; lv++; need = xpForNext(lv); }
  return lv >= MAX_LEVEL ? {lv:MAX_LEVEL, xp:1, need:1, max:true} : {lv, xp, need, max:false};
};
const displayName = () => (me() && me().username) || S.name || 'Player';
const gainXP = (n, why, quiet) => { // quiet: rewards that happen in the background don't cover a message that is showing
  if (isAdminOnly()) n *= 2; // admin perk: double XP (both ways, so unticking still balances out)
  const before = level().lv; S.xp = Math.max(0, S.xp + n); rollWeek(); S.wk.xp = Math.max(0, S.wk.xp + n); save(); paintPlayer();
  if (n > 0 && !(quiet && $('#toast').classList.contains('show'))) toast(level().lv > before ? `🎉 Level up! You are now level ${level().lv}` : `+${n} XP${isAdminOnly() ? ' (2× admin)' : ''} · ${why}`);
};
const streak = () => { let n = 0; for (let i = 0; i < 365; i++) { if (minsOn(dayOffset(i), 'learn') > 0 || (S.quests[dayOffset(i)] || []).length) n++; else if (i > 0) break; } return n; };

/* ---------- UI chrome ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function notify(title, body) {
  toast(`${title} — ${body}`);
  if (S.notify && 'Notification' in window && Notification.permission === 'granted') try { new Notification(title, {body, icon:'icon.svg'}); } catch {}
}
function paintPlayer() {
  const {lv, xp, need, max} = level();
  $('#lvl').textContent = max ? `${lv} MAX` : lv; $('#xpBar').style.width = (max ? 100 : xp / need * 100) + '%';
  $('.profile').title = `${displayName()}${me() ? '' : ' (guest)'} · ${max ? 'Max level' : `${xp}/${need} XP to level ${lv + 1}`}`;
  $('#avatar').innerHTML = avatarInner();
  $('.profile').classList.toggle('owner', isOwner);
  $('.profile').classList.toggle('admin', isAdminOnly());
}
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  $('#themeBtn').setAttribute('aria-checked', S.theme === 'dark');
}
function buildNav() {
  $('#nav').innerHTML = ROUTES.filter(r => r.main).map(r => `<a href="#${r.id}" data-route="${r.id}" title="${r.name}${r.key ? ` (${r.key})` : ''}">${iconFor(r.id)}<span>${r.short || r.name}</span></a>`).join('');
  $('#bottomnav').innerHTML = ['home','study','focus','gaming'].map(id => { const r = ROUTES.find(x => x.id === id);
    return `<a href="#${id}" data-route="${id}">${iconFor(id)}${r.short || r.name}</a>`; }).join('') + `<button id="moreBtn">${icon('more')}More</button>`;
  $('#sheetGrid').innerHTML = ROUTES.map(r => `<a class="tile" href="#${r.id}">${iconFor(r.id)}<span>${r.short || r.name}</span></a>`).join('');
}

/* ---------- router ---------- */
let current = 'home', baseTitle = 'LevelUp Life';
function route() {
  const id = (location.hash.match(/^#\/?([\w-]+)/) || [])[1] || 'home';
  if (id === 'main') return; // the "Skip to content" link, not a tab
  const r = ROUTES.find(x => x.id === id) || ROUTES[0];
  current = r.id;
  $$('[data-route]').forEach(a => { const on = a.dataset.route === r.id; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  const act = $(`#nav [data-route="${r.id}"]`); if (act) act.scrollIntoView({block:'nearest', inline:'nearest'});
  $('#pageTitle').textContent = r.name; $('#pageSub').textContent = r.sub; baseTitle = `${r.name} · LevelUp Life`; document.title = baseTitle;
  $('#sheet').hidden = true;
  render();
  $('#main').focus({preventScroll:true}); window.scrollTo({top:0});
}
function render() { if (current !== 'chat') stopChat(); if (current !== 'players') stopPlayers(); if (current !== 'messages') stopDM(); const m = $('#main'); m.innerHTML = VIEWS[current](); (BIND[current] || (() => {}))(m); addPeek(m); }

/* show / hide buttons on every password box, so people can check what they typed */
function addPeek(root = document) {
  root.querySelectorAll('input[type="password"]:not([data-peek])').forEach(inp => {
    inp.dataset.peek = '1';
    const wrap = document.createElement('span'); wrap.className = 'peekwrap';
    inp.replaceWith(wrap); wrap.append(inp);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'peek';
    b._set = show => { inp.type = show ? 'text' : 'password'; b.innerHTML = icon(show ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.setAttribute('aria-pressed', String(show)); b.title = show ? 'Hide' : 'Show'; };
    b.onclick = () => { b._set(inp.type === 'password'); inp.focus(); };
    b._set(false); wrap.append(b);
  });
}
const hidePeeks = root => root.querySelectorAll('.peek').forEach(b => b._set(false));
function showMatch() {
  const a = $('#suPass').value, b = $('#suPass2').value, el = $('#suMatch');
  el.className = 'hint' + (b ? (a === b ? ' ok' : ' no') : '');
  el.textContent = !b ? '' : a === b ? 'Passwords match' : 'Passwords do not match yet';
}
const rerender = () => render();

/* ---------- small components ---------- */
const card = (cls, title, body, extra = '') => `<section class="card ${cls}">${title ? `<div class="card-h"><h2>${title}</h2>${extra}</div>` : ''}${body}</section>`;
const empty = t => `<div class="empty">${t}</div>`;
const emptyLi = t => `<li class="empty">${t}</li>`; // the same, for use inside a list
function lineChart(series) {
  const W = 600, H = 150, pad = 12;
  const max = Math.max(30, ...series.flatMap(s => s.data));
  const pts = data => data.map((v, i) => [pad + i * (W - 2 * pad) / (data.length - 1), H - pad - v / max * (H - 2 * pad)]);
  const path = p => p.reduce((a, [x, y], i, arr) => { if (!i) return `M${x},${y}`; const [px, py] = arr[i - 1]; const cx = (px + x) / 2; return a + ` C${cx},${py} ${cx},${y} ${x},${y}`; }, '');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${series.map(s => `<path d="${path(pts(s.data))}" stroke="${s.c}" stroke-width="2.2" fill="none" vector-effect="non-scaling-stroke"/>`).join('')}</svg></div>`;
}
const CAT = {learn:{n:'Learn', c:'#7c5dff'}, play:{n:'Play', c:'#4fd4f0'}, watch:{n:'Watch', c:'#f2c46d'}};
const week = cat => Array.from({length:7}, (_, i) => minsOn(dayOffset(6 - i), cat));

/* ---------- views ---------- */
const VIEWS = {};
const BIND = {};

VIEWS.home = () => {
  const d = today(), L = minsOn(d,'learn'), Pl = minsOn(d,'play'), W = minsOn(d,'watch');
  const wk = ['learn','play','watch'].map(c => week(c).reduce((a,b)=>a+b,0));
  const prevL = Array.from({length:7},(_,i)=>minsOn(dayOffset(13-i),'learn')).reduce((a,b)=>a+b,0);
  const trend = prevL ? Math.round((wk[0]-prevL)/prevL*100) : (wk[0] ? 100 : 0);
  const next = nextLesson();
  const ep = S.series.find(s => s.status === 'watching');
  const qi = dailyQuests()[0];
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  return `<div class="grid">
  ${needBackup() ? `<section class="card c12 backup-note" role="note">${icon('download')}<div class="grow"><b>Back up your progress</b><p class="muted small" style="margin:2px 0 0">${S.lastBackup ? `Your last backup was ${Math.floor((Date.now() - S.lastBackup) / 864e5)} days ago.` : 'You have never made a backup.'} Your progress lives only on this device, so a backup file keeps it safe if this browser is cleared.</p></div>
    <div class="row"><button type="button" class="btn primary sm" data-backup="now">${icon('download')}Download backup</button><button type="button" class="btn sm" data-backup="later">Remind me next week</button></div></section>` : ''}
  ${card('c5', '', `<div class="spark"><div><div class="badge">${icon('star')}</div><h2 style="margin-top:14px;font-size:1.3rem">Analytics</h2><div class="muted">Last 7 days</div>
    <div class="small" style="color:var(--accent2);margin-top:6px">${prevL ? `${trend >= 0 ? '+' : ''}${trend}% learning vs last week` : 'Your first week of tracking'}</div></div>
    <div style="flex:1;min-width:0">${lineChart(['learn','play','watch'].map(c=>({c:CAT[c].c,data:week(c)})))}
    <div class="legend" style="margin-top:10px">${Object.values(CAT).map(c=>`<span><i style="background:${c.c}"></i>${c.n}</span>`).join('')}</div></div></div>`)}
  ${card('c7', `${greet}, ${emo(displayName())}`, `<div class="statrow">
    <div class="stat"><span class="k">Learned today</span><span class="v">${fmtMin(L)}</span><span class="d">goal ${fmtMin(S.goals.learn)}</span></div>
    <div class="stat"><span class="k">Played today</span><span class="v">${fmtMin(Pl)}</span><span class="d">limit ${fmtMin(S.goals.play)}</span></div>
    <div class="stat"><span class="k">Watched today</span><span class="v">${fmtMin(W)}</span><span class="d">limit ${fmtMin(S.goals.watch)}</span></div>
    <div class="stat"><span class="k">Learning streak</span><span class="v">${streak()}🔥</span><span class="d">${S.questsTotal} good deeds</span></div></div>`,
    `<a class="btn primary" href="#focus">${icon('focus')}Start focus</a>`)}
  ${ACC.current ? weeklyCard() : ''}
  ${card('c4', 'Continue learning', next ? `<div class="orb" aria-hidden="true"><i></i><i></i><i></i></div>
    <p style="text-align:center;margin:0">${esc(next.lesson)}</p><p class="muted small" style="text-align:center;margin:4px 0 16px">${esc(TRACKS[next.track].name)} · ${esc(next.module)}</p>
    <div class="row" style="justify-content:center"><a class="btn" target="_blank" rel="noopener" href="${next.url}">${icon('link')}Open lesson</a><a class="btn primary" href="#study">Study Path</a></div>`
    : empty('🏆 You finished every lesson! Build something and share it.'), `<span class="tag p">${pctDone()}% done</span>`)}
  ${card('c4', 'Up next', `<ul class="list">
    <li class="item"><span class="thumb" style="--h:${ep ? hue(ep.title) : 'var(--dim)'}">${icon('series')}</span><div class="grow"><div class="t">${ep ? emo(ep.title) : 'No series in progress'}</div><div class="s">${ep ? `Season ${ep.s} · Episode ${ep.e + 1}` : 'Add one in Series'}</div></div>${ep ? `<button class="btn sm" data-ep="${ep.id}">Watched</button>` : '<a class="btn sm" href="#series">Add</a>'}</li>
    ${(() => { const g = S.backlog.find(b=>b.status==='playing'); return `<li class="item"><span class="thumb" style="--h:${g ? hue(g.title) : 'var(--dim)'}">${icon('gaming')}</span><div class="grow"><div class="t">${g ? emo(g.title) : 'No game marked as playing'}</div><div class="s">${g ? esc(g.platform || 'Game') : 'Add one in Gaming'}</div></div><a class="btn sm" href="#gaming">${g ? 'Play' : 'Add'}</a></li>`; })()}
    ${(() => { const v = S.yt.find(y=>!y.watched); return `<li class="item"><span class="thumb" style="--h:#e0465a">${icon('youtube')}</span><div class="grow"><div class="t">${v ? emo(v.title) : 'No saved videos'}</div><div class="s">${v ? (v.kind === 'learn' ? 'Learning' : 'Fun') : 'Save one in YouTube'}</div></div><a class="btn sm" href="#youtube">Open</a></li>`; })()}
  </ul>`, '<span class="more">···</span>')}
  ${card('c4', "Today's quest", `<div class="quest" style="border:0;padding:0"><span class="thumb" style="--h:var(--accent)">${icon('impact')}</span><div><b>${esc(qi[1][0])}</b><p class="muted small" style="margin:4px 0 0">${esc(qi[1][1])}</p></div></div>
    <div class="row" style="margin-top:16px"><button class="btn primary" data-quest="${qi[0]}" ${questDone(qi[0]) ? 'disabled' : ''}>${questDone(qi[0]) ? 'Done ✓' : 'Complete +15 XP'}</button><a class="btn" href="#impact">All quests</a></div>`)}
  ${card('c12', 'Programs', `<div class="tiles cols-5">${ROUTES.filter(r=>r.id!=='home'&&r.id!=='privacy').map(r=>`<a class="tile" href="#${r.id}">${iconFor(r.id)}<span>${r.short||r.name}</span></a>`).join('')}</div>`, '<span class="more">···</span>')}
  </div>`;
};
BIND.home = m => {
  m.querySelectorAll('[data-ep]').forEach(b => b.onclick = () => watchEp(b.dataset.ep));
  m.querySelectorAll('[data-quest]').forEach(b => b.onclick = () => doQuest(+b.dataset.quest));
};

/* study */
const lessonId = (t, mi, li) => `${t}.${mi}.${li}`;
function nextLesson() {
  for (const t of [S.track, ...Object.keys(TRACKS).filter(k => k !== S.track)])
    for (const [mi, mod] of TRACKS[t].modules.entries())
      for (const [li, [name, url]] of mod.l.entries()) if (!S.lessons[lessonId(t, mi, li)]) return {track:t, module:mod.t, lesson:name, url};
  return null;
}
function pctDone(t = S.track) { const all = TRACKS[t].modules.flatMap((m, mi) => m.l.map((_, li) => lessonId(t, mi, li))); return Math.round(all.filter(i => S.lessons[i]).length / all.length * 100); }
VIEWS.study = () => {
  const t = S.track, tr = TRACKS[t];
  return `<div class="grid">
  ${card('c8', '', `<div class="row" style="margin-bottom:18px"><div class="seg">${Object.entries(TRACKS).map(([k,v])=>`<button data-track="${k}" class="${k===t?'on':''}">${v.name}</button>`).join('')}</div>
    <span class="spacer" style="flex:1"></span><span class="muted small">${pctDone()}% complete</span></div>
    <div class="meter" style="margin-bottom:20px"><i style="width:${pctDone()}%"></i></div>
    ${tr.modules.map((mod, mi) => { const done = mod.l.filter((_, li) => S.lessons[lessonId(t,mi,li)]).length;
      return `<details class="module" ${done < mod.l.length && (mi === 0 || tr.modules.slice(0,mi).every((m2,mj)=>m2.l.every((_,lj)=>S.lessons[lessonId(t,mj,lj)]))) ? 'open' : ''}>
      <summary><span class="thumb" style="--h:${done===mod.l.length?'var(--ok)':'var(--accent)'};width:36px;height:36px;font-size:.9rem">${done===mod.l.length?'✓':mi+1}</span><span class="grow"><b style="font-weight:500">${esc(mod.t)}</b><br><span class="muted small">${done}/${mod.l.length} lessons</span></span><span class="tag ${done===mod.l.length?'g':'p'}">+20 XP each</span></summary>
      <div class="lessons">${mod.l.map(([name,url],li)=>{ const id=lessonId(t,mi,li); return `<label><input type="checkbox" class="check" data-lesson="${id}" ${S.lessons[id]?'checked':''}><span>${esc(name)}</span><a href="${url}" target="_blank" rel="noopener">Open ↗</a></label>`; }).join('')}</div></details>`; }).join('')}`)}
  <div class="c4" style="display:grid;gap:22px;align-content:start">
  ${card('', 'Study tasks', `<form class="row" id="taskForm"><input id="taskIn" placeholder="e.g. Finish flexbox exercise" maxlength="120" aria-label="New task"><button class="iconbtn" aria-label="Add task">${icon('plus')}</button></form>
    <ul class="list" style="margin-top:10px">${S.tasks.map(x=>`<li class="item ${x.done?'done':''}"><input type="checkbox" class="check" data-task="${x.id}" ${x.done?'checked':''} aria-label="Done"><div class="grow"><div class="t">${emo(x.text)}</div></div><button class="iconbtn" data-deltask="${x.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('') || emptyLi('No tasks yet. Add your first one above.')}</ul>`)}
  ${card('', 'Study tips', `<ul class="tips">
    <li>Build tiny projects. You learn fastest by making things.</li><li>Use 25-minute Focus sessions, then take a real break.</li>
    <li>Recreate a menu or HUD from your favourite game in HTML &amp; CSS.</li><li>Watch a tutorial once, then rebuild it without looking.</li>
    <li>Share your work. Feedback is a power-up.</li></ul>`)}
  </div></div>`;
};
BIND.study = m => {
  m.querySelectorAll('[data-track]').forEach(b => b.onclick = () => { S.track = b.dataset.track; save(); rerender(); });
  m.querySelectorAll('[data-lesson]').forEach(c => c.onchange = () => {
    const ref = 'lesson:' + c.dataset.lesson;
    if (c.checked) { S.lessons[c.dataset.lesson] = today(); addLog('learn', 20, ref); gainXP(20, 'lesson complete'); }
    else { delete S.lessons[c.dataset.lesson]; dropLog(ref); gainXP(-20); }
    save(); rerender();
  });
  $('#taskForm').onsubmit = e => { e.preventDefault(); const v = $('#taskIn').value.trim(); if (!v) return; S.tasks.unshift({id:uid(), text:v, done:false}); save(); rerender(); $('#taskIn').focus(); };
  m.querySelectorAll('[data-task]').forEach(c => c.onchange = () => { const t = S.tasks.find(x=>x.id===c.dataset.task); t.done = c.checked; gainXP(c.checked ? 5 : -5, 'task done'); save(); rerender(); });
  m.querySelectorAll('[data-deltask]').forEach(b => b.onclick = () => { S.tasks = S.tasks.filter(x=>x.id!==b.dataset.deltask); save(); rerender(); });
};

/* focus (pomodoro) — timer survives navigation */
const T = {mode:'work', end:0, left:S.focus.work*60, running:false, label:'', iv:null};
const modeLen = m => S.focus[m] * 60;
function startTicking() { clearInterval(T.iv); T.running = true; T.iv = setInterval(tick, 250); S.run.focus = {mode:T.mode, end:T.end}; save(); groupSoon(); }
function stopTicking() { T.running = false; clearInterval(T.iv); delete S.run.focus; save(); groupSoon(); }
function groupSoon() { clearTimeout(groupSoon.t); groupSoon.t = setTimeout(() => { if (GR.key) sendGroupState().then(() => { if (current === 'focus') pullGroup(); }); }, 600); }
function resumeFocus() { // pick up a timer that was running before the page was reloaded
  const f = S.run.focus; if (!f) return;
  T.mode = f.mode; T.end = f.end; T.left = Math.max(0, Math.round((f.end - Date.now()) / 1000)); startTicking();
}
function tick() {
  if (!T.running) return;
  T.left = Math.max(0, Math.round((T.end - Date.now()) / 1000));
  if (T.left <= 0) finishTimer();
  paintTimer();
}
function finishTimer() {
  stopTicking();
  if (T.mode === 'work') {
    addLog('learn', S.focus.work, 'focus'); S.focus.count++; save(); gainXP(S.focus.work, 'focus session');
    if (GR.key && othersFocusing()) { S.stats.group++; gainXP(10, 'studied together'); }
    notify('Focus complete', 'Great work! Take a break: stretch and drink some water.');
    setMode(S.focus.count % 4 === 0 ? 'long' : 'short');
  } else { notify('Break over', 'Ready for another focus round?'); setMode('work'); }
}
function setMode(m) { stopTicking(); T.mode = m; T.left = modeLen(m); paintTimer(); if (current === 'focus') rerender(); }
function paintTimer() {
  const el = $('#tTime'); const mm = String(Math.floor(T.left/60)).padStart(2,'0'), ss = String(T.left%60).padStart(2,'0');
  document.title = T.running ? `${mm}:${ss} · ${T.mode === 'work' ? 'Focus' : 'Break'}` : baseTitle;
  if (!el) return;
  el.textContent = `${mm}:${ss}`;
  const C = 2 * Math.PI * 120; $('#tRing').style.strokeDashoffset = C * (1 - T.left / modeLen(T.mode));
  $('#tGo').innerHTML = T.running ? `${icon('pause')}Pause` : `${icon('play')}${T.left < modeLen(T.mode) ? 'Resume' : 'Start'}`;
}
VIEWS.focus = () => {
  const C = 2 * Math.PI * 120;
  const todayF = S.log.filter(x=>x.d===today()&&x.cat==='learn').reduce((a,x)=>a+x.m,0);
  return `<div class="grid">
  ${card('c7', '', `<div style="text-align:center"><div class="seg">${[['work','Focus'],['short','Short break'],['long','Long break']].map(([k,n])=>`<button data-mode="${k}" class="${T.mode===k?'on':''}">${n}</button>`).join('')}</div>
    <div class="timer"><svg viewBox="0 0 260 260"><defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#9a7bff"/><stop offset="1" stop-color="${T.mode==='work'?'#4fd4f0':'#5fd3a5'}"/></linearGradient></defs>
      <circle class="ring-bg" cx="130" cy="130" r="120"/><circle class="ring" id="tRing" cx="130" cy="130" r="120" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
      <div class="time"><div><b id="tTime">--:--</b><span>${T.mode==='work'?'Focus time':'Break time'}</span></div></div></div>
    <input id="tLabel" placeholder="What are you working on? (optional)" maxlength="60" value="${esc(T.label)}" style="max-width:420px;margin:0 auto 16px;display:block;text-align:center">
    <div class="row" style="justify-content:center"><button class="btn primary" id="tGo"></button><button class="btn" id="tReset">${icon('reset')}Reset</button><button class="btn" id="tSkip">Skip</button></div>
    <p class="muted small" style="margin-top:14px">Shortcut: <kbd>Space</kbd> start / pause on this tab</p></div>`)}
  <div class="c5" style="display:grid;gap:22px;align-content:start">
  ${card('', 'Study group', '<div id="grpBox"></div>', '<span class="tag p">Live</span>')}
  ${card('', 'Today', `<div class="statrow" style="grid-template-columns:1fr 1fr"><div class="stat"><span class="k">Sessions</span><span class="v">${S.log.filter(x=>x.d===today()&&x.ref==='focus').length}</span></div><div class="stat"><span class="k">Learning time</span><span class="v">${fmtMin(todayF)}</span></div></div>
    <div class="meter" style="margin-top:16px"><i style="width:${Math.min(100,todayF/S.goals.learn*100)}%"></i></div><p class="muted small">${fmtMin(todayF)} of your ${fmtMin(S.goals.learn)} daily learning goal</p>`)}
  ${card('', 'Timer lengths (minutes)', `<div class="row">${[['work','Focus'],['short','Short'],['long','Long']].map(([k,n])=>`<label class="field" style="flex:1"><span>${n}</span><input type="number" min="1" max="120" data-len="${k}" value="${S.focus[k]}"></label>`).join('')}</div>`)}
  ${card('', 'Why it works', `<p class="muted small" style="margin:0">Short, focused blocks beat long distracted ones. Every 4th break is a long one. Each finished focus session gives XP and counts toward your learning goal.</p>`)}
  </div></div>`;
};
BIND.focus = m => {
  paintTimer(); bindGroup(); if (GR.key) pullGroup();
  m.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('#tGo').onclick = toggleTimer;
  $('#tReset').onclick = () => setMode(T.mode);
  $('#tSkip').onclick = () => setMode(T.mode === 'work' ? 'short' : 'work');
  $('#tLabel').oninput = e => T.label = e.target.value;
  m.querySelectorAll('[data-len]').forEach(i => i.onchange = () => { const v = Math.max(1, Math.min(120, +i.value || 1)); S.focus[i.dataset.len] = v; save(); if (!T.running && T.mode === i.dataset.len) T.left = v * 60; paintTimer(); });
};
function toggleTimer() {
  if (T.running) { T.left = Math.max(0, Math.round((T.end - Date.now()) / 1000)); stopTicking(); }
  else { if ('Notification' in window && S.notify && Notification.permission === 'default') Notification.requestPermission();
    if (T.left <= 0) T.left = modeLen(T.mode);
    T.end = Date.now() + T.left * 1000; startTicking(); }
  paintTimer();
}

/* gaming */
const G = {start:0, iv:null, game:'', nextBreak:0};
function startGame(game, start) {
  G.game = game; G.start = start; G.nextBreak = S.breakEvery * (Math.floor((Date.now() - start) / 60000 / (S.breakEvery || 1)) + 1);
  clearInterval(G.iv); G.iv = setInterval(gameTick, 1000); S.run.game = {start, game}; save();
}
function gameElapsed() { return G.start ? Math.floor((Date.now() - G.start) / 1000) : 0; }
function gameTick() {
  const s = gameElapsed(), el = $('#gClock');
  if (el) el.textContent = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const mins = Math.floor(s / 60);
  // ">=" instead of an exact minute match: background tabs only tick about once a minute
  if (G.start && S.breakEvery > 0 && mins >= G.nextBreak) {
    G.nextBreak = (Math.floor(mins / S.breakEvery) + 1) * S.breakEvery;
    notify('Break time', `You've played ${fmtMin(mins)}. Stand up, stretch, rest your eyes.`);
  }
}
VIEWS.gaming = () => {
  const wk = week('play'), tot = wk.reduce((a,b)=>a+b,0), playedToday = minsOn(today(),'play');
  const st = {playing:['Playing','p'], backlog:['Backlog','y'], finished:['Finished','g']};
  return `<div class="grid">
  ${card('c5', 'Session tracker', `<div style="text-align:center"><div style="font-size:3rem;font-weight:500;letter-spacing:.05em;margin:6px 0" id="gClock">00:00:00</div>
    <input id="gGame" list="gList" placeholder="Which game?" maxlength="60" value="${esc(G.game)}" style="margin-bottom:14px" ${G.start?'disabled':''}>
    <datalist id="gList">${S.backlog.map(b=>`<option value="${esc(b.title)}">`).join('')}</datalist>
    <button class="btn primary wide" id="gGo">${G.start ? icon('pause')+'Stop & save session' : icon('play')+'Start session'}</button>
    <p class="muted small">Break reminder every <b>${S.breakEvery ? fmtMin(S.breakEvery) : 'off'}</b> · change in Settings</p></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <form class="row" id="gLog"><input id="gLogGame" placeholder="Log past session: game" maxlength="60"><input id="gLogMin" type="number" min="1" max="1440" placeholder="min" style="flex:0 0 90px"><button class="btn">Log</button></form>`)}
  ${card('c7', 'This week', `<div class="statrow" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><span class="k">Today</span><span class="v">${fmtMin(playedToday)}</span><span class="d">limit ${fmtMin(S.goals.play)}</span></div>
    <div class="stat"><span class="k">7 days</span><span class="v">${fmtMin(tot)}</span></div><div class="stat"><span class="k">Games finished</span><span class="v">${S.backlog.filter(b=>b.status==='finished').length}</span></div></div>
    <div class="meter" style="margin:16px 0 6px"><i style="width:${Math.min(100,playedToday/S.goals.play*100)}%;${playedToday>S.goals.play?'background:var(--bad)':''}"></i></div>
    <p class="muted small">${playedToday > S.goals.play ? 'Over your daily play limit. Maybe time for a quest or a walk?' : 'Within your daily limit. GG!'}</p>
    ${lineChart([{c:CAT.play.c,data:wk}])}`)}
  ${card('c12', 'Game library', `<form class="row" id="bForm"><input id="bTitle" placeholder="Game title" maxlength="60" aria-label="Game title"><input id="bPlat" placeholder="Platform (PC, PS5, Switch…)" maxlength="30" aria-label="Platform">
    <select id="bStatus" style="flex:0 0 160px" aria-label="Status"><option value="backlog">Backlog</option><option value="playing">Playing</option><option value="finished">Finished</option></select><button class="btn primary">${icon('plus')}Add game</button></form>
    <ul class="list" style="margin-top:12px">${S.backlog.map(b=>`<li class="item"><span class="thumb" style="--h:${hue(b.title)}">${esc(b.title.charAt(0).toUpperCase())}</span><div class="grow"><div class="t">${emo(b.title)}</div><div class="s">${esc(b.platform||'—')} · ${fmtMin(S.log.filter(x=>x.cat==='play'&&x.g===b.title).reduce((a,x)=>a+x.m,0))} logged</div></div>
      <select data-bstat="${b.id}" style="flex:0 0 140px;padding:7px 34px 7px 14px" aria-label="Status">${Object.entries(st).map(([k,[n]])=>`<option value="${k}" ${b.status===k?'selected':''}>${n}</option>`).join('')}</select>
      <button class="iconbtn" data-bdel="${b.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('') || emptyLi('Your library is empty. Add the games you are playing or want to play.')}</ul>`)}
  </div>`;
};
BIND.gaming = m => {
  gameTick();
  $('#gGo').onclick = () => {
    if (!G.start) { startGame($('#gGame').value.trim() || 'Gaming', Date.now()); toast(`Session started: ${G.game}. GL HF!`); }
    else { const mins = Math.min(1440, Math.max(1, Math.round(gameElapsed()/60))); S.log.push({d:today(), cat:'play', m:mins, g:G.game}); clearInterval(G.iv); G.start = 0; delete S.run.game; save(); toast(`Saved ${fmtMin(mins)} of ${G.game}`); }
    rerender();
  };
  $('#gLog').onsubmit = e => { e.preventDefault(); const g = $('#gLogGame').value.trim() || 'Gaming', mn = +$('#gLogMin').value; if (!(mn > 0)) return toast('Enter the minutes you played'); S.log.push({d:today(), cat:'play', m:Math.min(1440, Math.round(mn)), g}); save(); toast('Session logged'); rerender(); };
  $('#bForm').onsubmit = e => { e.preventDefault(); const t = $('#bTitle').value.trim(); if (!t) return toast('Enter a game title'); S.backlog.unshift({id:uid(), title:t, platform:$('#bPlat').value.trim(), status:$('#bStatus').value}); save(); rerender(); };
  m.querySelectorAll('[data-bstat]').forEach(s => s.onchange = () => { const b = S.backlog.find(x=>x.id===s.dataset.bstat); b.status = s.value; if (s.value==='finished' && !b.xpDone) { b.xpDone = true; gainXP(10,'game finished'); } save(); rerender(); });
  m.querySelectorAll('[data-bdel]').forEach(b => b.onclick = () => { S.backlog = S.backlog.filter(x=>x.id!==b.dataset.bdel); save(); rerender(); });
};

/* series */
let seriesFilter = 'all';
function watchEp(id) { const s = S.series.find(x=>x.id===id); if (!s) return; s.e++; S.stats.episodes++; if (s.status === 'plan') s.status = 'watching'; addLog('watch', S.epLen); save(); toast(`${s.title}: S${s.s}E${s.e} watched`); rerender(); }
VIEWS.series = () => {
  const st = {watching:'Watching', plan:'Plan to watch', done:'Finished'};
  const list = S.series.filter(s => seriesFilter === 'all' || s.status === seriesFilter);
  return `<div class="grid">
  ${card('c4', 'Add a series', `<form class="form" id="sForm"><label class="field"><span>Title</span><input id="sTitle" maxlength="60" placeholder="e.g. Arcane"></label>
    <label class="field"><span>Where you watch it</span><input id="sPlat" maxlength="30" placeholder="Netflix, Prime, Crunchyroll…"></label>
    <div class="row"><label class="field" style="flex:1"><span>Season</span><input id="sS" type="number" min="1" value="1"></label><label class="field" style="flex:1"><span>Episodes seen</span><input id="sE" type="number" min="0" value="0"></label></div>
    <label class="field"><span>Status</span><select id="sStatus">${Object.entries(st).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
    <button class="btn primary">${icon('plus')}Add series</button></form>`)}
  ${card('c8', 'Your watchlist', `<div class="row" style="margin-bottom:10px">${[['all','All'],...Object.entries(st)].map(([k,v])=>`<button class="chip ${seriesFilter===k?'on':''}" data-sf="${k}">${v} <span class="dim">${k==='all'?S.series.length:S.series.filter(s=>s.status===k).length}</span></button>`).join('')}</div>
    <ul class="list">${list.map(s=>`<li class="item"><span class="thumb" style="--h:${hue(s.title)}">${esc(s.title.charAt(0).toUpperCase())}</span>
      <div class="grow"><div class="t">${emo(s.title)}</div><div class="s">${esc(s.platform||'—')} · Season ${s.s}, episode ${s.e} seen</div></div>
      <span class="tag ${s.status==='watching'?'p':s.status==='done'?'g':'y'}">${st[s.status]}</span>
      ${s.status!=='done'?`<button class="btn sm" data-sep="${s.id}" title="Mark next episode watched">+1 ep</button>`:''}
      <button class="iconbtn" data-snext="${s.id}" title="Next season" aria-label="Next season">S+</button>
      <select data-sstat="${s.id}" aria-label="Status" style="flex:0 0 140px;padding:7px 34px 7px 14px">${Object.entries(st).map(([k,v])=>`<option value="${k}" ${s.status===k?'selected':''}>${v}</option>`).join('')}</select>
      <button class="iconbtn" data-sdel="${s.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('') || emptyLi('Nothing here yet. Add the series you are watching.')}</ul>`)}
  ${card('c12', 'Healthy binge tip', `<p class="muted" style="margin:0">Every episode you mark counts ${S.epLen} minutes of watch time (change it in Settings). Try "one episode = one task": finish a study task, then reward yourself with an episode.</p>`)}
  </div>`;
};
BIND.series = m => {
  $('#sForm').onsubmit = e => { e.preventDefault(); const t = $('#sTitle').value.trim(); if (!t) return toast('Enter a title');
    S.series.unshift({id:uid(), title:t, platform:$('#sPlat').value.trim(), s:Math.max(1,+$('#sS').value||1), e:Math.max(0,+$('#sE').value||0), status:$('#sStatus').value}); save(); rerender(); };
  m.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { seriesFilter = b.dataset.sf; rerender(); });
  m.querySelectorAll('[data-sep]').forEach(b => b.onclick = () => watchEp(b.dataset.sep));
  m.querySelectorAll('[data-snext]').forEach(b => b.onclick = () => { const s = S.series.find(x=>x.id===b.dataset.snext); s.s++; s.e = 0; save(); rerender(); });
  m.querySelectorAll('[data-sstat]').forEach(x => x.onchange = () => { S.series.find(s=>s.id===x.dataset.sstat).status = x.value; save(); rerender(); });
  m.querySelectorAll('[data-sdel]').forEach(b => b.onclick = () => { S.series = S.series.filter(s=>s.id!==b.dataset.sdel); save(); rerender(); });
};

/* youtube */
let ytFilter = 'all';
VIEWS.youtube = () => {
  const list = S.yt.filter(v => ytFilter === 'all' || (ytFilter === 'todo' ? !v.watched : v.kind === ytFilter));
  return `<div class="grid">
  ${card('c4', 'Save a video', `<form class="form" id="yForm"><label class="field"><span>YouTube link</span><input id="yUrl" type="url" placeholder="https://youtube.com/watch?v=…"></label>
    <label class="field"><span>Title (so you remember it)</span><input id="yTitle" maxlength="90" placeholder="e.g. CSS Grid in 20 minutes"></label>
    <div class="row"><label class="field" style="flex:1"><span>Type</span><select id="yKind"><option value="learn">📚 Learning</option><option value="fun">🍿 Fun</option></select></label>
    <label class="field" style="flex:0 0 100px"><span>Minutes</span><input id="yMin" type="number" min="1" value="15"></label></div>
    <button class="btn primary">${icon('plus')}Save video</button></form>
    <p class="muted small">Learning videos give XP and count as study time when watched.</p>`)}
  ${card('c8', 'Watch later', `<div class="row" style="margin-bottom:10px">${[['all','All'],['todo','Not watched'],['learn','Learning'],['fun','Fun']].map(([k,v])=>`<button class="chip ${ytFilter===k?'on':''}" data-yf="${k}">${v}</button>`).join('')}</div>
    <ul class="list">${list.map(v=>{ const id = ytId(v.url); return `<li class="item ${v.watched?'done':''}">
      ${S.thumbs && id ? `<img src="https://i.ytimg.com/vi/${esc(id)}/mqdefault.jpg" alt="" width="96" height="54" style="border-radius:12px;object-fit:cover;flex:none" loading="lazy" referrerpolicy="no-referrer">` : `<span class="thumb" style="--h:#e0465a">${icon('youtube')}</span>`}
      <div class="grow"><div class="t">${emo(v.title)}</div><div class="s">${v.kind==='learn'?'📚 Learning':'🍿 Fun'} · ${fmtMin(v.mins)}</div></div>
      ${v.url ? `<a class="btn sm" href="${esc(v.url)}" target="_blank" rel="noopener">Open ↗</a>` : ''}
      <button class="btn sm" data-yw="${v.id}">${v.watched?'Unwatch':'Watched'}</button><button class="iconbtn" data-ydel="${v.id}" aria-label="Delete">${icon('trash')}</button></li>`; }).join('') || emptyLi('No videos saved. Paste a link to start your list.')}</ul>`)}
  ${card('c12', 'Learn on YouTube — quick searches', `<div class="tiles">${YT_SEARCHES.map(([n,q])=>`<a class="tile" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(q)}">${icon('youtube')}<span>${esc(n)}</span></a>`).join('')}</div>`)}
  </div>`;
};
BIND.youtube = m => {
  m.querySelectorAll('img').forEach(i => i.addEventListener('error', () => { const f = document.createElement('span'); f.className = 'thumb'; f.style.setProperty('--h', '#e0465a'); f.innerHTML = icon('youtube'); i.replaceWith(f); }));
  $('#yForm').onsubmit = e => { e.preventDefault(); const url = safeUrl($('#yUrl').value.trim()); const title = $('#yTitle').value.trim() || (url ? 'YouTube video' : '');
    if (!url && !title) return toast('Paste a link or a title'); S.yt.unshift({id:uid(), url, title, kind:$('#yKind').value, mins:Math.max(1,+$('#yMin').value||10), watched:false}); save(); rerender(); };
  m.querySelectorAll('[data-yf]').forEach(b => b.onclick = () => { ytFilter = b.dataset.yf; rerender(); });
  m.querySelectorAll('[data-yw]').forEach(b => b.onclick = () => { const v = S.yt.find(x=>x.id===b.dataset.yw); v.watched = !v.watched;
    const ref = 'yt:' + v.id;
    if (v.watched) { addLog(v.kind === 'learn' ? 'learn' : 'watch', v.mins, ref); if (v.kind === 'learn') gainXP(10, 'learning video'); }
    else { dropLog(ref); if (v.kind === 'learn') gainXP(-10); }
    save(); rerender(); });
  m.querySelectorAll('[data-ydel]').forEach(b => b.onclick = () => { S.yt = S.yt.filter(x=>x.id!==b.dataset.ydel); save(); rerender(); });
};

/* balance */
VIEWS.balance = () => {
  const days = Array.from({length:7}, (_, i) => dayOffset(6 - i));
  const data = days.map(d => ({d, v:['learn','play','watch'].map(c => minsOn(d, c))}));
  const max = Math.max(60, ...data.map(x => x.v.reduce((a,b)=>a+b,0)));
  const tot = ['learn','play','watch'].map((c,i) => data.reduce((a,x)=>a+x.v[i],0));
  const all = tot.reduce((a,b)=>a+b,0) || 1;
  const score = Math.round(Math.min(100, (tot[0] / Math.max(1, S.goals.learn*7)) * 60 + (tot[1] <= S.goals.play*7 ? 20 : 5) + (tot[2] <= S.goals.watch*7 ? 20 : 5)));
  return `<div class="grid">
  ${card('c8', 'Last 7 days', `<div class="bars">${data.map(x=>`<div class="col"><div class="bar"><div class="stack" style="height:${x.v.reduce((a,b)=>a+b,0)/max*100}%" title="${fmtMin(x.v.reduce((a,b)=>a+b,0))}">${x.v.map((v,i)=>`<i style="height:${v/(x.v.reduce((a,b)=>a+b,0)||1)*100}%;background:${Object.values(CAT)[i].c}"></i>`).join('')}</div></div><span class="lbl">${new Date(x.d+'T12:00').toLocaleDateString(undefined,{weekday:'short'})}</span></div>`).join('')}</div>
    <div class="legend" style="margin-top:14px">${Object.values(CAT).map((c,i)=>`<span><i style="background:${c.c}"></i>${c.n} · ${fmtMin(tot[i])}</span>`).join('')}</div>`)}
  ${card('c4', 'Balance score', `<div style="text-align:center"><div class="orb" aria-hidden="true"><i></i><i></i><i></i></div><div class="stat"><span class="v">${score}<span class="muted" style="font-size:1rem">/100</span></span>
    <span class="k">${score>=80?'Legendary balance':score>=50?'Solid. Keep going':'Let\'s add more learning'}</span></div></div>`)}
  ${card('c6', 'Where your time goes', ['learn','play','watch'].map((c,i)=>`<div style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><span>${CAT[c].n}</span><span class="muted">${Math.round(tot[i]/all*100)}%</span></div><div class="meter"><i style="width:${tot[i]/all*100}%;background:${CAT[c].c}"></i></div></div>`).join(''))}
  ${card('c6', 'Daily goals', `<div class="form">
    <label class="field"><span>Learning goal (min / day)</span><input type="number" min="0" data-goal="learn" value="${S.goals.learn}"></label>
    <label class="field"><span>Gaming limit (min / day)</span><input type="number" min="0" data-goal="play" value="${S.goals.play}"></label>
    <label class="field"><span>Watching limit (min / day)</span><input type="number" min="0" data-goal="watch" value="${S.goals.watch}"></label></div>`)}
  </div>`;
};
BIND.balance = m => m.querySelectorAll('[data-goal]').forEach(i => i.onchange = () => { S.goals[i.dataset.goal] = Math.max(0, +i.value || 0); save(); toast('Goal saved'); rerender(); });

/* impact */
function dailyQuests() { const seed = +today().replace(/-/g, ''); const idx = []; let x = seed; while (idx.length < 4) { x = (x * 9301 + 49297) % 233280; const i = x % QUESTS.length; if (!idx.includes(i)) idx.push(i); } return idx.map(i => [i, QUESTS[i]]); }
const questDone = i => (S.quests[today()] || []).includes(i);
function doQuest(i) { if (questDone(i)) return; (S.quests[today()] ||= []).push(i); S.questsTotal++; save(); gainXP(15, 'good deed'); rerender(); }
VIEWS.impact = () => {
  const q = dailyQuests(), done = q.filter(([i]) => questDone(i)).length;
  const tag = {kind:['Kindness','p'], eco:['Planet','g'], learn:['Knowledge','y'], health:['Health','g'], world:['World','r']};
  return `<div class="grid">
  ${card('c8', "Today's quests", `<p class="muted" style="margin-top:-6px">New quests every day. Small actions, multiplied by many people, change the world.</p>
    ${q.map(([i,[t,d,k]])=>`<div class="quest"><input type="checkbox" class="check" data-q="${i}" ${questDone(i)?'checked disabled':''} aria-label="Complete ${esc(t)}"><div><b style="font-weight:500">${esc(t)}</b> <span class="tag ${tag[k][1]}">${tag[k][0]}</span><p class="muted small" style="margin:4px 0 0">${esc(d)}</p></div><span class="xp">+15 XP</span></div>`).join('')}`,
    `<span class="tag p">${done}/4</span>`)}
  ${card('c4', 'Your impact', `<div style="text-align:center"><div class="orb" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="statrow" style="grid-template-columns:1fr 1fr"><div class="stat"><span class="k">Good deeds</span><span class="v">${S.questsTotal}</span></div><div class="stat"><span class="k">Streak</span><span class="v">${streak()}🔥</span></div></div></div>`)}
  ${card('c12', 'Gamers & learners helping the world', `<div class="tiles cols-4">${ORGS.map(([n,d,u])=>`<a class="tile" style="border-radius:24px;align-items:flex-start;text-align:left;padding:18px" href="${u}" target="_blank" rel="noopener">${icon('globe')}<span><b style="font-weight:500">${esc(n)}</b><br><span class="muted small">${esc(d)}</span></span></a>`).join('')}</div>`)}
  </div>`;
};
BIND.impact = m => m.querySelectorAll('[data-q]').forEach(c => c.onchange = () => doQuest(+c.dataset.q));

/* badges */
// 24 ranks, lowest to highest. Bronze and Silver are "Regular"; Gold and above are "Elite".
const RANK_FAMILIES = [['Bronze', '#c98a5a', ['III', 'II', 'I']], ['Silver', '#b9bfcc', ['V', 'IV', 'III', 'II', 'I']], ['Gold', '#f2c46d', ['V', 'IV', 'III', 'II', 'I']],
  ['Platinum', '#45d3b0', ['IV', 'III', 'II', 'I']], ['Master', '#b57bff', ['IV', 'III', 'II', 'I']], ['Champion', '#6f8dff', ['II', 'I']], ['Challenger', '#ff6b6b', ['']]];
const RANKS = RANK_FAMILIES.flatMap(([fam, color, nums]) => nums.map(num => ({name:num ? `${fam} ${num}` : fam, fam, num, color})));
const TOP = RANKS.length - 1, ELITE_FROM = RANKS.findIndex(r => r.fam === 'Gold');
const rankGroup = i => i >= ELITE_FROM ? 'Elite' : 'Regular';
function ladder(start, max, curve = 2) { // the amount needed for each of the 24 ranks
  const t = [];
  for (let i = 0; i <= TOP; i++) { let v = Math.round(start + (max - start) * Math.pow(i / TOP, curve)); if (i && v <= t[i - 1]) v = t[i - 1] + 1; t.push(v); }
  return t;
}
const LESSON_TOTAL = Object.values(TRACKS).reduce((a, t) => a + t.modules.reduce((b, m) => b + m.l.length, 0), 0);
function bestStreak() {
  const days = new Set(S.log.filter(x => x.cat === 'learn' && x.m > 0).map(x => x.d));
  Object.entries(S.quests).forEach(([d, q]) => { if (q.length) days.add(d); });
  let best = 0, run = 0, prev = null;
  for (const d of [...days].sort()) { const t = Date.parse(d + 'T12:00'); run = prev !== null && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  return best;
}
function goalDays() { const by = {}; S.log.forEach(x => { if (x.cat === 'learn') by[x.d] = (by[x.d] || 0) + x.m; }); return Object.values(by).filter(m => m >= Math.max(1, S.goals.learn)).length; }
const BADGES = [
  {name:'Focus Master', icon:'focus', unit:'focus sessions', t:ladder(1, 500), v:() => S.focus.count},
  {name:'Scholar', icon:'study', unit:'lessons', t:ladder(1, LESSON_TOTAL, 1), v:() => Object.keys(S.lessons).length},
  {name:'Goal Getter', icon:'star', unit:'days at your learning goal', t:ladder(1, 365), v:goalDays},
  {name:'On Fire', icon:'balance', unit:'day best streak', t:ladder(2, 365), v:bestStreak},
  {name:'World Helper', icon:'impact', unit:'good deeds', t:ladder(1, 500), v:() => S.questsTotal},
  {name:'Gamer', icon:'gaming', unit:'hours played', t:ladder(1, 1000), v:() => Math.floor(S.log.filter(x => x.cat === 'play').reduce((a, x) => a + x.m, 0) / 60)},
  {name:'Completionist', icon:'play', unit:'games finished', t:ladder(1, 60), v:() => S.backlog.filter(b => b.status === 'finished').length},
  {name:'Series Buff', icon:'series', unit:'episodes', t:ladder(1, 1500), v:() => S.stats.episodes},
  {name:'Video Learner', icon:'youtube', unit:'learning videos', t:ladder(1, 300), v:() => S.yt.filter(y => y.watched && y.kind === 'learn').length},
  {name:'Level Up', icon:'badge', unit:'level', t:ladder(2, MAX_LEVEL), v:() => level().lv},
];
function badgeState(b) {
  if (isOwner) return {tier:TOP, val:b.unit === 'level' ? OWNER_LEVEL : b.t[TOP], next:null};
  const val = b.v(); let tier = -1; b.t.forEach((x, i) => { if (val >= x) tier = i; });
  return {tier, val, next:tier < TOP ? b.t[tier + 1] : null};
}
VIEWS.badges = () => {
  const L = level(), u = me(), st = BADGES.map(b => [b, badgeState(b)]);
  const earned = st.filter(([, x]) => x.tier >= 0).length + (isOwner || isAdmin ? 1 : 0), tops = st.filter(([, x]) => x.tier === TOP).length, elites = st.filter(([, x]) => x.tier >= ELITE_FROM).length;
  const total = BADGES.length + (isOwner || isAdmin ? 1 : 0);
  return `<div class="grid">
  ${card('c12', '', `${(isOwner || isAdmin) && M.banner ? `<div class="pc-banner">${pic(M.banner, M.bannerVid)}</div>` : ''}<div class="pc">
    <span class="avatar big${isOwner ? ' gold' : isAdmin ? ' blue' : ''}">${avatarInner()}</span>
    <div class="grow"><div class="row" style="gap:10px"><h2>${emo(displayName())}</h2>${isOwner ? `<span class="tag owner">${icon('crown')}Owner</span>` : isAdmin ? `<span class="tag adm">${icon('shield')}Admin</span>` : ''}${u ? '' : '<span class="tag">Guest</span>'}</div>
      <p class="muted" style="margin:4px 0 12px">Level ${L.lv}${L.max ? ' (max)' : ''} · ${earned}/${total} badges · ${elites} Elite · ${tops} Challenger</p>
      <div class="meter" style="max-width:440px"><i style="width:${L.max ? 100 : L.xp / L.need * 100}%"></i></div>
      <p class="muted small" style="margin:6px 0 0">${L.max ? 'Max level reached. Legendary.' : `${L.xp} / ${L.need} XP to level ${L.lv + 1}`}</p></div>
    ${u ? '' : '<button class="btn primary" data-open-auth="signup">Create account</button>'}</div>`)}
  ${studioCards()}
  ${aboutCard()}
  ${achievementsCard()}
  ${card('c12', 'Badges', `<div class="badges">
    ${isOwner ? `<div class="badge-tile tier-owner"><span class="medal">${icon('crown')}</span><b>Founder</b><span class="tier">Owner only</span><p class="muted small">Created LevelUp Life.</p></div>` : isAdmin ? `<div class="badge-tile tier-admin"><span class="medal">${icon('shield')}</span><b>Admin</b><span class="tier">Given by the owner</span><p class="muted small">Trusted helper of LevelUp Life.</p></div>` : ''}
    ${st.map(([b, x]) => { const r = RANKS[x.tier], nx = RANKS[x.tier + 1];
      return `<div class="badge-tile ${x.tier < 0 ? 'locked' : `rank${x.tier >= ELITE_FROM ? ' elite' : ''}${x.tier === TOP ? ' top' : ''}`}"${r ? ` style="--tc:${r.color}"` : ''}>
      <span class="medal">${icon(b.icon)}${r && r.num ? `<i class="num">${r.num}</i>` : ''}</span><b>${b.name}</b><span class="tier">${r ? `${r.name} · ${rankGroup(x.tier)}` : 'Locked'}</span>
      <p class="muted small">${b.unit === 'level' ? (x.next == null ? `Top rank · Level ${x.val}` : `Level ${x.val} of ${x.next} for ${nx.name}`) : x.next == null ? `Top rank · ${x.val} ${b.unit}` : `${Math.min(x.val, x.next)} / ${x.next} ${b.unit} for ${nx.name}`}</p>
      ${x.next == null ? '' : `<div class="meter"><i style="width:${Math.min(100, x.val / x.next * 100)}%"></i></div>`}</div>`; }).join('')}
  </div>`, `<span class="tag p">${tops}/${BADGES.length} Challenger</span>`)}
  ${card('c12', 'How ranks work', `<div class="rank-ladder"><div><b>Regular</b><div class="legend">${RANK_FAMILIES.slice(0, 2).map(([n, c, ns]) => `<span><i style="background:${c}"></i>${n} ${ns[0]}–${ns[ns.length - 1]}</span>`).join('')}</div></div>
    <div><b>Elite</b><div class="legend">${RANK_FAMILIES.slice(2).map(([n, c, ns]) => `<span><i style="background:${c}"></i>${ns.length > 1 ? `${n} ${ns[0]}–${ns[ns.length - 1]}` : n}</span>`).join('')}</div></div></div>
    <p class="muted small" style="margin:12px 0 0">Every badge climbs ${RANKS.length} ranks, from Bronze III up to Challenger. Numbers count down as you climb: Gold V comes before Gold I. Study, focus, play, watch and help others to rank up. Level ${isOwner ? OWNER_LEVEL : MAX_LEVEL} is the max level.</p>`)}
  </div>`;
};
const emojiMax = () => isOwner ? 250 : 80;
const PACK_PAGES = 3; // chat emoji are shared in up to 3 signed items per role
const IMG_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp';
const MEDIA_ACCEPT = IMG_ACCEPT + ',video/mp4,video/webm,.mp4,.webm';
const liveTag = on => on ? '<span class="tag p">Live</span>' : '';
function studioCards() {
  if (!isOwner && !isAdmin) return ''; // owner and admins only: nobody else gets these controls
  return `${card('c6', 'Customize profile', `
    <div class="studio-row"><span class="avatar big ${isOwner ? 'gold' : 'blue'}">${avatarInner()}</span><div class="grow"><div class="row" style="gap:8px"><b>Profile picture</b>${liveTag(M.pfp && M.pfpLive)}</div><p class="muted small">A picture, an animated GIF/WebP, or a short MP4/WebM clip. Up to 8 MB.</p>
      <div class="row"><label class="btn sm primary">${icon('upload')}Upload<input type="file" id="upPfp" accept="${MEDIA_ACCEPT}" hidden></label>${M.pfp ? '<button class="btn sm" id="rmPfp">Remove</button>' : ''}</div></div></div>
    <div class="studio-row"><div class="banner-thumb">${M.banner ? pic(M.banner, M.bannerVid) : '<span class="muted small">No banner</span>'}</div><div class="grow"><div class="row" style="gap:8px"><b>Banner</b>${liveTag(M.banner && M.bannerLive)}</div><p class="muted small">A picture, an animated GIF/WebP, or a short MP4/WebM clip. Wide (3:1) looks best. Up to 15 MB.</p>
      <div class="row"><label class="btn sm primary">${icon('upload')}Upload<input type="file" id="upBanner" accept="${MEDIA_ACCEPT}" hidden></label>${M.banner ? '<button class="btn sm" id="rmBanner">Remove</button>' : ''}</div></div></div>
    <p class="err" id="studioErr" role="alert"></p>`, isOwner ? `<span class="tag owner">${icon('crown')}Owner only</span>` : `<span class="tag adm">${icon('shield')}Admin perk</span>`)}
  ${card('c6', 'Custom emoji', `<form class="row" id="emoForm"><input id="emoName" maxlength="26" placeholder="Name, e.g. gg" aria-label="Emoji name"><label class="btn primary">${icon('upload')}Choose image<input type="file" id="emoFile" accept="${IMG_ACCEPT}" hidden></label></form>
    <p class="muted small">Still images and animated GIFs both work (up to 2 MB). Type <b>:name:</b> in tasks, game, series or video titles to use one. Click an emoji to copy its code.</p>
    <p class="err" id="emoErr" role="alert"></p>
    <div class="emoji-grid">${S.emoji.filter(e => M.emoji.has(e.name)).map(e => `<div class="emo-tile"><button type="button" class="emo-copy" data-copy=":${e.name}:" title="Copy :${e.name}:"><img src="${M.emoji.get(e.name)}" alt=":${e.name}:"></button>
      <span class="small">:${e.name}:</span><span class="tag ${e.live ? 'p' : ''}">${e.live ? 'Live' : 'Still'}</span><button class="iconbtn" data-emodel="${e.id}" aria-label="Delete :${e.name}:">${icon('trash')}</button></div>`).join('') || empty('No emoji yet. Type a name, then choose an image.')}</div>`,
    `<span class="tag p">${S.emoji.length}/${emojiMax()}</span>`)}`;
}
BIND.badges = m => {
  m.querySelectorAll('[data-open-auth]').forEach(b => b.onclick = () => openAuth(b.dataset.openAuth));
  bindAbout();
  if (!isOwner && !isAdmin) return;
  const refresh = async () => { await loadMedia(); paintPlayer(); rerender(); if (S.pub) schedulePublish(3000); };
  const upload = (sel, kind, done) => { const inp = $(sel); inp.onchange = async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return; $('#studioErr').textContent = '';
    try { const {blob, live, gif} = await prepImage(f, kind); await mediaPut(kind, blob); await refresh();
      toast(live ? `${done} (animated)` : gif ? `${done}. This GIF has only one frame, so it can't move.` : done); }
    catch (e) { $('#studioErr').textContent = e && e.message ? e.message : 'Could not save that image in this browser.'; } }; };
  upload('#upPfp', 'pfp', 'Profile picture updated'); upload('#upBanner', 'banner', 'Banner updated');
  const remove = (sel, kind) => { const b = $(sel); if (b) b.onclick = async () => { await mediaDel(kind).catch(() => {}); await refresh(); }; };
  remove('#rmPfp', 'pfp'); remove('#rmBanner', 'banner');
  $('#emoForm').onsubmit = e => { e.preventDefault(); $('#emoFile').click(); };
  $('#emoFile').onchange = async () => {
    const f = $('#emoFile').files[0]; $('#emoFile').value = ''; const err = $('#emoErr'); err.textContent = ''; if (!f) return;
    const name = $('#emoName').value.trim().toLowerCase().replace(/^:+|:+$/g, '');
    if (!/^[a-z0-9_]{2,24}$/.test(name)) return err.textContent = 'Type a name first: 2–24 letters, numbers or _.';
    if (S.emoji.some(x => x.name === name)) return err.textContent = `:${name}: already exists. Pick another name.`;
    if (S.emoji.length >= emojiMax()) return err.textContent = `You have ${emojiMax()} emoji, the limit. Delete one first.`;
    try { const {blob, live} = await prepImage(f, 'emoji'); const id = uid(); await mediaPut('emoji:' + id, blob); S.emoji.push({id, name, live}); save(); await refresh(); toast(`:${name}: added`); publishPack(); }
    catch (e) { err.textContent = e && e.message ? e.message : 'Could not save that image in this browser.'; }
  };
  m.querySelectorAll('[data-emodel]').forEach(b => b.onclick = async () => { const id = b.dataset.emodel; await mediaDel('emoji:' + id).catch(() => {}); S.emoji = S.emoji.filter(x => x.id !== id); save(); await refresh(); publishPack(); });
  m.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const t = b.dataset.copy; try { navigator.clipboard.writeText(t).then(() => toast(`Copied ${t}`), () => toast(`Type ${t} to use it`)); } catch { toast(`Type ${t} to use it`); } });
};

/* ---------- global chat ----------
   Messages live in the site's "ChatMessages" CMS collection. Each one is encrypted (AES-GCM) with a key made from
   the invite code, and the room id is a hash of the code, so people without the code can't read anything.
   Owner messages and moderation commands carry an ECDSA signature that only the owner key can unlock. */
const CLIENT_ID = '71e92457-9a77-4b96-8d3c-a3281c3bff9d', WIXAPI = 'https://www.wixapis.com', CHAT_COLLECTION = 'ChatMessages';
const OWNER_PUB = {kty:'EC', crv:'P-256', x:'ma-DToNSntWdY15Mzs0SiekvTY7ZksgqcQ-bzmmUeac', y:'ZNbj3BV7ZhJ5AOiQ5Fo4vq1kBxXgQx4agmWm1iJXaxk'};
const ADMIN_PUB = {kty:'EC', crv:'P-256', x:'Hhfg94hdlSzMIq-q5QPja6-g4QABpyyGG8YIkC-L_q8', y:'y0OKsbfvv52pjvdLZjDUo7RpcCoHqGZigaJUyO9XNB0'};
const ADMIN_SIGN = {iv:'j2EetQUY69XI2nW8', ct:'/xNJjFunfcYfKWcdf0dRusOvJDGxruea9LvY/zr+qWSQiEy60TOBEjQb3Ai+NvQ5piQ7Yoao8KV4Bnc='}; // admin signing key, encrypted with the admin key
const OWNER_SIGN = {iv:'BRZCj5rnw4C7weNb', ct:'+2C9W2x1RbaVVtMoK1LZmSmDqSVmx6tLonfZgtV/jSY4tBQlntUllBOL+N2o4ZnSd5S3djR1z1Tnia0='}; // the owner's private signing key, encrypted with the owner key
const b64 = u => { let s = ''; for (const b of new Uint8Array(u)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const C = {room:'', key:null, timer:null, msgs:[], token:'', tokenExp:0, signKey:null, adminSignKey:null, pubKey:null, adminPubKey:null, lastSend:0, status:'', loading:false, muted:new Map(), autoTried:false, pv:new Map()};
const normCode = c => String(c).trim().toLowerCase().replace(/\s+/g, ' ');
async function unlockSignKey(key) {
  try {
    const base = await crypto.subtle.importKey('raw', enc.encode(normKey(key)), 'PBKDF2', false, ['deriveKey']);
    const aes = await crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:enc.encode('levelup-sign-v1'), iterations:200000}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
    const d = new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(OWNER_SIGN.iv)}, aes, unb64(OWNER_SIGN.ct)));
    const k = await crypto.subtle.importKey('jwk', {...OWNER_PUB, d}, {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
    C.signKey = k; try { await mediaPut('signkey', k); } catch {}
    try { await mediaPut('ownerdh', await crypto.subtle.importKey('jwk', {kty:'EC', crv:'P-256', x:OWNER_PUB.x, y:OWNER_PUB.y, d}, {name:'ECDH', namedCurve:'P-256'}, false, ['deriveKey'])); } catch {} // to open reports
    return true;
  } catch { return false; }
}
async function unlockAdminSignKey(key) {
  try {
    const base = await crypto.subtle.importKey('raw', enc.encode(normKey(key)), 'PBKDF2', false, ['deriveKey']);
    const aes = await crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:enc.encode('levelup-admin-sign-v1'), iterations:200000}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
    const d = new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(ADMIN_SIGN.iv)}, aes, unb64(ADMIN_SIGN.ct)));
    const k = await crypto.subtle.importKey('jwk', {...ADMIN_PUB, d}, {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
    C.adminSignKey = k; try { await mediaPut('adminsignkey', k); } catch {}
    try { await mediaPut('admindh', await crypto.subtle.importKey('jwk', {kty:'EC', crv:'P-256', x:ADMIN_PUB.x, y:ADMIN_PUB.y, d}, {name:'ECDH', namedCurve:'P-256'}, false, ['deriveKey'])); } catch {} // to open reports
    return true;
  } catch { return false; }
}
async function chatToken(force) {
  if (!force && C.token && Date.now() < C.tokenExp) return C.token;
  const r = await fetch(WIXAPI + '/oauth2/token', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({clientId:CLIENT_ID, grantType:'anonymous'})});
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json(); C.token = j.access_token; C.tokenExp = Date.now() + ((j.expires_in || 3600) - 60) * 1000;
  return C.token;
}
async function chatApi(path, body) {
  for (let i = 0; i < 2; i++) {
    const r = await fetch(WIXAPI + path, {method:'POST', headers:{'Content-Type':'application/json', Authorization:await chatToken(i > 0)}, body:JSON.stringify(body)});
    if (r.ok) return r.json();
    if (r.status !== 401 && r.status !== 403) throw new Error('chat ' + r.status);
  }
  throw new Error('chat auth');
}
async function joinRoom(code) {
  const n = normCode(code);
  C.room = (await sha256('levelup-room-v1|' + n)).slice(0, 40);
  const base = await crypto.subtle.importKey('raw', enc.encode(n), 'PBKDF2', false, ['deriveKey']);
  C.key = await crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:enc.encode('levelup-chat-v1'), iterations:100000}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  C.msgs = []; C.status = 'Loading messages…'; C.muted = new Map();
}
function leaveRoom() { stopChat(); C.room = ''; C.key = null; C.msgs = []; }
const sigText = m => [C.room, m.k, m.n, m.t, m.ref || '', m.ts].join('|');
async function sealMsg(m) {
  if (isOwner && C.signKey) m.sig = b64(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, C.signKey, enc.encode(sigText(m))));
  else if (isAdmin && C.adminSignKey) m.asig = b64(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, C.adminSignKey, enc.encode(sigText(m))));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return b64(iv) + '.' + b64(await crypto.subtle.encrypt({name:'AES-GCM', iv}, C.key, enc.encode(JSON.stringify(m))));
}
async function openMsg(item) {
  const d = item.data || {}, p = String(d.payload || '');
  if (p.length > 8000 || !p.includes('.')) return null;
  const [iv, ct] = p.split('.');
  const m = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(iv)}, C.key, unb64(ct))));
  if (!m || typeof m.n !== 'string' || typeof m.t !== 'string') return null;
  const v = {k:['msg', 'hide', 'mute', 'unmute'].includes(m.k) ? m.k : 'msg', n:m.n.slice(0, 24), t:m.t.slice(0, 500), ref:typeof m.ref === 'string' ? m.ref.slice(0, 64) : '', ts:m.ts, id:String(item.id || d._id || '')};
  if (typeof m.u === 'string' && /^[a-z0-9_]{3,20}$/.test(m.u) && typeof m.ps === 'string' && m.ps.length < 200) { v.u = m.u; v.ps = m.ps; if (C.pv.has(v.id)) v.pv = C.pv.get(v.id); }
  v.at = Date.parse((d._createdDate && d._createdDate.$date) || '') || 0;
  v.owner = false;
  if (typeof m.sig === 'string') try {
    C.pubKey ||= await crypto.subtle.importKey('jwk', OWNER_PUB, {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
    v.owner = await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, C.pubKey, unb64(m.sig), enc.encode(sigText({...v, ref:v.ref})));
  } catch {}
  v.admin = false;
  if (!v.owner && typeof m.asig === 'string') try {
    C.adminPubKey ||= await crypto.subtle.importKey('jwk', ADMIN_PUB, {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
    v.admin = await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, C.adminPubKey, unb64(m.asig), enc.encode(sigText(v)));
  } catch {}
  return v;
}
async function pullChat() {
  if (!C.room || C.loading) return; C.loading = true;
  try {
    const j = await chatApi('/wix-data/v2/items/query', {dataCollectionId:CHAT_COLLECTION, query:{filter:{room:C.room}, sort:[{fieldName:'_createdDate', order:'DESC'}], paging:{limit:100}}});
    const all = [];
    for (const it of j.dataItems || []) { try { const m = await openMsg(it); if (m) all.push(m); } catch {} }
    all.sort((a, b) => a.at - b.at);
    // only signed commands count. Owner commands apply to anyone; admin commands only to regular members.
    const ownerNames = new Set(all.filter(m => m.owner).map(m => m.n.toLowerCase()));
    const adminNames = new Set(all.filter(m => m.admin).map(m => m.n.toLowerCase()));
    const staff = n => ownerNames.has(n) || adminNames.has(n);
    const byId = new Map(all.map(m => [m.id, m]));
    const hidden = new Set(), muted = new Map(); // name -> 'owner' | 'admin' (who muted them)
    for (const m of all) {
      if (!m.owner && !m.admin) continue;
      const ref = m.ref.toLowerCase(), target = byId.get(m.ref);
      if (m.k === 'hide' && (m.owner || (target && !target.owner && !target.admin))) hidden.add(m.ref);
      if (m.k === 'mute') { if (m.owner) muted.set(ref, 'owner'); else if (!staff(ref) && muted.get(ref) !== 'owner') muted.set(ref, 'admin'); }
      if (m.k === 'unmute' && (m.owner || muted.get(ref) === 'admin')) muted.delete(ref);
    }
    C.muted = muted;
    C.modlog = all.filter(m => (m.owner || m.admin) && m.k !== 'msg').map(m => ({a:m.k, u:m.k === 'hide' ? ((byId.get(m.ref) || {}).n || 'a message') : m.ref, by:m.n, role:m.owner ? 'owner' : 'admin', ts:m.at, chat:true}));
    C.msgs = all.filter(m => { if (m.k !== 'msg' || hidden.has(m.id)) return false; const n = m.n.toLowerCase();
      if (m.owner) return true;
      if (m.admin) return muted.get(n) !== 'owner';
      return !muted.has(n) && !staff(n) && !/owner|admin/i.test(n); });
    C.status = '';
  } catch { C.status = "Can't reach the chat right now. Trying again…"; }
  C.loading = false; paintChat();
  linkChat(); loadPacks();
}
async function postChat(m) {
  const payload = await sealMsg(m);
  await chatApi('/wix-data/v2/items', {dataCollectionId:CHAT_COLLECTION, dataItem:{data:{room:C.room, payload}}});
  await pullChat();
}
function startChat() { stopChat(); pullChat(); C.timer = setInterval(() => { if (document.visibilityState === 'visible') pullChat(); }, 4000); }
function stopChat() { clearInterval(C.timer); C.timer = null; }
const fmtTime = t => { if (!t) return ''; const d = new Date(t); const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); return today(d) === today() ? time : `${d.toLocaleDateString([], {month:'short', day:'numeric'})} ${time}`; };
const canMod = () => (isOwner && !!C.signKey) || (isAdminOnly() && !!C.adminSignKey);
const canHide = m => isOwner ? true : !m.owner && !m.admin;
const canMute = m => !m.owner && (isOwner || !m.admin);
const canUnmute = by => isOwner || by === 'admin';
function paintChat() {
  const list = $('#chatList'); if (!list) return;
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  list.innerHTML = C.msgs.map(m => { const p = chatPlayer(m), cm = ` data-cm="${esc(m.id)}"`; // every name opens a profile card (with Add friend)
    return `<li class="msg${m.owner ? ' own' : m.admin ? ' adm' : ''}"><button type="button" class="thumb"${cm} style="--h:${m.owner ? '#f2c46d' : m.admin ? '#6f8dff' : hue(m.n)}" aria-label="Open ${esc(m.n)}'s profile">${p && p.pf ? shared(p.pf) : m.owner ? icon('crown') : m.admin ? icon('shield') : esc(m.n.charAt(0).toUpperCase())}</button>
    <div class="grow"><div class="msg-h"><button type="button" class="name-btn"${cm} title="View profile · add friend"><b>${esc(m.n)}</b></button>${m.owner ? '<span class="tag owner">Owner</span>' : m.admin ? '<span class="tag adm">Admin</span>' : ''}<span class="dim small">${fmtTime(m.at)}</span>
    <span class="msg-tools">${canMod() && canHide(m) ? `<button type="button" class="linkbtn small" data-hide="${esc(m.id)}">Hide</button>` : ''}${canMod() && canMute(m) ? `<button type="button" class="linkbtn small" data-mute="${esc(m.n)}">Mute</button>` : ''}${m.n !== displayName() && !m.owner ? `<button type="button" class="linkbtn small rep-btn" data-repmsg="${esc(m.id)}" aria-label="Report this message">Report</button>` : ''}</span></div>
    <div class="msg-t${EMO_ONLY.test(m.t) ? ' big' : ''}" translate="no">${emoWith(m.t, chatEmoji(m))}</div></div></li>`; }).join('') || `<li class="empty">${C.status ? '' : 'No messages yet. Say hi!'}</li>`;
  if (near) list.scrollTop = list.scrollHeight;
  $('#chatStatus').textContent = C.status || `Encrypted room · ${C.msgs.length} message${C.msgs.length === 1 ? '' : 's'} · updates every 4 seconds`;
  const ml = $('#mutedList');
  if (ml) ml.innerHTML = [...C.muted].map(([n, by]) => canUnmute(by) ? `<button type="button" class="chip" data-unmute="${esc(n)}" title="Unmute">${esc(n)} ×</button>` : `<span class="chip" title="Muted by the owner">${esc(n)}</span>`).join('') || '<span class="muted small">Nobody is muted.</span>';
}
const CHAT_RULES = `<ul class="tips">
  <li>Be kind. No bullying, hate or spam.</li>
  <li>Never share personal info: your real name, address, school, phone number or passwords.</li>
  <li>Don't click links from people you don't know.</li>
  <li>The owner and admins can hide messages and mute names for everyone.</li>
  <li>Click a name to open that player's profile (players with a public profile).</li>
  <li>See something wrong? Press <b>Report</b> on a message. Only the owner and admins can read reports.</li>
  <li>Names with "owner" or "admin" in them can't post.</li></ul>`;
VIEWS.chat = () => {
  if (!C.room) return `<div class="grid">
  ${card('c7', 'Join the chat', `<p class="muted" style="margin-top:-6px">The chat is private. Enter the invite code you got from the owner. Messages are encrypted with the code, so only people who have it can read them.</p>
    <form class="row" id="joinForm"><input id="joinCode" type="password" maxlength="64" autocomplete="off" placeholder="Invite code" aria-label="Invite code"><button class="btn primary">Join</button></form>
    <p class="err" id="joinErr" role="alert"></p>
    ${isOwner ? `<p class="muted small">You're the owner: make a code, join with it, then share it only with people you trust. A new code opens a new, empty room.</p><button type="button" class="btn" id="newCode">${icon('plus')}Make an invite code</button>` : ''}`)}
  ${card('c5', 'Chat rules', CHAT_RULES)}</div>`;
  return `<div class="grid">
  ${card('c8', 'Global chat', `<ul class="chat-list" id="chatList" aria-live="polite"></ul>
    <form class="row chat-send" id="chatForm">${emojiPicker()}<button type="button" class="iconbtn" id="emoBtn" aria-label="Emoji" aria-expanded="false" title="Emoji">${icon('smile')}</button><input id="chatIn" maxlength="500" autocomplete="off" placeholder="Message as ${esc(displayName())}" aria-label="Message"><button class="btn primary">Send</button></form>
    <p class="muted small" id="chatStatus"></p>
    ${isOwner && !C.signKey ? `<form class="row" id="signForm"><input id="signKeyIn" type="password" autocomplete="off" placeholder="Owner key" aria-label="Owner key"><button class="btn">Enable my crown</button></form><p class="muted small">Enter your owner key once on this device so your messages get the crown and you can hide and mute.</p>` : ''}
    ${isAdminOnly() && !C.adminSignKey ? `<form class="row" id="signForm"><input id="signKeyIn" type="password" autocomplete="off" placeholder="Admin key" aria-label="Admin key"><button class="btn">Enable my admin tag</button></form><p class="muted small">Enter your admin key once on this device so your messages get the Admin tag and you can hide and mute.</p>` : ''}`,
    `<span class="tag p">Encrypted</span>`)}
  <div class="c4" style="display:grid;gap:22px;align-content:start">
  ${card('', 'Room', `<p class="muted small" style="margin-top:-6px">Everyone with the same invite code is in this room.</p>
    <div class="row"><button type="button" class="btn sm" id="copyCode">Copy invite code</button><button type="button" class="btn sm" id="leaveChat">Leave</button></div>
    ${canMod() ? `<p class="small" style="margin:16px 0 8px"><b>Muted names</b></p><div class="row" id="mutedList"></div>` : ''}`)}
  ${card('', 'Chat rules', CHAT_RULES)}
  </div></div>`;
};
BIND.chat = () => {
  if (!C.room) {
    $('#joinForm').onsubmit = async e => {
      e.preventDefault(); const code = $('#joinCode').value;
      if (normCode(code).length < 6) return $('#joinErr').textContent = 'Invite codes are at least 6 characters.';
      await joinRoom(code); S.chatCode = code.trim().slice(0, 64); save(); rerender();
    };
    const nc = $('#newCode'); if (nc) nc.onclick = () => { const i = $('#joinCode'); i.value = `lvl-${randHex(3)}-${randHex(3)}-${randHex(3)}`; i.type = 'text'; toast('Code made. Press Join, then share it.'); };
    if (S.chatCode && !C.autoTried) { C.autoTried = true; joinRoom(S.chatCode).then(rerender).catch(() => {}); }
    return;
  }
  if (isOwner && !C.signKey) mediaGet('signkey').then(k => { if (k && !C.signKey) { C.signKey = k; rerender(); } }).catch(() => {});
  if (isAdminOnly() && !C.adminSignKey) mediaGet('adminsignkey').then(k => { if (k && !C.adminSignKey) { C.adminSignKey = k; rerender(); } }).catch(() => {});
  paintChat(); startChat();
  $('#chatForm').onsubmit = async e => {
    e.preventDefault(); const inp = $('#chatIn');
    const t = inp.value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500); if (!t) return;
    const n = displayName().slice(0, 24);
    if (!isOwner && !(isAdmin && C.adminSignKey) && /owner|admin/i.test(n)) return toast('Names with "owner" or "admin" can\'t post. Change your nickname in Settings.');
    if (Date.now() - C.lastSend < 2500) return toast('Slow down a little.');
    C.lastSend = Date.now(); inp.value = ''; $('#emoPick').hidden = true;
    try {
      const m = {k:'msg', n, t, ts:Date.now()};
      if (S.pub && me()) { m.u = myU(); m.ps = await signText((await profileKey()).priv, sigText(m) + '|' + m.u); } // links your name to your profile
      await postChat(m); S.stats.chat++; save();
    } catch { inp.value = t; toast("Couldn't send. Check your connection and try again."); }
  };
  const pick = $('#emoPick'), eb = $('#emoBtn');
  eb.onclick = () => { pick.hidden = !pick.hidden; eb.setAttribute('aria-expanded', String(!pick.hidden)); };
  pick.onclick = e => { const b = e.target.closest('[data-ins]'); if (!b) return; const inp = $('#chatIn'), s = b.dataset.ins;
    const a = inp.selectionStart ?? inp.value.length, z = inp.selectionEnd ?? a, sp = s.startsWith(':') && a && inp.value[a - 1] !== ' ' ? ' ' : '';
    const v = inp.value.slice(0, a) + sp + s + inp.value.slice(z); if (v.length > 500) return toast('Message is too long');
    inp.value = v; const c = a + sp.length + s.length; inp.focus(); inp.setSelectionRange(c, c); };
  document.addEventListener('click', function closePick(e) { if (!document.body.contains(pick)) return document.removeEventListener('click', closePick);
    if (!pick.hidden && !e.target.closest('#emoPick') && !e.target.closest('#emoBtn')) { pick.hidden = true; eb.setAttribute('aria-expanded', 'false'); } });
  if (isOwner || isAdmin) staffKey().then(k => { if (k) publishPack(); });
  loadPacks(true);
  $('#chatList').onclick = async e => {
    if (!canMod()) return;
    const h = e.target.closest('[data-hide]'), mu = e.target.closest('[data-mute]');
    try {
      if (h) { await postChat({k:'hide', n:displayName(), t:'', ref:h.dataset.hide, ts:Date.now()}); toast('Message hidden for everyone'); }
      if (mu) { await postChat({k:'mute', n:displayName(), t:'', ref:mu.dataset.mute.toLowerCase(), ts:Date.now()}); toast(`${mu.dataset.mute} is muted`); }
    } catch { toast("Couldn't reach the chat. Try again."); }
  };
  const ml = $('#mutedList'); if (ml) ml.onclick = async e => { const b = e.target.closest('[data-unmute]'); if (!b) return;
    try { await postChat({k:'unmute', n:displayName(), t:'', ref:b.dataset.unmute, ts:Date.now()}); toast(`${b.dataset.unmute} can post again`); } catch { toast("Couldn't reach the chat. Try again."); } };
  $('#copyCode').onclick = () => { try { navigator.clipboard.writeText(S.chatCode).then(() => toast('Invite code copied'), () => toast(`Code: ${S.chatCode}`)); } catch { toast(`Code: ${S.chatCode}`); } };
  $('#leaveChat').onclick = () => { leaveRoom(); S.chatCode = ''; save(); rerender(); };
  const sf = $('#signForm'); if (sf) sf.onsubmit = async e => { e.preventDefault(); toast('Checking key…');
    const ok = isOwner ? await unlockSignKey($('#signKeyIn').value) : await unlockAdminSignKey($('#signKeyIn').value);
    if (ok) { toast(isOwner ? 'Crown enabled' : 'Admin tag enabled'); rerender(); } else toast('That key is not right.'); };
};

/* ---------- players: public profiles, leaderboard and friends ----------
   Opt-in. Each public player has ONE item in the site's "Players" CMS collection (id "p-<username>") that they update in place.
   It is signed with a key made on the player's own device (the private half never leaves it), so nobody else can change a
   profile without the change being rejected. Owner/admin status is proven with the owner/admin signing key. There is no
   server, so level and XP are self-reported: the owner and admins can hide cheaters from the leaderboard. */
const PLAYERS = 'Players', USER_OK = /^[a-z0-9_]{3,20}$/, DATA_IMG = /^data:image\/(webp|png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/;
const DATA_MEDIA = /^data:(image\/(webp|png|jpeg|gif)|video\/webm);base64,[A-Za-z0-9+/=]+$/;
const shared = src => src.startsWith('data:video/') ? `<video src="${src}" autoplay muted loop playsinline disablepictureinpicture aria-hidden="true"></video>` : `<img src="${src}" alt="">`;
const pid = u => 'p-' + u;
const PL = {list:[], by:new Map(), modlog:[], at:0, loading:null, hidden:new Map(), packs:{owner:new Map(), admin:new Map()}, packAt:0, keys:new Map(), status:'', tab:'all', q:'', timer:null};
const TH = {key:'', pf:'', bn:''};
let pubBusy = false, openU = '', openNote = '', openName = '';
const myU = () => me() ? me().username.toLowerCase() : '';
const signText = async (key, text) => b64(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, key, enc.encode(text)));
async function verifyWith(jwk, sig, text) {
  try {
    const id = jwk.x + jwk.y; let k = PL.keys.get(id);
    if (!k) { k = await crypto.subtle.importKey('jwk', {kty:'EC', crv:'P-256', x:jwk.x, y:jwk.y}, {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']); PL.keys.set(id, k); }
    return await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, k, unb64(sig), enc.encode(text));
  } catch { return false; }
}
async function profileKey() { // made once per account on this device; the private key can't be exported
  let k = null; try { k = await mediaGet('profilekey'); } catch {}
  if (k && k.priv && k.x) return k;
  const pair = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, false, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  k = {priv:pair.privateKey, x:pub.x, y:pub.y}; await mediaPut('profilekey', k); return k;
}
async function staffKey() { // ['owner'|'admin', signing key] once the key was entered on this device
  if (isOwner) { if (!C.signKey) try { C.signKey = await mediaGet('signkey') || null; } catch {} return C.signKey ? ['owner', C.signKey] : null; }
  if (isAdmin) { if (!C.adminSignKey) try { C.adminSignKey = await mediaGet('adminsignkey') || null; } catch {} return C.adminSignKey ? ['admin', C.adminSignKey] : null; }
  return null;
}
const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function frameOf(blob) { // the first frame of a picture or a video clip
  if (!blob.type.startsWith('video/')) return createImageBitmap(blob);
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(blob);
  try { await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 6000); }); return v; }
  finally { setTimeout(() => URL.revokeObjectURL(v.src), 2000); }
}
/* Shrink an animation (GIF, animated WebP/PNG, MP4, WebM) into a small looping WebM clip, so a big animated
   profile picture or banner still moves for other players. Returns a data: URL, or '' if this browser can't. */
async function shrinkClip(blob, a, w, h, maxBytes) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return '';
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)); if (!type) return '';
  let draw, dur, iw, ih, cleanup = () => {};
  if (a.video) {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.loop = true; v.src = URL.createObjectURL(blob);
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 8000); });
    await v.play().catch(() => {});
    iw = v.videoWidth; ih = v.videoHeight; dur = Math.min(Math.max(v.duration || 3, 1), 6) * 1000;
    draw = (ctx, sx, sy, sw, sh) => ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    cleanup = () => { v.pause(); URL.revokeObjectURL(v.src); };
  } else if (window.ImageDecoder) {
    const dec = new window.ImageDecoder({data:await blob.arrayBuffer(), type:a.mime}); await dec.tracks.ready;
    const n = Math.min(dec.tracks.selectedTrack.frameCount || 1, 150), frames = []; let t = 0;
    for (let i = 0; i < n && t < 6000; i++) { const {image} = await dec.decode({frameIndex:i}); const d = Math.max(20, (image.duration || 100000) / 1000); frames.push({image, at:t}); t += d; }
    if (frames.length < 2) { frames.forEach(f => f.image.close()); dec.close(); return ''; }
    iw = frames[0].image.displayWidth; ih = frames[0].image.displayHeight; dur = Math.min(Math.max(t, 500), 6000);
    draw = (ctx, sx, sy, sw, sh, ms) => { let f = frames[0]; for (const x of frames) { if (x.at <= ms % t) f = x; else break; } ctx.drawImage(f.image, sx, sy, sw, sh, 0, 0, w, h); };
    cleanup = () => { frames.forEach(f => f.image.close()); dec.close(); };
  } else return '';
  try {
    let sx = 0, sy = 0, sw = iw, sh = ih; const r = w / h; // cover-crop to w:h
    if (iw / ih > r) { sw = ih * r; sx = (iw - sw) / 2; } else { sh = iw / r; sy = (ih - sh) / 2; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
    draw(ctx, sx, sy, sw, sh, 0);
    const rec = new MediaRecorder(c.captureStream(24), {mimeType:type, videoBitsPerSecond:Math.max(60000, Math.floor(maxBytes * 8 * 0.7 / (dur / 1000)))});
    const parts = []; rec.ondataavailable = e => e.data.size && parts.push(e.data);
    const done = new Promise(res => { rec.onstop = res; });
    const t0 = performance.now(); rec.start();
    const iv = setInterval(() => { const ms = performance.now() - t0; draw(ctx, sx, sy, sw, sh, ms); if (ms >= dur) { clearInterval(iv); rec.stop(); } }, 1000 / 24);
    await done;
    const out = new Blob(parts, {type:'video/webm'});
    return out.size > 0 && out.size <= maxBytes ? await blobToDataUrl(out) : '';
  } finally { cleanup(); }
}
async function thumb(blob, w, h, mode, keepMax = 0, clip = false) { // a small copy for sharing; animations stay animated when they can
  if (!blob) return '';
  try {
    const a = await inspectMedia(blob);
    if (a.live && !a.video && blob.size <= keepMax) return await blobToDataUrl(new Blob([blob], {type:a.mime}));
    if (a.live && clip) { const c = await shrinkClip(blob, a, w, h, keepMax).catch(() => ''); if (c) return c; }
    const img = await frameOf(blob), iw = img.videoWidth || img.width, ih = img.videoHeight || img.height;
    let sx = 0, sy = 0, sw = iw, sh = ih, cw = w, ch = h;
    if (mode === 'fit') { const s = Math.min(1, w / iw, h / ih); cw = Math.max(1, Math.round(iw * s)); ch = Math.max(1, Math.round(ih * s)); }
    else { const r = w / h; if (iw / ih > r) { sw = ih * r; sx = (iw - sw) / 2; } else { sh = iw / r; sy = (ih - sh) / 2; } }
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    const out = c.toDataURL('image/webp', .8); return out.startsWith('data:image/webp') ? out : c.toDataURL('image/png');
  } catch { return ''; }
}
const sealed = (d, s) => JSON.stringify({d, s});
const saveItem = (id, kind, payload) => chatApi('/wix-data/v2/items/save', {dataCollectionId:PLAYERS, dataItem:{id, data:{kind, payload}}});
const queryItems = (filter, limit = 100, offset = 0) => chatApi('/wix-data/v2/items/query', {dataCollectionId:PLAYERS, query:{filter, paging:{limit, offset}}}).then(j => j.dataItems || []);
async function readProfile(item) { // a verified public profile, or null
  try {
    const d = item.data || {}, w = JSON.parse(String(d.payload || ''));
    if (typeof w.d !== 'string' || w.d.length > 480000 || typeof w.s !== 'string') return null;
    const p = JSON.parse(w.d);
    if (!p || p.v !== 1 || !USER_OK.test(p.u) || String(item.id || d._id) !== pid(p.u) || typeof p.x !== 'string' || typeof p.y !== 'string') return null;
    if (!(await verifyWith(p, w.s, w.d))) return null;
    if (p.gone) return {u:p.u, gone:true, x:p.x, y:p.y};
    let role = '';
    if ((p.role === 'owner' || p.role === 'admin') && typeof p.rs === 'string' && await verifyWith(p.role === 'owner' ? OWNER_PUB : ADMIN_PUB, p.rs, `role|${p.role}|${p.u}|${p.x}`)) role = p.role;
    const img = v => typeof v === 'string' && DATA_MEDIA.test(v) ? v : '';
    return {u:p.u, n:str(p.n, 24) || p.u, lv:role === 'owner' ? MAX_LEVEL : num(p.lv, 1, 1, MAX_LEVEL), xp:num(p.xp, 0, 0, 1e9),
      rk:BADGES.map((_, i) => role === 'owner' ? TOP : num(arr(p.rk)[i], -1, -1, TOP)),
      fr:[...new Set(arr(p.fr).filter(f => typeof f === 'string' && USER_OK.test(f) && f !== p.u))].slice(0, 200),
      j:isDay(p.j) ? p.j : '', x:p.x, y:p.y, role, pf:role ? img(p.pf) : '', bn:role ? img(p.bn) : '',
      bio:cleanText(str(p.bio, 160), 160), fg:arr(p.fg).filter(g => typeof g === 'string').map(g => cleanText(g, 40)).filter(Boolean).slice(0, 5),
      ac:[...new Set(arr(p.ac).filter(a => typeof a === 'string' && /^[a-z0-9]{2,20}$/.test(a)))].slice(0, 60), wk:isDay(p.wk) ? p.wk : '', wx:num(p.wx, 0, 0, 1e7),
      dx:typeof p.dx === 'string' && /^[\w-]{20,60}$/.test(p.dx) ? p.dx : '', dy:typeof p.dy === 'string' && /^[\w-]{20,60}$/.test(p.dy) ? p.dy : ''};
  } catch { return null; }
}
async function readStaff(item, prefix) { // an item signed with the owner or admin key
  try {
    const d = item.data || {}, w = JSON.parse(String(d.payload || ''));
    if (typeof w.d !== 'string' || w.d.length > 480000 || typeof w.s !== 'string') return null;
    const p = JSON.parse(w.d);
    const pg = num(p && p.page, 1, 1, 9); // emoji packs can span several items
    if (!p || p.v !== 1 || !['owner', 'admin'].includes(p.role) || String(item.id || d._id) !== `${prefix}-${p.role}${pg > 1 ? '-' + pg : ''}`) return null;
    return await verifyWith(p.role === 'owner' ? OWNER_PUB : ADMIN_PUB, w.s, w.d) ? p : null;
  } catch { return null; }
}
async function sharedCopy(kind, w, h, max) { // the small public copy of my picture or banner, cached on this device
  const b = await mediaGet(kind); if (!b) return '';
  const sig = b.size + '|' + b.type + '|' + (await sha256(b64(await b.slice(0, 65536).arrayBuffer())));
  try { const c = await mediaGet('shared:' + kind); if (c && c.sig === sig && typeof c.data === 'string') return c.data; } catch {}
  const data = await thumb(b, w, h, 'cover', max, true);
  if (data) try { await mediaPut('shared:' + kind, {sig, data}); } catch {}
  return data;
}
async function buildProfile() {
  const u = me(), L = level(), k = await profileKey();
  const p = {v:1, u:u.username.toLowerCase(), n:u.username.slice(0, 24), lv:L.lv, xp:isOwner ? 1e9 : S.xp, rk:BADGES.map(b => badgeState(b).tier),
    fr:S.friends.slice(0, 200), j:u.created || '', x:k.x, y:k.y, role:'', rs:'', pf:'', bn:'',
    bio:S.bio, fg:S.favs, ac:Object.keys(S.ach).slice(0, 60), wk:S.wk.id, wx:S.wk.xp};
  try { const dk = await dmKey(); p.dx = dk.x; p.dy = dk.y; } catch {} // for private messages
  const st = isOwner || isAdmin ? await staffKey() : null;
  if (st) {
    p.role = st[0]; p.rs = await signText(st[1], `role|${p.role}|${p.u}|${p.x}`);
    const tk = M.pfp + '|' + M.banner;
    if (TH.key !== tk) { TH.key = tk;
      TH.pf = M.pfp ? await sharedCopy('pfp', 160, 160, 100e3) : '';
      TH.bn = M.banner ? await sharedCopy('banner', 720, 240, 220e3) : ''; }
    p.pf = TH.pf; p.bn = TH.bn;
  }
  return {p, k};
}
function schedulePublish(ms = 15000) { // called from save(); a function declaration so it is ready before anything else runs
  if (!S.pub || !me() || schedulePublish.t) return;
  schedulePublish.t = setTimeout(() => { schedulePublish.t = null; publishProfile(); }, ms);
}
async function publishProfile(force) {
  clearTimeout(schedulePublish.t); schedulePublish.t = null;
  if (!S.pub || !me() || pubBusy) return false; pubBusy = true;
  try {
    const {p, k} = await buildProfile(), h = await sha256(JSON.stringify(p));
    if (!force && h === S.pubHash && Date.now() - S.pubAt < 6 * 3600e3) return true;
    const cur = (await queryItems({_id:pid(p.u)}, 1))[0], old = cur && await readProfile(cur);
    if (old && !old.gone && old.x !== p.x) { // somebody else already uses this username on the leaderboard
      S.pub = false; save(); PL.status = 'taken'; toast(`Another player already uses the name ${me().username} on the leaderboard.`); repaintSocial(); return false;
    }
    p.ts = Date.now(); const d = JSON.stringify(p);
    await saveItem(pid(p.u), 'player', sealed(d, await signText(k.priv, d)));
    S.pubHash = h; S.pubAt = Date.now(); PL.status = ''; PL.at = 0; save(); return true;
  } catch { PL.status = 'offline'; return false; }
  finally { pubBusy = false; }
}
async function unpublishProfile() { // leaves a signed "gone" note, because visitors can't delete items
  if (!me()) return;
  const k = await profileKey(), u = myU(), cur = (await queryItems({_id:pid(u)}, 1))[0], old = cur && await readProfile(cur);
  if (!old || old.x !== k.x) return;
  const d = JSON.stringify({v:1, u, x:k.x, y:k.y, gone:true, ts:Date.now()});
  await saveItem(pid(u), 'player', sealed(d, await signText(k.priv, d)));
  S.pubHash = ''; S.pubAt = 0; save(); PL.at = 0;
}
async function loadPlayers(force) {
  if (!force && PL.at && Date.now() - PL.at < 30000) return PL.list;
  if (PL.loading) return PL.loading;
  PL.loading = (async () => {
    try {
      const items = [];
      for (let off = 0; off < 1000; off += 100) { const got = await queryItems({kind:'player'}, 100, off); items.push(...got); if (got.length < 100) break; }
      const list = [];
      for (const it of items) { const p = await readProfile(it); if (p && !p.gone) list.push(p); }
      const by = new Map(list.map(p => [p.u, p])), hidden = new Map();
      const modlog = [];
      for (const it of await queryItems({kind:'mod'}, 10)) { const m = await readStaff(it, 'mod'); if (!m) continue;
        cleanLog(m.log).forEach(e => modlog.push({...e, role:m.role}));
        for (const u of arr(m.hidden)) { const p = by.get(u); if (!p || p.role === 'owner') continue; if (m.role === 'owner') hidden.set(u, 'owner'); else if (!p.role && !hidden.has(u)) hidden.set(u, 'admin'); } }
      list.sort((a, b) => b.lv - a.lv || b.xp - a.xp || a.n.localeCompare(b.n));
      Object.assign(PL, {list, by, hidden, modlog, at:Date.now(), status:PL.status === 'taken' ? 'taken' : ''}); reqDot(); staffNotice(); socialNotes();
    } catch { PL.status = 'offline'; if (!PL.at) PL.at = 0; }
    finally { PL.loading = null; }
    return PL.list;
  })();
  return PL.loading;
}
const visiblePlayers = () => PL.list.filter(p => !PL.hidden.has(p.u) || p.u === myU());
const levelOf = xp => { let lv = 1, need = xpForNext(1); while (xp >= need && lv < MAX_LEVEL) { xp -= need; lv++; need = xpForNext(lv); } return {lv, xp, need}; };
/* Staff powers: the owner can add anyone as a friend instantly, admins can add regular players instantly.
   A role can only do this to a lower role (owner > admin > player), and roles are proven by signatures. */
const roleRank = r => r === 'owner' ? 2 : r === 'admin' ? 1 : 0;
const canForce = (from, to) => roleRank(from) > 0 && roleRank(from) > roleRank(to);
const myRole = () => isOwner ? 'owner' : isAdmin ? 'admin' : '';
function friendState(u) {
  const me_ = myU(); if (!me_ || u === me_) return 'self';
  const p = PL.by.get(u), mine = S.friends.includes(u), theirs = !!(p && p.fr.includes(me_));
  if (mine && theirs) return 'friends';
  if (mine && canForce(myRole(), p ? p.role : '')) return 'friends'; // I'm staff: no acceptance needed
  if (theirs && canForce(p.role, myRole())) return 'forced';          // staff added me
  return mine ? 'sent' : theirs ? 'incoming' : 'none';
}
const isFriend = s => s === 'friends' || s === 'forced';
const friendRequests = () => { const m = myU(); return m ? PL.list.filter(p => p.fr.includes(m) && !S.friends.includes(p.u) && !S.ignored.includes(p.u) && !PL.hidden.has(p.u) && !canForce(p.role, myRole())) : []; };
function staffNotice() { // tell a player once when the owner or an admin added them
  const m = myU(); if (!m || !PL.at) return;
  const by = PL.list.filter(p => p.fr.includes(m) && canForce(p.role, myRole())).map(p => p.u), fresh = by.filter(u => !S.staffAdds.includes(u));
  if (fresh.length) { const p = PL.by.get(fresh[0]); toast(`${p.n} (${p.role === 'owner' ? 'Owner' : 'Admin'}) added you as a friend`); fresh.forEach(u => { const q = PL.by.get(u); addNote(`${q.n} (${q.role === 'owner' ? 'Owner' : 'Admin'}) added you as a friend`, '#players'); }); }
  if (fresh.length || by.length !== S.staffAdds.length) { S.staffAdds = by.slice(0, 50); save(); }
}
const canHidePlayer = p => !!p && p.u !== myU() && (isOwner ? p.role !== 'owner' : isAdminOnly() && !p.role);
async function changeFriend(u, act) {
  if (!me()) return openAuth('signup');
  const wentPublic = act === 'pubadd' && !S.pub; // the button said "Go public & ...", so this is the user's choice
  if (act === 'pubadd') { S.pub = true; PL.status = ''; act = 'add'; }
  if (!S.pub && (act === 'add')) return toast('Make your profile public first (Players page or Settings), so others can see your request.');
  if (act === 'add') { if (!S.friends.includes(u)) S.friends.push(u); S.ignored = S.ignored.filter(x => x !== u); }
  if (act === 'remove') S.friends = S.friends.filter(x => x !== u);
  if (act === 'ignore') { if (!S.ignored.includes(u)) S.ignored.push(u); S.ignored = S.ignored.slice(-200); }
  save(); repaintSocial();
  if (act !== 'ignore') { const ok = await publishProfile(true); if (!S.pub) { repaintSocial(); return; } // the name was taken
    if (ok && wentPublic) await loadPlayers(true);
    toast(!ok ? "Saved here. It will sync when the leaderboard can be reached." : act === 'add' ? (isFriend(friendState(u)) ? `You and ${u} are now friends!` : `Friend request sent to ${u}${wentPublic ? ' · your profile is now public' : ''}`) : `Removed ${u}`); }
  repaintSocial(); reqDot(); if (wentPublic && current === 'players') rerender();
}
function reqDot() { // a dot on the Players menu item for friend requests (and open reports, for the owner/admins)
  const fr = me() ? friendRequests().length : 0, rp = isOwner || isAdmin ? RP.list.length : 0, n = fr + rp;
  const msg = [fr ? `${fr} friend request${fr === 1 ? '' : 's'}` : '', rp ? `${rp} open report${rp === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
  $$('[data-route="players"], .tile[href="#players"]').forEach(a => { a.classList.toggle('has-req', n > 0); a.title = n ? `Players · ${msg}` : 'Players'; });
}
async function setHidden(u, hide) {
  const st = await staffKey(); if (!st) return toast(`Open Chat and enter your ${isOwner ? 'owner' : 'admin'} key once on this device first.`);
  const [role, key] = st, cur = new Set(S.modHidden); let log = [];
  try {
    for (const it of await queryItems({kind:'mod'}, 10)) { const m = await readStaff(it, 'mod'); if (m && m.role === role) { arr(m.hidden).forEach(x => USER_OK.test(x) && cur.add(x)); log = cleanLog(m.log); } }
    hide ? cur.add(u) : cur.delete(u); S.modHidden = [...cur].slice(-500); save();
    log.push({a:hide ? 'hide' : 'show', u, by:displayName().slice(0, 24), ts:Date.now()});
    const d = JSON.stringify({v:1, role, hidden:S.modHidden, log:log.slice(-100), ts:Date.now()});
    await saveItem('mod-' + role, 'mod', sealed(d, await signText(key, d)));
    await loadPlayers(true); toast(hide ? `${u} is hidden from the leaderboard` : `${u} is back on the leaderboard`);
  } catch { toast("Couldn't reach the leaderboard. Try again."); }
  repaintSocial();
}

/* custom emoji the owner and admins can use in chat: published as one signed item each, so everyone in the room sees them */
async function publishPack() {
  const st = await staffKey(); if (!st) return;
  try {
    const pages = [[]]; let budget = 420e3;
    for (const e of S.emoji) {
      const b = await mediaGet('emoji:' + e.id).catch(() => null); if (!b) continue;
      const src = e.live && b.size <= 48e3 ? await thumb(b, 64, 64, 'fit', 48e3) : await thumb(b, 64, 64, 'fit');
      if (!src || src.length > 420e3) continue;
      if (src.length > budget) { if (pages.length >= PACK_PAGES) continue; pages.push([]); budget = 420e3; }
      budget -= src.length; pages[pages.length - 1].push({n:e.name, src});
    }
    const h = await sha256(st[0] + JSON.stringify(pages)); if (h === S.packHash) return;
    for (let i = 0; i < PACK_PAGES; i++) { if (i >= pages.length && i >= (S.packPages || 1)) break; // empty pages that were used before are cleared
      const d = JSON.stringify({v:1, role:st[0], page:i + 1, list:pages[i] || [], ts:Date.now()});
      await saveItem('emo-' + st[0] + (i ? '-' + (i + 1) : ''), 'emoji', sealed(d, await signText(st[1], d))); }
    S.packHash = h; S.packPages = pages.length; save(); PL.packAt = 0;
  } catch {}
}
async function loadPacks(force) {
  if (!force && Date.now() - PL.packAt < 60000) return; PL.packAt = Date.now();
  try {
    const packs = {owner:new Map(), admin:new Map()}, got = {owner:false, admin:false};
    for (const it of await queryItems({kind:'emoji'}, 10)) { const p = await readStaff(it, 'emo'); if (!p) continue; got[p.role] = true;
      for (const e of arr(p.list)) if (e && /^[a-z0-9_]{2,24}$/.test(e.n) && typeof e.src === 'string' && DATA_IMG.test(e.src)) packs[p.role].set(e.n, e.src); }
    for (const r of ['owner', 'admin']) if (got[r]) PL.packs[r] = packs[r];
    paintChat();
  } catch { PL.packAt = 0; }
}
const EMOJI = [['Faces', '😀 😁 😂 🤣 😊 😍 😎 🤩 🥳 😇 🙂 😉 😜 🤔 🤨 😐 😴 😮 😱 😭 😡 🤯 🥶 🥵 😈 💀 👻 🤖 👽 🙈'],
  ['Hands', '👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👌 🫡 🫶 👀'],
  ['Gaming', '🎮 🕹️ 👾 🏆 🥇 🥈 🥉 🎯 ⚔️ 🛡️ 🏹 💣 🧩 🎲 ♟️ 🚀 ⭐ 🌟 ✨ 💎 👑 🔥 ⚡ 💥 💯 ✅ ❌ ❓'],
  ['Hearts', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💖'],
  ['Things', '📚 💻 📱 🎧 🎬 📺 🍿 🍕 🍔 🥤 ☕ 🎉 🎂 🎁 🌍 🌱 🐱 🐶 🦊 🐉']];
const emoWith = (s, map) => { const h = esc(s); return map && map.size ? h.replace(/:([a-z0-9_]{2,24}):/g, (m, n) => map.has(n) ? `<img class="emoji" src="${map.get(n)}" alt=":${n}:" title=":${n}:">` : m) : h; };
const EMO_ONLY = /^(?:\s*(?::[a-z0-9_]{2,24}:|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)\s*){1,3}$/u;
const chatEmoji = m => m.owner ? (isOwner && M.emoji.size ? M.emoji : PL.packs.owner) : m.admin ? (isAdminOnly() && M.emoji.size ? M.emoji : PL.packs.admin) : null;
function emojiPicker() {
  const mine = (isOwner || isAdmin) ? S.emoji.filter(e => M.emoji.has(e.name)) : [];
  return `<div class="emo-pick" id="emoPick" hidden role="dialog" aria-label="Emoji">
    ${mine.length ? `<p class="emo-h">Your emoji</p><div class="emo-grid">${mine.map(e => `<button type="button" data-ins=":${e.name}:" title=":${e.name}:"><img src="${M.emoji.get(e.name)}" alt=":${e.name}:"></button>`).join('')}</div>` : ''}
    ${EMOJI.map(([h, list]) => `<p class="emo-h">${h}</p><div class="emo-grid">${list.split(' ').map(e => `<button type="button" data-ins="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`).join('')}</div>`;
}
async function linkChat() { // a name in chat links to a profile only when the message was signed by that player's key
  const todo = C.msgs.filter(m => m.u && m.ps && m.pv === undefined); if (!todo.length) return;
  await loadPlayers().catch(() => {});
  let changed = false;
  for (const m of todo) { const p = PL.by.get(m.u); if (!p) continue;
    m.pv = await verifyWith(p, m.ps, sigText(m) + '|' + m.u); C.pv.set(m.id, m.pv); changed = true; }
  if (changed) paintChat();
}

/* profile window */
const roleTag = p => p.role === 'owner' ? `<span class="tag owner">${icon('crown')}Owner</span>` : p.role === 'admin' ? `<span class="tag adm">${icon('shield')}Admin</span>` : '';
const plAvatar = (p, big) => `<span class="avatar${big ? ' big' : ''}${p.role === 'owner' ? ' gold' : p.role === 'admin' ? ' blue' : ''}" style="background:${p.pf ? 'var(--card2)' : hue(p.u)}">${p.pf ? shared(p.pf) : esc(p.n.charAt(0).toUpperCase())}</span>`;
const bestRank = p => { const t = Math.max(-1, ...p.rk); return t < 0 ? 'No badges yet' : `Best rank: ${RANKS[t].name}`; };
const pairFriends = (a, b) => (a.fr.includes(b.u) && (b.fr.includes(a.u) || canForce(a.role, b.role))) || (b.fr.includes(a.u) && canForce(b.role, a.role));
const mutualCount = p => PL.list.filter(q => q !== p && pairFriends(p, q)).length;
function friendButtons(u, sm = '') {
  const s = friendState(u);
  if (s === 'self') return `<a class="btn ${sm}" href="#badges" data-close-pm>Edit my profile</a>`;
  if (s === 'forced') { const p = PL.by.get(u); return `<span class="tag g">${icon('check')}Friends</span><span class="muted small">Added by the ${p && p.role === 'owner' ? 'owner' : 'admin'}</span>`; }
  if (s === 'friends') return `<span class="tag g">${icon('check')}Friends</span><button type="button" class="btn ${sm}" data-fr="remove" data-u="${u}">Remove</button>`;
  if (s === 'sent') return `<span class="tag">Request sent</span><button type="button" class="btn ${sm}" data-fr="remove" data-u="${u}">Cancel</button>`;
  const add = me() && !S.pub ? 'pubadd' : 'add'; // a private player is asked to go public in the same click
  if (s === 'incoming') return `<button type="button" class="btn primary ${sm}" data-fr="${add}" data-u="${u}">${icon('check')}${add === 'pubadd' ? 'Go public & accept' : 'Accept'}</button><button type="button" class="btn ${sm}" data-fr="ignore" data-u="${u}">Decline</button>`;
  return `<button type="button" class="btn primary ${sm}" data-fr="${add}" data-u="${u}">${icon('userplus')}${add === 'pubadd' ? 'Go public & add friend' : 'Add friend'}</button>`;
}
const privateCardHTML = (u, name) => `<div class="pm-body"><div class="row" style="gap:14px;flex-wrap:nowrap"><span class="avatar big" style="background:${hue(u)}">${esc(name.charAt(0).toUpperCase())}</span><div style="min-width:0"><h2>${esc(name)}</h2><p class="muted small" style="margin:2px 0 0">@${esc(u)} · no public profile yet</p></div></div>
  <p class="muted" style="margin:0">${u === myU() ? 'This is you. Make your profile public on the Players page so others can open it and add you.' : isOwner || isAdmin ? `${esc(name)} keeps their profile private. Their stats are stored only on their own device and were never uploaded, so they can't be shown here, not even to the owner. You can still add them: as ${isOwner ? 'the owner' : 'an admin'}, they become your friend right away, no request needed.` : `${esc(name)} hasn't made their profile public, so there are no stats to show yet. You can still send a friend request: they'll see it on their Players page and can accept it there.`}</p>
  ${me() && !S.pub && u !== myU() ? `<p class="muted small" style="margin:0">${SHARED_INFO}</p>` : ''}
  <div class="row">${friendButtons(u)}${u !== myU() ? `<button type="button" class="linkbtn small" data-report="${u}" data-name="${esc(name)}">Report</button>` : ''}</div></div>`;
function profileHTML(u) {
  const p = PL.by.get(u);
  if (!p) return PL.status === 'offline' && !PL.list.length ? `<div class="pm-body"><h2>${esc(u)}</h2><p class="muted">Can't reach the leaderboard right now. Try again in a moment.</p></div>` : privateCardHTML(u, openName || u);
  const vis = visiblePlayers(), pos = vis.indexOf(p) + 1, L = p.role === 'owner' || p.lv >= MAX_LEVEL ? null : levelOf(p.xp), hid = PL.hidden.get(u);
  return `<div class="pm-banner">${p.bn ? shared(p.bn) : ''}</div>
  <div class="pm-head">${plAvatar(p, true)}<div class="grow"><div class="row" style="gap:8px"><h2>${esc(p.n)}</h2>${roleTag(p)}${u === myU() ? '<span class="tag">You</span>' : ''}</div>
    <p class="muted small" style="margin:2px 0 0">@${esc(p.u)}${p.j ? ` · joined ${esc(p.j)}` : ''}</p></div></div>
  <div class="pm-body">
    ${p.bio ? `<p class="pm-bio" translate="no">${esc(p.bio)}</p>` : ''}
    <div class="statrow pm-stats"><div class="stat"><span class="k">Level</span><span class="v">${p.lv}${L ? '' : ' MAX'}</span></div>
      <div class="stat"><span class="k">Leaderboard</span><span class="v">${hid ? 'Hidden' : pos ? '#' + pos : '–'}</span></div><div class="stat"><span class="k">Friends</span><span class="v">${mutualCount(p)}</span></div>
      <div class="stat"><span class="k">This week</span><span class="v">${p.wk === weekId() ? p.wx : 0}<small> XP</small></span></div></div>
    ${p.fg.length ? `<div><p class="small" style="margin:0 0 6px"><b>Favourite games</b></p><div class="row" style="gap:6px">${p.fg.map(g => `<span class="chip" translate="no">${icon('gaming')}${esc(g)}</span>`).join('')}</div></div>` : ''}
    ${p.ac.length ? `<div><p class="small" style="margin:0 0 6px"><b>Achievements</b> <span class="muted">${ACH.filter(a => p.ac.includes(a.id)).length}/${ACH.length}</span></p><div class="pm-ach">${ACH.filter(a => p.ac.includes(a.id)).map(a => `<span class="ach-ic" title="${a.n}: ${a.d}" role="img" aria-label="${a.n}">${icon(a.i)}</span>`).join('')}</div></div>` : ''}
    ${L && L.lv === p.lv ? `<div><div class="meter"><i style="width:${L.xp / L.need * 100}%"></i></div><p class="muted small" style="margin:6px 0 0">${L.xp} / ${L.need} XP to level ${p.lv + 1}</p></div>` : ''}
    <div class="mini-badges">${BADGES.map((b, i) => { const r = RANKS[p.rk[i]]; return `<div class="mini-badge${r ? '' : ' locked'}"${r ? ` style="--tc:${r.color}"` : ''}>${icon(b.icon)}<span><b>${b.name}</b><br><span class="muted">${r ? r.name : 'Locked'}</span></span></div>`; }).join('')}</div>
    <div class="row">${friendButtons(u)}${canDM(p) ? `<a class="btn" href="#messages" data-dmgo="${u}" data-close-pm>${icon('messages')}Message</a>` : ''}${canHidePlayer(p) ? `<button type="button" class="btn danger" data-hidep="${hid ? 'show' : 'hide'}" data-u="${u}">${hid ? 'Show on leaderboard' : 'Hide from leaderboard'}</button>` : ''}${u !== myU() && p.role !== 'owner' ? `<button type="button" class="linkbtn small" data-report="${u}" data-name="${esc(p.n)}">Report</button>` : ''}</div>
    ${hid && u === myU() ? `<p class="err">A moderator hid you from the leaderboard.</p>` : ''}
    ${openNote ? `<p class="muted small" style="margin:0">${esc(openNote)}</p>` : ''}
  </div>`;
}
function ensureProfileModal() {
  let m = $('#playerModal'); if (m) return m;
  m = document.createElement('div'); m.className = 'modal'; m.id = 'playerModal'; m.hidden = true;
  m.innerHTML = `<div class="modal-box glass player-box" role="dialog" aria-modal="true" aria-label="Player profile"><button type="button" class="iconbtn pm-close" aria-label="Close">${icon('x')}</button><div id="pmBody"></div></div>`;
  m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('.pm-close') || e.target.closest('[data-close-pm]')) return closeProfile();
    const h = e.target.closest('[data-hidep]'); if (h) setHidden(h.dataset.u, h.dataset.hidep === 'hide');
  });
  document.body.append(m); return m;
}
async function openProfile(u, note = '', name = '') {
  if (!USER_OK.test(u)) return;
  const m = ensureProfileModal(); if (m.hidden) PM.back = document.activeElement; openU = u; openNote = note; openName = name; m.hidden = false; $('#pmBody').innerHTML = '<div class="pm-body"><p class="muted">Loading profile…</p></div>';
  await loadPlayers(); if (openU === u) $('#pmBody').innerHTML = profileHTML(u);
  const c = m.querySelector('.pm-close'); if (c) c.focus();
}
const PM = {back:null};
function closeProfile() { const m = $('#playerModal'), was = m && !m.hidden; if (m) m.hidden = true; openU = ''; openNote = ''; openName = '';
  if (was && PM.back) { let b = PM.back; // the list may have been redrawn while the window was open: find the same button again
    if (!document.body.contains(b)) { const k = b.dataset && (b.dataset.player || b.dataset.cm); b = k ? $(`[data-player="${CSS.escape(k)}"], [data-cm="${CSS.escape(k)}"]`) : b.id ? $('#' + CSS.escape(b.id)) : null; }
    if (b) try { b.focus(); } catch {} }
  PM.back = null; }
const chatPlayer = m => { // the verified profile behind a chat message, if there is one
  if (m.pv) return PL.by.get(m.u) || null;
  if (m.owner || m.admin) { const p = PL.by.get(m.n.toLowerCase()); if (p && p.role === (m.owner ? 'owner' : 'admin')) return p; } // signed by the owner/admin key
  return null;
};
async function openChatPerson(id) { // clicking a name or picture in chat
  const m = C.msgs.find(x => x.id === id); if (!m) return;
  const mo = ensureProfileModal(); if (mo.hidden) PM.back = document.activeElement; openU = ''; mo.hidden = false; $('#pmBody').innerHTML = '<div class="pm-body"><p class="muted">Loading profile…</p></div>';
  await loadPlayers();
  if (m.u && m.ps && m.pv === undefined && PL.by.has(m.u)) { m.pv = await verifyWith(PL.by.get(m.u), m.ps, sigText(m) + '|' + m.u); C.pv.set(m.id, m.pv); }
  const p = chatPlayer(m); if (p) return openProfile(p.u);
  const u = m.n.trim().toLowerCase();
  if (!USER_OK.test(u)) { $('#pmBody').innerHTML = `<div class="pm-body"><h2>${esc(m.n)}</h2><p class="muted" style="margin:0">${esc(m.n)} is chatting as a guest (no account), so they can't be added as a friend yet. Ask them to make an account.</p></div>`; return; }
  openProfile(u, PL.by.has(u) ? `Heads up: this chat message wasn't signed by @${u}'s profile, so it could be someone else using the same name.` : '', m.n);
}
function repaintSocial() {
  if (openU && $('#playerModal') && !$('#playerModal').hidden) $('#pmBody').innerHTML = profileHTML(openU);
  if (current === 'players') paintPlayers();
  if (current === 'options') { const b = $('#pubStatus'); if (b) b.innerHTML = pubStatusHTML(); const sw = $('#stPublic'); if (sw) sw.setAttribute('aria-checked', S.pub); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-player]'); if (b) { e.preventDefault(); openProfile(b.dataset.player); return; }
  const c = e.target.closest('[data-cm]'); if (c) { e.preventDefault(); openChatPerson(c.dataset.cm); return; }
  const f = e.target.closest('[data-fr]'); if (f) changeFriend(f.dataset.u, f.dataset.fr);
  const dg = e.target.closest('[data-dmgo]'); if (dg) { DM.open = dg.dataset.dmgo; if (current === 'messages') rerender(); }
});

/* players page */
const pubStatusHTML = () => !me() ? 'Make an account to get a public profile.' : PL.status === 'taken' ? `<span class="err">Another player already uses the name ${esc(me().username)} on the leaderboard.</span>`
  : S.pub ? `You're public as <b>${esc(me().username)}</b>.${S.pubAt ? ` Last synced ${fmtTime(S.pubAt)}.` : ' Syncing…'} <button type="button" class="linkbtn" data-player="${myU()}">View my profile</button>` : 'Your profile is private. Only you can see your progress.';
const SHARED_INFO = 'Shared: your username, level, XP (total and this week), badge ranks, achievements, friends list, join date, and your bio and favourite games if you add them. Never your tasks, games list, series, videos, email or password.';
async function goPublic() {
  if (!me()) return openAuth('signup');
  S.pub = true; PL.status = ''; save(); toast('Joining the leaderboard…');
  const ok = await publishProfile(true);
  if (ok) { toast("You're on the leaderboard!"); await loadPlayers(true); }
  else if (S.pub) toast("Couldn't reach the leaderboard. It will try again later.");
  rerender();
}
async function goPrivate() {
  S.pub = false; save(); repaintSocial();
  try { await unpublishProfile(); toast('Your public profile was removed'); } catch { toast("Couldn't reach the leaderboard to remove your profile. Try again later."); }
  await loadPlayers(true); rerender();
}
function lbRow(p, i, wk) {
  const s = friendState(p.u);
  return `<li><button type="button" class="lb-row${p.u === myU() ? ' me' : ''}" data-player="${p.u}"><span class="lb-pos${i < 3 ? ' g' + (i + 1) : ''}">#${i + 1}</span>${plAvatar(p)}
    <span class="grow lb-name"><span class="row" style="gap:6px"><b>${esc(p.n)}</b>${roleTag(p)}${p.u === myU() ? '<span class="tag">You</span>' : isFriend(s) ? '<span class="tag g">Friend</span>' : ''}</span>
    <span class="muted small">${wk ? `Level ${p.lv}` : bestRank(p)}</span></span><span class="lb-lv">${wk ? `${p.wx} XP` : `Lv ${p.lv}`}</span></button></li>`;
}
function paintPlayers() {
  const box = $('#lbList'); if (!box) return;
  const all = visiblePlayers(), q = PL.q.trim().toLowerCase();
  const wk = PL.tab === 'week';
  let list = (wk ? weekBoard() : all).map((p, i) => [p, i]);
  if (PL.tab === 'friends') list = list.filter(([p]) => p.u === myU() || isFriend(friendState(p.u)));
  if (q) list = list.filter(([p]) => p.u.includes(q) || p.n.toLowerCase().includes(q));
  box.innerHTML = !PL.at && PL.loading ? `<li class="empty">Loading players…</li>` : PL.status === 'offline' && !PL.list.length ? `<li class="empty">Can't reach the leaderboard right now.</li>`
    : list.slice(0, 200).map(([p, i]) => lbRow(p, i, wk)).join('') || `<li class="empty">${PL.tab === 'friends' ? 'No friends yet. Open a player and press Add friend.' : q ? 'Nobody matches that name.' : wk ? 'Nobody has earned XP this week yet. Be the first!' : 'No public players yet. Be the first!'}</li>`;
  const lh = $('#lbHint'); if (lh) lh.textContent = wk ? `XP earned since Monday. Resets in ${daysLeft()} day${daysLeft() === 1 ? '' : 's'}.` : 'Ranked by level, then XP. Click anyone to see their profile. Levels are reported by each player\'s own app, so moderators can hide cheaters.';
  $('#lbCount').textContent = `${all.length} player${all.length === 1 ? '' : 's'}`;
  const fb = $('#friendsBox'); if (fb) {
    const reqs = friendRequests(), mine = S.friends.map(u => PL.by.get(u) || {u, n:u, role:'', pf:'', fr:[], rk:[], lv:0});
    const friends = [...mine.filter(p => friendState(p.u) === 'friends'), ...PL.list.filter(p => friendState(p.u) === 'forced')], sent = mine.filter(p => friendState(p.u) === 'sent');
    const row = (p, btns) => `<div class="friend-row"><button type="button" class="friend-who" data-player="${p.u}">${plAvatar(p)}<span><b>${esc(p.n)}</b>${p.lv ? `<br><span class="muted small">Lv ${p.lv}</span>` : ''}</span></button><span class="row" style="gap:6px">${btns}</span></div>`;
    fb.innerHTML = `${reqs.length ? `<p class="small" style="margin:0 0 6px"><b>Friend requests</b> <span class="tag p">${reqs.length}</span></p>${reqs.map(p => row(p, friendButtons(p.u, 'sm'))).join('')}` : ''}
      <p class="small" style="margin:${reqs.length ? 14 : 0}px 0 6px"><b>Friends</b> <span class="muted">${friends.length}</span></p>${friends.map(p => row(p, friendState(p.u) === 'forced' ? `<span class="muted small">Added by the ${p.role}</span>` : `<button type="button" class="iconbtn" data-fr="remove" data-u="${p.u}" aria-label="Remove ${esc(p.n)}" title="Remove">${icon('x')}</button>`)).join('') || '<p class="muted small" style="margin:0">No friends yet.</p>'}
      ${sent.length ? `<p class="small" style="margin:14px 0 6px"><b>Sent requests</b></p>${sent.map(p => row(p, `<button type="button" class="btn sm" data-fr="remove" data-u="${p.u}">Cancel</button>`)).join('')}` : ''}`;
  }
  const hb = $('#hiddenBox'); if (hb) {
    const hid = PL.list.filter(p => PL.hidden.has(p.u));
    hb.innerHTML = hid.map(p => `<div class="friend-row"><button type="button" class="friend-who" data-player="${p.u}">${plAvatar(p)}<span><b>${esc(p.n)}</b><br><span class="muted small">Hidden by ${PL.hidden.get(p.u)}</span></span></button>${canHidePlayer(p) && (isOwner || PL.hidden.get(p.u) === 'admin') ? `<button type="button" class="btn sm" data-hidep2="${p.u}">Show</button>` : ''}</div>`).join('') || '<p class="muted small" style="margin:0">Nobody is hidden.</p>';
  }
  const rc = $('#reqCount'); if (rc) { const n = friendRequests().length; rc.textContent = n; rc.hidden = !n; }
}
VIEWS.players = () => {
  const u = me();
  return `<div class="grid">
  ${!S.pub ? card('c12', 'Join the leaderboard', `<p class="muted" style="margin-top:-6px">${u ? `Make your profile public to show up on the leaderboard, let people click your name, and add friends. ${SHARED_INFO} You can turn it off any time in Settings.` : 'Create an account to join the leaderboard, get a profile other players can open, and add friends.'}</p>
    ${u && PL.status === 'taken' ? `<p class="err">Another player already uses the name ${esc(u.username)} on the leaderboard. Make a new account with a different username to join.</p>` : ''}
    <div class="row">${u ? `<button type="button" class="btn primary" id="goPublic">${icon('globe')}Make my profile public</button>` : `<button type="button" class="btn primary" data-open-auth="signup">${icon('user')}Create account</button><button type="button" class="btn" data-open-auth="login">Log in</button>`}</div>`) : ''}
  ${card('c8', 'Leaderboard', `<div class="row lb-tools"><div class="seg" role="tablist"><button type="button" role="tab" data-lbtab="all" class="${PL.tab === 'all' ? 'on' : ''}" aria-selected="${PL.tab === 'all'}">Everyone</button><button type="button" role="tab" data-lbtab="week" class="${PL.tab === 'week' ? 'on' : ''}" aria-selected="${PL.tab === 'week'}">This week</button><button type="button" role="tab" data-lbtab="friends" class="${PL.tab === 'friends' ? 'on' : ''}" aria-selected="${PL.tab === 'friends'}">Friends</button></div>
      <input id="lbSearch" class="grow" placeholder="Find a player" aria-label="Find a player" value="${esc(PL.q)}" maxlength="24"><button type="button" class="iconbtn" id="lbRefresh" aria-label="Refresh" title="Refresh">${icon('reset')}</button></div>
    <ol class="lb" id="lbList"></ol>
    <p class="muted small" style="margin:12px 0 0" id="lbHint">Ranked by level, then XP. Click anyone to see their profile. Levels are reported by each player's own app, so moderators can hide cheaters.</p>`, `<span class="tag p" id="lbCount"></span>`)}
  <div class="c4" style="display:grid;gap:22px;align-content:start">
  ${card('', 'Friends', u ? `<form class="row" id="addFriendForm"><input id="addFriendIn" class="grow" placeholder="Username" maxlength="20" aria-label="Friend's username" autocomplete="off"><button class="btn">${icon('userplus')}Add</button></form>
    <div id="friendsBox" style="margin-top:14px"></div>` : '<p class="muted" style="margin-top:-6px">Make an account to add friends.</p>', '<span class="tag p" id="reqCount" hidden></span>')}
  ${isOwner || isAdmin ? card('', 'Hidden players', '<div id="hiddenBox"></div>', isOwner ? `<span class="tag owner">${icon('crown')}Owner</span>` : `<span class="tag adm">${icon('shield')}Admin</span>`) : ''}
  </div>
  ${isOwner || isAdmin ? `${card('c7', 'Reports', '<div id="repBox"><p class="muted small" style="margin:0">Loading reports…</p></div>', '<span class="tag p" id="repCount" hidden></span>')}
  ${card('c5', 'Moderation log', '<ul class="modlog" id="modLog"></ul>')}` : ''}
  </div>`;
};
function stopPlayers() { clearInterval(PL.timer); PL.timer = null; }
BIND.players = m => {
  m.querySelectorAll('[data-open-auth]').forEach(b => b.onclick = () => openAuth(b.dataset.openAuth));
  const gp = $('#goPublic'); if (gp) gp.onclick = goPublic;
  m.querySelectorAll('[data-lbtab]').forEach(b => b.onclick = () => { PL.tab = b.dataset.lbtab; m.querySelectorAll('[data-lbtab]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); paintPlayers(); });
  $('#lbSearch').oninput = e => { PL.q = e.target.value; paintPlayers(); };
  $('#lbRefresh').onclick = async () => { await loadPlayers(true); paintPlayers(); toast('Leaderboard updated'); };
  const af = $('#addFriendForm'); if (af) af.onsubmit = async e => { e.preventDefault(); const v = $('#addFriendIn').value.trim().toLowerCase();
    if (!USER_OK.test(v)) return toast('Usernames are 3–20 letters, numbers or underscores.');
    if (v === myU()) return toast("That's you!");
    await loadPlayers(); if (!PL.by.has(v) && !(isOwner || isAdmin)) return toast(`No public player called ${v}.`);
    $('#addFriendIn').value = ''; changeFriend(v, 'add'); };
  const hb = $('#hiddenBox'); if (hb) hb.onclick = e => { const b = e.target.closest('[data-hidep2]'); if (b) setHidden(b.dataset.hidep2, false); };
  paintPlayers();
  loadPlayers(true).then(() => { paintPlayers(); paintMod(); });
  if (isOwner || isAdmin) loadReports(true).then(paintMod);
  stopPlayers(); PL.timer = setInterval(() => { if (document.visibilityState === 'visible' && current === 'players') loadPlayers(true).then(paintPlayers); }, 30000);
};

/* settings */
function accountCard() {
  const u = me();
  if (!u) return card('c6', 'Account', `<p class="muted" style="margin-top:-6px">You're using a guest profile. Create an account so each person on this device has their own progress, protected by a password. Your current progress moves into the new account.</p>
    <div class="row"><button class="btn primary" data-open-auth="signup">${icon('user')}Create account</button><button class="btn" data-open-auth="login">Log in</button></div>`);
  return card('c6', 'Account', `<div class="form">
    <label class="field"><span>Username</span><input id="acUser" value="${esc(u.username)}" disabled></label>
    <label class="field"><span>Email (optional)</span><input id="acEmail" type="email" maxlength="120" value="${esc(u.email || '')}" placeholder="Not set"></label>
    <details class="pw"><summary class="btn sm">Change password</summary><form class="form" id="pwForm" style="margin-top:12px">
      <input id="pwOld" type="password" autocomplete="current-password" placeholder="Current password" aria-label="Current password">
      <input id="pwNew" type="password" autocomplete="new-password" placeholder="New password (8+ characters)" aria-label="New password">
      <input id="pwNew2" type="password" autocomplete="new-password" placeholder="Confirm new password" aria-label="Confirm new password">
      <p class="err" id="pwErr" role="alert"></p><button class="btn primary">Save new password</button></form></details>
    <div class="row"><button class="btn" id="acLogout">${icon('logout')}Log out</button><button class="btn danger" id="acDelete">${icon('trash')}Delete account</button></div></div>`);
}
function ownerCard() {
  if (isAdminOnly()) return card('c6', 'Admin', `<p class="muted" style="margin-top:-6px">Admin status is on for this ${me() ? 'account' : 'profile'}. Your perks:</p>
    <ul class="tips"><li>Free boost to level ${ADMIN_LEVEL_BOOST} (once), then double XP on everything</li><li>Profile picture, banner and up to 80 custom emoji (still or animated) on the Badges page</li><li>The Admin badge, and a blue Admin tag in chat that can't be faked</li><li>In chat: hide messages and mute regular members</li></ul>
    <button class="btn" id="admOff" style="margin-top:14px">Turn off admin status</button>`, `<span class="tag adm">${icon('shield')}Admin</span>`);
  return card('c6', isOwner ? 'Owner' : 'Owner or admin key', isOwner
    ? `<p class="muted" style="margin-top:-6px">Owner status is on for this ${me() ? 'account' : 'profile'}: level ${OWNER_LEVEL}, every badge at Challenger, the Founder badge, and your profile picture, banner and custom emoji (on the Badges page).</p><button class="btn" id="ownOff">Turn off owner status</button>`
    : `<p class="muted" style="margin-top:-6px">Got an owner or admin key? Enter it to unlock its perks on this ${me() ? 'account' : 'profile'}.</p>
      <form class="row" id="ownForm"><input id="ownKey" type="password" autocomplete="off" placeholder="Owner or admin key" aria-label="Owner or admin key"><button class="btn primary">Unlock</button></form><p class="err" id="ownErr" role="alert"></p>`);
}
VIEWS.options = () => `<div class="grid">
  ${accountCard()}
  ${ownerCard()}
  ${appCard()}
  ${card('c6', 'Public profile', `<div class="form">
    <div class="row" style="justify-content:space-between"><span>Show me on the leaderboard<br><span class="muted small">Lets others open your profile and add you as a friend</span></span>${me() ? `<button class="switch" id="stPublic" role="switch" aria-checked="${S.pub}" aria-label="Public profile"><i></i></button>` : '<button class="btn sm" data-open-auth="signup">Create account</button>'}</div>
    <p class="muted small" id="pubStatus" style="margin:0">${pubStatusHTML()}</p>
    <p class="muted small" style="margin:0">${SHARED_INFO}</p></div>`)}
  ${card('c6', 'Profile & look', `<div class="form">
    <label class="field"><span>Nickname${me() ? ' (your username is shown instead)' : ''}</span><input id="stName" maxlength="24" value="${esc(S.name)}"></label>
    <label class="field"><span>Language</span><select id="stLang" translate="no">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" lang="${k}"${LANG === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    <div class="row" style="justify-content:space-between"><span>Dark mode</span><button class="switch" id="stTheme" role="switch" aria-label="Dark mode" aria-checked="${S.theme==='dark'}"><i></i></button></div>
    <label class="field"><span>Seasonal theme <span class="dim">(Automatic decorates for Halloween, December and New Year)</span></span><select id="stSeason">${Object.entries(SEASONS).map(([k, n]) => `<option value="${k}"${S.season === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    <div class="row" style="justify-content:space-between"><span>Show YouTube thumbnails<br><span class="muted small">Loads images from YouTube's servers</span></span><button class="switch" id="stThumbs" role="switch" aria-label="Show YouTube thumbnails" aria-checked="${S.thumbs}"><i></i></button></div>
    <div class="row" style="justify-content:space-between"><span>Desktop notifications<br><span class="muted small">For timers & break reminders</span></span><button class="switch" id="stNotify" role="switch" aria-label="Desktop notifications" aria-checked="${S.notify}"><i></i></button></div>
    <p class="muted small">Level ${level().lv} · ${S.xp} total XP</p></div>`)}
  ${card('c6', 'Healthy habits', `<div class="form">
    <label class="field"><span>Gaming break reminder every (minutes, 0 = off)</span><input type="number" min="0" max="600" id="stBreak" value="${S.breakEvery}"></label>
    <label class="field"><span>Average episode length (minutes)</span><input type="number" min="1" max="200" id="stEp" value="${S.epLen}"></label>
    <a class="btn" href="#balance">Edit daily goals →</a></div>`)}
  ${card('c12', 'Your data', `<p class="muted small" style="margin:-6px 0 8px">Last backup: ${S.lastBackup ? new Date(S.lastBackup).toLocaleDateString() : 'never'}</p><p class="muted" style="margin-top:0">This ${me() ? 'account\'s' : 'profile\'s'} data is stored only in this browser/app on this device. Back it up, move it to another device, or wipe it.</p>
    <div class="row"><button class="btn" id="stExport">${icon('download')}Export backup (.json)</button>
    <label class="btn" style="cursor:pointer">${icon('upload')}Import backup<input type="file" id="stImport" accept="application/json,.json" hidden></label>
    <button class="btn" id="stCopy">${icon('link')}Copy backup</button>
    <button class="btn danger" id="stWipe">${icon('trash')}Delete all my data</button></div>
    <textarea id="stBackupText" hidden readonly style="margin-top:12px" aria-label="Backup text"></textarea>`)}
</div>`;
BIND.options = m => {
  m.querySelectorAll('[data-open-auth]').forEach(b => b.onclick = () => openAuth(b.dataset.openAuth));
  const sp = $('#stPublic'); if (sp) sp.onclick = () => S.pub ? goPrivate() : goPublic();
  const u = me();
  if (u) {
    $('#acEmail').onchange = e => { const v = e.target.value.trim(); if (v && !EMAIL_RE.test(v)) return toast('That email does not look right'); u.email = v; saveAcc(); toast(v ? 'Email saved' : 'Email removed'); };
    $('#pwForm').onsubmit = async e => {
      e.preventDefault(); const err = $('#pwErr'); err.textContent = '';
      if (!(await checkPassword(u, $('#pwOld').value))) return err.textContent = 'Your current password is not right.';
      const p = $('#pwNew').value; if (p.length < 8) return err.textContent = 'Use at least 8 characters.';
      if (p !== $('#pwNew2').value) return err.textContent = 'The new passwords do not match.';
      await setPassword(u, p); saveAcc(); toast('Password changed'); rerender();
    };
    $('#acLogout').onclick = logout;
    let armedDel = false;
    $('#acDelete').onclick = async () => {
      if (!armedDel) { armedDel = true; $('#acDelete').innerHTML = `${icon('trash')}Click again to delete account`; setTimeout(() => { armedDel = false; const b = $('#acDelete'); if (b) b.innerHTML = `${icon('trash')}Delete account`; }, 5000); return; }
      if (S.pub) { $('#acDelete').disabled = true; S.pub = false; await Promise.race([unpublishProfile().catch(() => {}), new Promise(r => setTimeout(r, 8000))]); } // take the public profile down too
      try { localStorage.removeItem(keyFor(u.username)); } catch {}
      await mediaWipe();
      delete ACC.users[u.username.toLowerCase()]; switchTo(null); toast('Account deleted');
    };
  }
  if (isOwner) $('#ownOff').onclick = () => { S.ownerProof = ''; save(); verifyOwner(); toast('Owner status turned off'); };
  else if (isAdmin) $('#admOff').onclick = () => { S.adminProof = ''; save(); verifyOwner(); toast('Admin status turned off'); };
  else $('#ownForm').onsubmit = async e => {
    e.preventDefault(); const k = $('#ownKey').value; if (!k.trim()) return;
    $('#ownErr').textContent = ''; toast('Checking key…');
    const role = await claimOwner(k);
    if (role === 'owner') { toast('Owner unlocked: max level and every badge'); location.hash = '#badges'; }
    else if (role === 'admin') { toast(`Admin unlocked: level ${Math.max(level().lv, ADMIN_LEVEL_BOOST)}, double XP and admin perks`); location.hash = '#badges'; }
    else $('#ownErr').textContent = 'That key is not right.';
  };
  $('#stName').onchange = e => { S.name = e.target.value.trim(); save(); paintPlayer(); toast('Name saved'); };
  const sw = (id, fn) => $(id).onclick = () => { fn(); save(); rerender(); };
  sw('#stTheme', () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; applyTheme(); });
  sw('#stThumbs', () => S.thumbs = !S.thumbs);
  sw('#stNotify', () => { S.notify = !S.notify; if (S.notify && 'Notification' in window && Notification.permission !== 'granted') Notification.requestPermission(); });
  $('#stBreak').onchange = e => { S.breakEvery = Math.max(0, +e.target.value || 0); save(); toast('Saved'); };
  $('#stEp').onchange = e => { S.epLen = Math.max(1, +e.target.value || 40); save(); toast('Saved'); };
  const ib = $('#installBtn'); if (ib) ib.onclick = installApp;
  $('#stLang').onchange = e => { try { localStorage.setItem('levelup-lang', e.target.value); } catch {} location.reload(); };
  $('#stSeason').onchange = e => { S.season = e.target.value; save(); applySeason(); toast('Theme updated'); };
  $('#stExport').onclick = () => { S.lastBackup = Date.now(); save(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], {type:'application/json'})); a.download = `levelup-life-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Backup downloaded'); };
  $('#stImport').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { const d = JSON.parse(t); if (typeof d !== 'object' || !d || Array.isArray(d)) throw 0; S = clean(d); save(); resetTimers(); init(); toast('Backup restored'); }).catch(() => toast('That file is not a valid backup')); };
  let armed = false;
  $('#stWipe').onclick = async () => {
    if (!armed) { armed = true; $('#stWipe').innerHTML = `${icon('trash')}Click again to delete everything`; setTimeout(() => { armed = false; const b = $('#stWipe'); if (b) b.innerHTML = `${icon('trash')}Delete all my data`; }, 5000); return; }
    if (S.pub) { $('#stWipe').disabled = true; S.pub = false; await Promise.race([unpublishProfile().catch(() => {}), new Promise(r => setTimeout(r, 8000))]); } // the public profile goes too
    try { localStorage.removeItem(KEY); } catch {} await mediaWipe(); S = clean({}); resetTimers(); save(); init(); location.hash = '#home'; toast('All data deleted'); };
  $('#stCopy').onclick = () => { S.lastBackup = Date.now(); save(); const t = JSON.stringify(S); const fb = () => { const a = $('#stBackupText'); a.hidden = false; a.value = t; a.select(); toast('Select all and copy the text below'); };
    try { navigator.clipboard.writeText(t).then(() => toast('Backup copied — paste it into a text file to keep it'), fb); } catch { fb(); } };
};

/* help */
VIEWS.help = () => `<div class="grid">
  ${card('c7', 'How to use LevelUp Life', `<ol class="muted" style="padding-left:20px;margin:0;display:grid;gap:10px">
    <li><b style="color:var(--text)">Pick a study track</b> in Study Path (Web Design or App Development) and tick lessons as you finish them.</li>
    <li><b style="color:var(--text)">Start a Focus session</b> when you study. Finished sessions give XP and count toward your goal.</li>
    <li><b style="color:var(--text)">Track your fun</b>: start a gaming session, add series, save YouTube videos. Break reminders keep you healthy.</li>
    <li><b style="color:var(--text)">Check Balance</b> to see how your week splits between learning, playing and watching.</li>
    <li><b style="color:var(--text)">Do daily quests</b> in Help the World — good deeds earn XP too.</li>
    <li><b style="color:var(--text)">Chat</b> with friends in the Chat tab using an invite code from the owner.</li>
    <li><b style="color:var(--text)">Collect badges</b> in the Badges tab. Each one climbs 24 ranks, from Bronze III to Challenger.</li>
    <li><b style="color:var(--text)">Make an account</b> with a username and password so everyone on this device has their own progress. Email is optional.</li>
    <li><b style="color:var(--text)">Every week</b> brings 3 new challenges (see Home), and opening the app every day builds your login streak. Achievements are on the Badges page.</li>
    <li><b style="color:var(--text)">Friends</b> can send each other private, encrypted messages (Messages) and study together in a study group (Focus). The bell shows friend requests, messages and more.</li>
    <li><b style="color:var(--text)">Back up</b> from Settings any time. Nothing is uploaded unless you join the chat or make your profile public.</li></ol>
    <div class="row" style="margin-top:16px"><button type="button" class="btn primary" id="tourBtn">${icon('play')}Take the tour</button><a class="btn" href="#options">Install the app</a></div>`)}
  ${card('c5', 'Keyboard shortcuts', `<div class="keys">
    <span><kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd></span><span class="muted">Search & jump anywhere</span>
    <span><kbd>1</kbd> – <kbd>9</kbd></span><span class="muted">Go to tab 1–9 (9 is Badges)</span>
    <span><kbd>0</kbd></span><span class="muted">Settings</span>
    <span><kbd>Alt</kbd> <kbd>←</kbd> <kbd>→</kbd></span><span class="muted">Previous / next tab</span>
    <span><kbd>Space</kbd></span><span class="muted">Start / pause the focus timer (Focus tab)</span>
    <span><kbd>T</kbd></span><span class="muted">Toggle light / dark</span>
    <span><kbd>?</kbd></span><span class="muted">Open this help page</span></div>`)}
  ${card('c12', 'All tabs', `<div class="tiles">${ROUTES.map(r=>`<a class="tile" href="#${r.id}">${iconFor(r.id)}<span>${r.name}</span></a>`).join('')}</div>`)}
</div>`;

/* privacy */
VIEWS.privacy = () => card('c12', '', `${LANG !== 'en' ? '<p class="muted" style="margin-top:0">The Privacy Terms are shown in English.</p>' : ''}<div class="prose" translate="no">
  <p class="dim small">Last updated: 24 November 2026 (public profiles, leaderboard and friends added)</p>
  <h2>1. The short version</h2>
  <p>LevelUp Life is a local-first app. <b>Everything you type stays on your own device.</b> We do not have servers that store your data, we do not require an account, and we do not use analytics, trackers, cookies for advertising, or sell anything about you.</p>
  <h2>2. What data the app stores</h2>
  <ul><li>If you make an account: your username, your email if you choose to add one, and a hashed version of your password. The password itself is never stored; it is scrambled with PBKDF2-SHA256 and a random salt.</li><li>Your nickname (optional).</li><li>Study progress, tasks, focus sessions and goals.</li><li>Games, gaming sessions, series and saved YouTube links you add.</li><li>Completed daily quests, XP and app settings (theme, reminders).</li></ul>
  <p>This is saved in your browser's <i>localStorage</i> (website) or the app's local storage folder (desktop app) on this device only.</p>
  <h2>3. What we do not collect</h2>
  <ul><li>Email is optional. If you add one, it stays on this device and is never sent anywhere or used to contact you.</li><li>No phone number, location or contacts.</li><li>No usage analytics or crash tracking.</li><li>No advertising IDs. No ads at all.</li></ul>
  <h2>4. Global chat (optional)</h2>
  <p>The chat is the one feature that sends data off your device. If you join a chat room, each message you send (with your display name and the time) is stored on the website host's database (Wix), encrypted with the room's invite code. Anyone who has the invite code can read the room. The owner can hide messages and mute names, and can delete stored messages. Don't share personal information in the chat.</p>
  <h2>4a. Public profile, leaderboard and friends (optional, off by default)</h2>
  <p>If you turn on "Show me on the leaderboard", the app publishes a small public profile to the website host's database (Wix) that <b>anyone can see</b>: your username, level, XP, badge ranks, the usernames you added as friends, and the date you made your account. The owner's and admins' profile picture and banner are shared too. Your tasks, games, series, videos, notes, email and password are <b>never</b> shared.</p>
  <p>Your profile is signed with a key made on your device, so nobody else can edit it. If chat is on, messages you send while public carry your username so others can open your profile. Levels are reported by your own app; the owner and admins can hide a profile from the leaderboard. The owner can add any player as a friend without a request, and admins can do the same for regular players; you'll be told when this happens. Turning the setting off, deleting your account or deleting all your data replaces your public profile with an empty "removed" note.</p>
  <h2>4b. Reports</h2>
  <p>If you report a message or a player, the report (the reason, your note, the message, the names involved and your name) is stored on the website host's database <b>encrypted so only the owner and admins can read it</b>. Please only report real problems.</p>
  <h2>4c. Private messages (friends only)</h2>
  <p>Private messages are <b>end-to-end encrypted</b>: they are locked with a key that only your device and your friend's device have, so nobody else can read them, not the owner, admins or Wix. The locked messages are stored on the website host's database together with who they are for and when they were sent. A copy is kept on your device. If you report a message, you choose to share it with the owner and admins.</p>
  <h2>4d. Study groups</h2>
  <p>If you join a study group, your display name, your focus timer (focusing, on a break or paused, and when it ends) and how many sessions you did today are shared with everyone who has the group code, encrypted with that code. When you leave, it is removed from the group.</p>
  <h2>4e. Third-party content</h2>
  <p>Some features load content from other services only when you use them:</p>
  <ul><li><b>YouTube thumbnails</b> are loaded from YouTube (i.ytimg.com) for videos you saved. You can turn this off in Settings.</li>
  <li><b>Links</b> to lessons, YouTube searches and charities open those websites, which have their own privacy policies.</li>
  <li><b>Fonts</b> are included with the website, so no font requests go to Google.</li>
  <li><b>Offline copy:</b> on the website, your browser keeps a copy of the app's own files (not your data) so it opens fast and works offline. Clearing site data removes it.</li>
  <li><b>Website hosting:</b> the website version is hosted by Wix, which may record page visits and show a cookie notice. The desktop app does not do this.</li></ul>
  <h2>5. Notifications</h2>
  <p>Notifications (the bell) are created on your device for timers, break reminders, friend requests, messages, challenges and achievements. If you turn on desktop notifications, your device shows them as pop-ups. Nothing extra is sent over the internet.</p>
  <h2>6. Your control</h2>
  <ul><li><b>Accounts are per device:</b> an account only exists in the browser or app where it was created. Anyone with access to this device's files could copy the stored data, so use a device password.</li><li><b>Access & portability:</b> export all your data as a JSON file in Settings.</li><li><b>Deletion:</b> "Delete account" or "Delete all my data" in Settings removes it instantly. Uninstalling the desktop app or clearing site data also removes it.</li><li><b>Correction:</b> edit or delete any item directly in the app.</li></ul>
  <h2>7. Children</h2>
  <p>The app does not knowingly collect personal data from anyone, including children, because no data leaves the device. Younger users should use the app with a parent or guardian's permission where local law requires it.</p>
  <h2>8. Security</h2>
  <p>Your data is as safe as your device. Use a device password and keep your backups somewhere private. Backups are plain JSON files and are not encrypted.</p>
  <h2>9. Health disclaimer</h2>
  <p>Break reminders and balance scores are friendly suggestions, not medical advice.</p>
  <h2>10. Changes</h2>
  <p>If these terms change, the "Last updated" date above will change and the new terms will be shown in the app.</p>
  <h2>11. Terms of use</h2>
  <p>The app is provided free and "as is", without warranty. Use it legally and kindly. External links are provided for convenience; we are not responsible for third-party sites.</p>
  </div>`);

/* ---------- command palette ---------- */
const ACTIONS = () => [
  ...ROUTES.map(r => ({n:r.name, h:'Go to tab', run:() => location.hash = `#${r.id}`, i:r.id})),
  {n:'Start / pause focus timer', h:'Action', i:'focus', run:() => { location.hash = '#focus'; setTimeout(toggleTimer, 50); }},
  {n:'Start gaming session', h:'Action', i:'gaming', run:() => location.hash = '#gaming'},
  {n:'Add a series', h:'Action', i:'series', run:() => { location.hash = '#series'; setTimeout(() => $('#sTitle')?.focus(), 60); }},
  {n:'Save a YouTube video', h:'Action', i:'youtube', run:() => { location.hash = '#youtube'; setTimeout(() => $('#yUrl')?.focus(), 60); }},
  {n:'Add a study task', h:'Action', i:'study', run:() => { location.hash = '#study'; setTimeout(() => $('#taskIn')?.focus(), 60); }},
  {n:'Toggle light / dark mode', h:'Action', i:'eye', run:() => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); }},
  ...(me() ? [{n:'Log out', h:'Account', i:'logout', run:() => logout()}] : [{n:'Create account or log in', h:'Account', i:'user', run:() => openAuth('signup')}]),
  {n:'Take the tour', h:'Help', i:'help', run:() => startTour()},
  {n:'Notifications', h:'Open', i:'bell', run:() => toggleNotes(true)},
  {n:'Language', h:'Settings', i:'globe', run:() => { location.hash = '#options'; setTimeout(() => $('#stLang')?.focus(), 80); }},
  {n:'Create or join a study group', h:'Action', i:'focus', run:() => { location.hash = '#focus'; setTimeout(() => $('#grpCode')?.focus(), 80); }},
  ...(APP.install ? [{n:'Install LevelUp Life', h:'App', i:'download', run:() => installApp()}] : []),
  {n:'Export backup', h:'Action', i:'download', run:() => { location.hash = '#options'; setTimeout(() => $('#stExport')?.click(), 60); }},
  ...S.series.map(s => ({n:s.title, h:'Series', i:'series', run:() => location.hash = '#series'})),
  ...S.backlog.map(b => ({n:b.title, h:'Game', i:'gaming', run:() => location.hash = '#gaming'})),
];
let pal = [], palSel = 0;
function openPalette() { $('#palette').hidden = false; $('#paletteInput').value = ''; paintPalette(); $('#paletteInput').focus(); }
function closePalette() { $('#palette').hidden = true; }
function paintPalette() {
  const q = $('#paletteInput').value.toLowerCase().trim();
  pal = ACTIONS().filter(a => !q || a.n.toLowerCase().includes(q) || a.h.toLowerCase().includes(q)).slice(0, 12);
  palSel = Math.min(palSel, Math.max(0, pal.length - 1));
  $('#paletteList').innerHTML = pal.map((a, i) => `<li data-i="${i}" id="pal-${i}" role="option" aria-selected="${i===palSel}" class="${i===palSel?'sel':''}">${icon(a.i)}${esc(a.n)}<span class="dim">${a.h}</span></li>`).join('') || '<li class="dim" role="option" aria-disabled="true">No matches</li>';
  $('#paletteInput').setAttribute('aria-activedescendant', pal.length ? `pal-${palSel}` : '');
}
function runPal(i) { const a = pal[i]; if (!a) return; closePalette(); a.run(); }

/* ---------- login streak and weekly challenges ---------- */
const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const weekId = (d = new Date()) => today(weekStart(d)); // the Monday of the week, YYYY-MM-DD
const weekDays = () => { const s = weekStart(); return Array.from({length:7}, (_, i) => { const x = new Date(s); x.setDate(s.getDate() + i); return today(x); }); };
const learnVids = s => s.yt.filter(y => y.watched && y.kind === 'learn').length;
const counters = (s = S) => ({focus:s.focus.count, lessons:Object.keys(s.lessons).length, deeds:s.questsTotal, vids:learnVids(s), chat:s.stats.chat, dm:s.stats.dm, group:s.stats.group});
function loginStreak() { let n = 0; for (let i = 0; i < 400; i++) { if (S.days.includes(dayOffset(i))) n++; else if (i > 0) break; } return n; }
function bestLogin() {
  let best = 0, run = 0, prev = null;
  for (const d of [...S.days].sort()) { const t = Date.parse(d + 'T12:00'); run = prev !== null && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  return best;
}
const STREAK_BONUS = {7:25, 30:100, 100:300, 365:1000};
function markDay() { // the first visit of the day: +5 XP, with a bonus on streak milestones
  if (!ACC.current) return;
  const fresh = rollWeek();
  if (fresh && S.days.length) addNote('New weekly challenges are here. Good luck!', '#home', false);
  if (S.days.includes(today())) { if (fresh) save(); return; }
  S.days.push(today()); S.days = S.days.slice(-400);
  const n = loginStreak(), bonus = STREAK_BONUS[n] || 0;
  gainXP(5 + bonus, bonus ? `${n}-day login streak!` : `daily check-in · ${n}-day streak`, true);
  if (bonus) addNote(`🔥 ${n}-day login streak! +${bonus} bonus XP`, '#home');
}
function rollWeek() { // a new week: fresh challenges and weekly XP
  const id = weekId(); if (S.wk.id === id && S.wk.base) return false;
  const first = !S.wk.id; S.wk = {id, xp:S.wk.id === id ? S.wk.xp : 0, base:counters(), done:S.wk.id === id ? S.wk.done : []}; return !first;
}
const CHALLENGES = [
  {id:'learn', n:x => `Learn for ${fmtMin(x)}`, x:[120, 180, 240], v:() => weekDays().reduce((a, d) => a + minsOn(d, 'learn'), 0), href:'#study'},
  {id:'focus', n:x => `Finish ${x} focus sessions`, x:[4, 6, 8], v:b => S.focus.count - b.focus, href:'#focus'},
  {id:'lessons', n:x => `Complete ${x} lessons`, x:[2, 3, 5], v:b => Object.keys(S.lessons).length - b.lessons, href:'#study'},
  {id:'deeds', n:x => `Do ${x} good deeds`, x:[3, 5, 7], v:b => S.questsTotal - b.deeds, href:'#impact'},
  {id:'days', n:x => `Open LevelUp Life on ${x} days`, x:[4, 5, 6], v:() => weekDays().filter(d => S.days.includes(d)).length, href:'#home'},
  {id:'balance', n:x => `Stay within your gaming limit on ${x} days`, x:[3, 4, 5], v:() => weekDays().filter(d => S.days.includes(d) && minsOn(d, 'play') <= S.goals.play).length, href:'#balance'},
  {id:'videos', n:x => `Watch ${x} learning videos`, x:[2, 3, 4], v:b => learnVids(S) - b.vids, href:'#youtube'},
  {id:'social', n:x => `Send ${x} chat or private messages`, x:[5, 10, 15], v:b => S.stats.chat - b.chat + S.stats.dm - b.dm, href:'#chat'},
  {id:'group', n:x => `Finish ${x} focus session${x === 1 ? '' : 's'} in a study group`, x:[1, 2, 3], v:b => S.stats.group - b.group, href:'#focus'},
];
const CH_XP = 75, CH_ALL_XP = 100;
function weekChallenges() { // the same three challenges for everyone this week
  let x = [...(S.wk.id || weekId())].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 4294967296; };
  const pool = CHALLENGES.slice(), out = [], b = S.wk.base || counters();
  while (out.length < 3) { const c = pool.splice(Math.floor(rnd() * pool.length), 1)[0], goal = c.x[Math.floor(rnd() * c.x.length)];
    const val = Math.max(0, c.v(b) || 0); out.push({id:c.id, name:c.n(goal), goal, val, href:c.href, done:S.wk.done.includes(c.id)}); }
  return out;
}
const daysLeft = () => 7 - (new Date().getDay() + 6) % 7;

/* ---------- achievements (one-time unlocks, many of them social) ---------- */
const friendCount = () => PL.list.length ? new Set([...S.friends.filter(u => isFriend(friendState(u))), ...PL.list.filter(p => friendState(p.u) === 'forced').map(p => p.u)]).size : 0;
const myRank = () => { const i = visiblePlayers().findIndex(p => p.u === myU()); return i + 1; };
const weekBoard = () => visiblePlayers().filter(p => p.wk === weekId() && p.wx > 0).sort((a, b) => b.wx - a.wx || a.n.localeCompare(b.n));
const ACH = [
  {id:'streak7', n:'Regular', d:'Open LevelUp Life 7 days in a row', i:'balance', xp:50, ok:() => bestLogin() >= 7},
  {id:'streak30', n:'Dedicated', d:'Open LevelUp Life 30 days in a row', i:'balance', xp:150, ok:() => bestLogin() >= 30},
  {id:'weekly', n:'Week champion', d:'Finish all 3 weekly challenges in one week', i:'star', xp:50, ok:() => S.stats.wkAll >= 1},
  {id:'weekly5', n:'Unstoppable', d:'Finish every weekly challenge 5 times', i:'star', xp:200, ok:() => S.stats.wkAll >= 5},
  {id:'public', n:'Out there', d:'Make your profile public', i:'globe', xp:20, ok:() => S.pub && !!S.pubAt},
  {id:'aboutme', n:'About me', d:'Add a bio and a favourite game', i:'user', xp:20, ok:() => !!S.bio && S.favs.length > 0},
  {id:'friend1', n:'First friend', d:'Become friends with another player', i:'userplus', xp:30, ok:() => friendCount() >= 1},
  {id:'friend5', n:'Squad', d:'Have 5 friends', i:'players', xp:75, ok:() => friendCount() >= 5},
  {id:'friend25', n:'Popular', d:'Have 25 friends', i:'crown', xp:200, ok:() => friendCount() >= 25},
  {id:'chat1', n:'Hello world', d:'Send your first chat message', i:'chat', xp:15, ok:() => S.stats.chat >= 1},
  {id:'chat100', n:'Chatterbox', d:'Send 100 chat messages', i:'chat', xp:75, ok:() => S.stats.chat >= 100},
  {id:'dm1', n:'Pen pal', d:'Send a private message to a friend', i:'messages', xp:20, ok:() => S.stats.dm >= 1},
  {id:'dm100', n:'Best buds', d:'Send 100 private messages', i:'messages', xp:75, ok:() => S.stats.dm >= 100},
  {id:'group1', n:'Study buddy', d:'Finish a focus session in a study group', i:'focus', xp:30, ok:() => S.stats.group >= 1},
  {id:'group10', n:'Study crew', d:'Finish 10 focus sessions in a study group', i:'focus', xp:100, ok:() => S.stats.group >= 10},
  {id:'top10', n:'Top 10', d:'Reach the top 10 on a leaderboard of 11 or more players', i:'players', xp:100, ok:() => S.pub && visiblePlayers().length > 10 && myRank() > 0 && myRank() <= 10},
  {id:'podium', n:'Weekly podium', d:'Finish a week in the top 3 (at least 4 players that week)', i:'players', xp:75, ok:() => { const w = weekBoard(), i = w.findIndex(p => p.u === myU()); return S.pub && w.length >= 4 && i >= 0 && i < 3; }},
];
function queueProgress() { if (!queueProgress.t) queueProgress.t = setTimeout(() => { queueProgress.t = 0; checkProgress(); }, 300); } // a declaration, so save() can call it early
function checkProgress() {
  if (!ACC.current) return;
  rollWeek(); let changed = false;
  for (const c of weekChallenges()) if (!c.done && c.val >= c.goal) {
    S.wk.done.push(c.id); changed = true; gainXP(CH_XP, 'weekly challenge', true); addNote(`✅ Weekly challenge done: ${c.name} (+${CH_XP} XP)`, '#home');
    if (S.wk.done.length === 3) { S.stats.wkAll++; gainXP(CH_ALL_XP, 'all weekly challenges', true); addNote(`🏆 You finished all 3 weekly challenges! +${CH_ALL_XP} bonus XP`, '#home'); }
  }
  for (const a of ACH) if (!S.ach[a.id] && a.ok()) {
    S.ach[a.id] = today(); gainXP(a.xp, `achievement: ${a.n}`, true); addNote(`🏅 Achievement unlocked: ${a.n} (+${a.xp} XP)`, '#badges'); changed = true;
  }
  if (changed && (current === 'home' || current === 'badges') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) rerender(); // show the new progress
}
function weeklyCard() {
  const ch = weekChallenges(), n = loginStreak(), next = Object.keys(STREAK_BONUS).map(Number).find(x => x > n);
  return card('c12', 'This week', `<div class="week-wrap"><div class="streak-box"><span class="streak-n">${n}<small>🔥</small></span><b>Day login streak</b>
      <span class="muted small">${next ? `${next - n} more day${next - n === 1 ? '' : 's'} for a +${STREAK_BONUS[next]} XP bonus` : 'Legendary streak!'}<br>Best: ${bestLogin()} days · ${S.wk.xp} XP this week</span></div>
    <ul class="challenges">${ch.map(c => `<li class="${c.done ? 'done' : ''}"><a href="${c.href}" class="ch-row"><span class="ch-ic">${icon(c.done ? 'check' : 'star')}</span><span class="grow"><b>${esc(c.name)}</b>
      <span class="meter"><i style="width:${Math.min(100, c.val / c.goal * 100)}%"></i></span><span class="muted small">${c.done ? `Done · +${CH_XP} XP` : `${Math.min(c.val, c.goal)} / ${c.goal}${c.id === 'learn' ? ' minutes' : ''} · +${CH_XP} XP`}</span></span></a></li>`).join('')}</ul></div>
    <p class="muted small" style="margin:12px 0 0">Everyone gets the same 3 challenges. Finish all of them for a +${CH_ALL_XP} XP bonus. New challenges in ${daysLeft()} day${daysLeft() === 1 ? '' : 's'}.</p>`,
    `<span class="tag p">${ch.filter(c => c.done).length}/3</span>`);
}
function achievementsCard() {
  const got = ACH.filter(a => S.ach[a.id]).length;
  return card('c12', 'Achievements', `<div class="ach-grid">${ACH.map(a => { const d = S.ach[a.id];
    return `<div class="ach${d ? ' on' : ''}"><span class="ach-ic">${icon(a.i)}</span><span><b>${a.n}</b><br><span class="muted small">${a.d}</span><br><span class="small ${d ? 'ok-t' : 'dim'}">${d ? `Unlocked ${esc(d)}` : `+${a.xp} XP`}</span></span></div>`; }).join('')}</div>`,
    `<span class="tag p">${got}/${ACH.length}</span>`);
}

/* ---------- bio and favourite games ---------- */
const cleanText = (v, max) => String(v || '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function aboutCard() {
  if (!me()) return '';
  const games = [...new Set(S.backlog.map(b => b.title))].slice(0, 50);
  return card('c6', 'About you', `<form class="form" id="aboutForm">
    <label class="field"><span>Bio <span class="dim">(shown on your public profile)</span></span><textarea id="abBio" maxlength="160" rows="3" placeholder="e.g. Learning web design, love racing games">${esc(S.bio)}</textarea></label>
    <div class="field"><span id="fgLbl">Favourite games (up to 5)</span><div class="row" style="gap:6px">${S.favs.map((g, i) => `<span class="chip on">${esc(g)}<button type="button" class="chip-x" data-fgdel="${i}" aria-label="Remove ${esc(g)}">${icon('x')}</button></span>`).join('') || '<span class="muted small">None yet</span>'}</div>
      ${S.favs.length < 5 ? `<div class="row"><input id="abGame" class="grow" maxlength="40" list="abGames" placeholder="Add a game" aria-labelledby="fgLbl"><datalist id="abGames">${games.map(g => `<option value="${esc(g)}">`).join('')}</datalist><button type="button" class="btn" id="abAdd">${icon('plus')}Add</button></div>` : ''}</div>
    <div class="row"><button class="btn primary">Save</button><span class="muted small">${S.pub ? 'Updates your public profile.' : 'Only visible to others if your profile is public.'}</span></div></form>`);
}
function bindAbout() {
  const f = $('#aboutForm'); if (!f) return;
  const add = () => { const v = cleanText($('#abGame').value, 40); if (!v) return; if (S.favs.some(g => g.toLowerCase() === v.toLowerCase())) return toast('Already in your list');
    S.bio = cleanText($('#abBio').value, 160); S.favs.push(v); S.favs = S.favs.slice(0, 5); save(); rerender(); setTimeout(() => { const g = $('#abGame'); if (g) g.focus(); }, 30); };
  const ab = $('#abAdd'); if (ab) ab.onclick = add;
  const gi = $('#abGame'); if (gi) gi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  f.querySelectorAll('[data-fgdel]').forEach(b => b.onclick = () => { S.bio = cleanText($('#abBio').value, 160); S.favs.splice(+b.dataset.fgdel, 1); save(); rerender(); });
  f.onsubmit = e => { e.preventDefault(); S.bio = cleanText($('#abBio').value, 160); save(); toast(S.pub ? 'Saved · your public profile updates in a moment' : 'Saved'); if (S.pub) schedulePublish(1500); };
}

/* ---------- seasonal themes ---------- */
const SEASONS = {auto:'Automatic (holidays)', off:'Off', winter:'Winter ❄️', spring:'Spring 🌸', summer:'Summer ☀️', autumn:'Autumn 🍂', halloween:'Halloween 🎃', festive:'Festive 🎄', newyear:'New Year 🎆'};
const FX = {winter:['❄', '❅', '❆'], spring:['🌸', '❀', '🌼'], summer:['✦', '☀', '✧'], autumn:['🍂', '🍁', '🍃'], halloween:['🦇', '🎃', '✦'], festive:['❄', '✦', '❅'], newyear:['✦', '✧', '✺']};
function currentSeason() {
  if (S.season !== 'auto') return S.season === 'off' ? '' : S.season;
  const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
  if (m === 10 && day >= 20) return 'halloween';
  if (m === 12) return 'festive';
  if (m === 1 && day <= 6) return 'newyear';
  return '';
}
function applySeason() {
  const s = currentSeason(); document.documentElement.dataset.season = s;
  let fx = $('#seasonFx'); if (!s) { if (fx) fx.remove(); return; }
  if (fx && fx.dataset.s === s) return;
  if (!fx) { fx = document.createElement('div'); fx.id = 'seasonFx'; fx.className = 'season-fx'; fx.setAttribute('aria-hidden', 'true'); ($('.space') || document.body).append(fx); }
  fx.dataset.s = s; const set = FX[s];
  fx.innerHTML = Array.from({length:18}, (_, i) => `<i style="left:${(i * 37 + 11) % 100}%;--d:${9 + (i * 7) % 9}s;--w:${-(i * 1.7) % 12}s;--s:${0.7 + (i % 4) * 0.25}rem;--dx:${(i % 2 ? 1 : -1) * (20 + i % 5 * 12)}px">${set[i % set.length]}</i>`).join('');
}

/* ---------- notifications ---------- */
function addNote(t, h = '', desk = true, u = '') {
  S.notes.unshift({id:uid(), t:cleanText(t, 160), at:Date.now(), r:false, h, u}); S.notes = S.notes.slice(0, 60); save(); paintBell();
  if (desk && S.notify && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') try { new Notification('LevelUp Life', {body:t, icon:'icon.svg'}); } catch {}
}
const unreadNotes = () => S.notes.filter(n => !n.r).length;
function paintBell() {
  const b = $('#bellN'), n = unreadNotes(); if (b) { b.textContent = n > 9 ? '9+' : n; b.hidden = !n; }
  const btn = $('#bellBtn'); if (btn) btn.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
  const p = $('#notePanel'); if (p && !p.hidden) paintNotes();
}
function paintNotes() {
  const p = $('#notePanel'); if (!p) return;
  p.innerHTML = `<div class="np-h"><b>Notifications</b><span class="spacer"></span>${S.notes.length ? `<button type="button" class="linkbtn small" id="npRead">Mark all read</button><button type="button" class="linkbtn small" id="npClear">Clear</button>` : ''}</div>
    <ul class="np-list">${S.notes.map(n => `<li><button type="button" class="np-item${n.r ? '' : ' new'}" data-note="${n.id}"><span>${esc(n.t)}</span><span class="dim small">${fmtTime(n.at)}</span></button></li>`).join('') || '<li class="muted small np-empty">Nothing yet. Friend requests, messages, challenges and achievements show up here.</li>'}</ul>
    ${S.notify ? '' : `<p class="muted small np-foot">Want pop-ups when the app is in the background? <a href="#options">Turn on desktop notifications</a>.</p>`}`;
}
function toggleNotes(open) {
  let p = $('#notePanel'); const btn = $('#bellBtn'); if (!p && open === false) return;
  if (!p) { p = document.createElement('div'); p.id = 'notePanel'; p.className = 'note-panel'; p.hidden = true; p.setAttribute('role', 'region'); p.setAttribute('aria-label', 'Notifications'); document.body.append(p);
    p.addEventListener('click', e => {
      if (e.target.closest('#npRead')) { S.notes.forEach(n => n.r = true); save(); paintBell(); return; }
      if (e.target.closest('#npClear')) { S.notes = []; save(); paintBell(); return; }
      if (e.target.closest('a[href]')) { toggleNotes(false); return; }
      const it = e.target.closest('[data-note]'); if (!it) return; const n = S.notes.find(x => x.id === it.dataset.note); if (!n) return;
      n.r = true; save(); paintBell(); toggleNotes(false); if (n.u) DM.open = n.u; if (n.h) { if (location.hash === n.h) rerender(); else location.hash = n.h; } }); }
  open = open === undefined ? p.hidden : open;
  if (open) { const r = btn.getBoundingClientRect(); p.style.top = `${r.bottom + 10}px`; p.style.right = `${Math.max(12, innerWidth - r.right - 8)}px`; paintNotes(); p.hidden = false; const f = p.querySelector('button, a'); if (f) f.focus(); }
  else if (!p.hidden) { p.hidden = true; if (p.contains(document.activeElement)) btn.focus(); }
  btn.setAttribute('aria-expanded', String(open));
}
/* friend requests, new friends and new reports become notifications (the first sync only remembers what is there) */
function socialNotes() {
  const m = myU(); if (!m || !PL.at) return;
  const reqs = friendRequests().map(p => p.u), mutual = S.friends.filter(u => friendState(u) === 'friends'), first = !S.seen.at;
  if (!first) {
    reqs.filter(u => !S.seen.req.includes(u)).forEach(u => addNote(`${(PL.by.get(u) || {n:u}).n} sent you a friend request`, '#players'));
    mutual.filter(u => !S.seen.fr.includes(u)).forEach(u => addNote(`You and ${(PL.by.get(u) || {n:u}).n} are now friends`, '#players'));
  }
  S.seen.req = reqs.slice(0, 200); S.seen.fr = mutual.slice(0, 200); S.seen.at = Date.now(); save(); queueProgress();
}
function reportNotes() {
  const ids = RP.list.map(r => r.id), first = !S.seen.rep.length && !S.seen.repAt;
  if (!first) RP.list.filter(r => !S.seen.rep.includes(r.id)).forEach(r => addNote(`New report about ${r.name}: ${r.reason}`, '#players'));
  S.seen.rep = ids.slice(0, 200); S.seen.repAt = Date.now(); save();
}
function startSocialPoll() { // friend requests and private messages arrive even when you're on another page
  clearInterval(startSocialPoll.t);
  startSocialPoll.t = setInterval(async () => { if (!me() || !S.pub) return; await loadPlayers(true); if (current === 'players') paintPlayers(); pullDMs(); }, 60000);
}

/* ---------- private messages ----------
   End-to-end encrypted between two friends. Each player has an ECDH key made on their device, and its public half
   is in their signed public profile. Two friends derive the same AES key from their own private key and the other's
   public key, so only their two devices can read the messages, not the owner and not Wix. Everything I send lives in
   one "outbox" item signed with my profile key, so nobody can fake a message from me. */
const DM = {open:'', keys:new Map(), timer:null, busy:false, lastSend:0, status:'', pulling:false};
async function dmKey() {
  let k = null; try { k = await mediaGet('dmkey'); } catch {}
  if (k && k.priv && k.x) return k;
  const pair = await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, false, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  k = {priv:pair.privateKey, x:pub.x, y:pub.y}; await mediaPut('dmkey', k); return k;
}
async function pairKey(p) {
  const id = p.u + '|' + p.dx; if (DM.keys.has(id)) return DM.keys.get(id);
  const mine = await dmKey(), pub = await crypto.subtle.importKey('jwk', {kty:'EC', crv:'P-256', x:p.dx, y:p.dy}, {name:'ECDH', namedCurve:'P-256'}, false, []);
  const k = await crypto.subtle.deriveKey({name:'ECDH', public:pub}, mine.priv, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  DM.keys.set(id, k); return k;
}
const dmAad = (from, to, x) => enc.encode(`dm|${from}|${to}|${x.id}|${x.at}`);
const dmFriends = () => PL.list.filter(p => p.u !== myU() && isFriend(friendState(p.u)));
const canDM = p => !!(p && p.dx && p.dy && isFriend(friendState(p.u)) && S.pub);
const dmUnread = u => (S.dm[u] || []).filter(x => !x.f && x.at > (S.dmRead[u] || 0)).length;
const dmUnreadAll = () => Object.keys(S.dm).reduce((a, u) => a + dmUnread(u), 0);
function dmDot() { const n = dmUnreadAll(); $$('[data-route="messages"], .tile[href="#messages"]').forEach(a => { a.classList.toggle('has-req', n > 0); a.title = n ? `Messages · ${n} unread` : 'Messages'; }); }
async function publishOutbox() {
  if (!me() || !S.pub || DM.busy) return false; DM.busy = true;
  try {
    const k = await profileKey(), u = myU(), m = [];
    for (const [to, list] of Object.entries(S.dm)) { const p = PL.by.get(to); if (!p || !p.dx) continue; const key = await pairKey(p);
      for (const x of list.filter(x => x.f).slice(-40)) { const iv = crypto.getRandomValues(new Uint8Array(12));
        m.push({to, id:x.id, at:x.at, iv:b64(iv), ct:b64(await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:dmAad(u, to, x)}, key, enc.encode(JSON.stringify({t:x.t}))))}); } }
    m.sort((a, b) => a.at - b.at);
    const d = JSON.stringify({v:1, u, m:m.slice(-200), ts:Date.now()});
    await saveItem('dm-' + u, 'dm', sealed(d, await signText(k.priv, d)));
    S.dmDirty = false; save(); return true;
  } catch { S.dmDirty = true; save(); return false; }
  finally { DM.busy = false; }
}
async function readOutbox(item, p, me_) { // the messages a friend sent me, after checking their signature
  try {
    const w = JSON.parse(String((item.data || {}).payload || '')); if (typeof w.d !== 'string' || w.d.length > 480000 || typeof w.s !== 'string') return [];
    const o = JSON.parse(w.d); if (!o || o.v !== 1 || o.u !== p.u || String(item.id) !== 'dm-' + p.u || !(await verifyWith(p, w.s, w.d))) return [];
    const key = await pairKey(p), out = [];
    for (const x of arr(o.m)) { if (!x || x.to !== me_ || !/^[0-9a-f]{8,32}$/.test(x.id) || typeof x.iv !== 'string' || typeof x.ct !== 'string') continue;
      try { const at = num(x.at, 0, 0, 1e15), r = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(x.iv), additionalData:dmAad(p.u, me_, {id:x.id, at})}, key, unb64(x.ct))));
        if (r && typeof r.t === 'string') out.push({id:x.id, f:false, t:cleanText(r.t, 500), at}); } catch {} }
    return out;
  } catch { return []; }
}
async function pullDMs(only) {
  const me_ = myU(); if (!me_ || !S.pub || DM.pulling) return; DM.pulling = true;
  try {
    if (!PL.at) await loadPlayers();
    if (S.dmDirty) await publishOutbox();
    const fr = (only ? [PL.by.get(only)] : dmFriends()).filter(canDM); if (!fr.length) return;
    const items = await queryItems({_id:{$in:fr.map(p => 'dm-' + p.u)}}, 100), fresh = new Map();
    for (const it of items) { const p = fr.find(x => 'dm-' + x.u === String(it.id)); if (!p) continue;
      const have = new Set((S.dm[p.u] || []).map(x => x.id));
      for (const x of await readOutbox(it, p, me_)) if (!have.has(x.id)) { (S.dm[p.u] ||= []).push(x); fresh.set(p.u, (fresh.get(p.u) || 0) + 1); } }
    for (const [u, n] of fresh) { S.dm[u].sort((a, b) => a.at - b.at); S.dm[u] = S.dm[u].slice(-200);
      const looking = current === 'messages' && DM.open === u && document.visibilityState === 'visible';
      if (looking) S.dmRead[u] = Date.now(); else addNote(`${n === 1 ? 'New message' : `${n} new messages`} from ${(PL.by.get(u) || {n:u}).n}`, '#messages', true, u); }
    if (fresh.size) { save(); if (current === 'messages') paintDM(); }
    DM.status = '';
  } catch { DM.status = "Can't reach the server right now. Trying again…"; }
  finally { DM.pulling = false; dmDot(); }
}
async function sendDM(u, text) {
  const t = cleanText(text, 500); if (!t) return false;
  if (Date.now() - DM.lastSend < 1000) { toast('Slow down a little.'); return false; }
  DM.lastSend = Date.now();
  (S.dm[u] ||= []).push({id:randHex(8), f:true, t, at:Date.now()}); S.dm[u] = S.dm[u].slice(-200); S.dmRead[u] = Date.now(); S.stats.dm++; save(); paintDM();
  const ok = await publishOutbox(); if (!ok) toast("Saved here, but couldn't send yet. It will try again."); paintDM(); return true;
}
function dmListHTML() {
  const fr = dmFriends().sort((a, b) => ((S.dm[b.u] || []).slice(-1)[0] || {at:0}).at - ((S.dm[a.u] || []).slice(-1)[0] || {at:0}).at);
  return fr.map(p => { const last = (S.dm[p.u] || []).slice(-1)[0], n = dmUnread(p.u);
    return `<li><button type="button" class="dm-who${DM.open === p.u ? ' on' : ''}" data-dm="${p.u}"${DM.open === p.u ? ' aria-current="true"' : ''}>${plAvatar(p)}<span class="grow"><b>${esc(p.n)}</b><span class="muted small dm-last">${last ? `${last.f ? 'You: ' : ''}${esc(last.t)}` : canDM(p) ? 'Say hi!' : 'Needs to open the app once'}</span></span>${n ? `<span class="tag p">${n}</span>` : ''}</button></li>`; }).join('')
    || `<li class="empty">${PL.at ? 'No friends yet. Add friends on the Players page, then message them here.' : PL.status === 'offline' ? "Can't reach the server right now." : 'Loading friends…'}</li>`;
}
function dmConvHTML() {
  const p = PL.by.get(DM.open); if (!p) return `<div class="dm-empty muted">${icon('messages')}<p>Pick a friend to start a private conversation.</p></div>`;
  const list = S.dm[p.u] || [];
  return `<div class="dm-head"><button type="button" class="iconbtn dm-back" data-dmback aria-label="Back to conversations">${icon('back')}</button><button type="button" class="friend-who" data-player="${p.u}">${plAvatar(p)}<span><b>${esc(p.n)}</b><br><span class="muted small">🔒 End-to-end encrypted</span></span></button></div>
    <ol class="dm-msgs" id="dmMsgs" aria-live="polite">${list.map(x => `<li class="dm-msg${x.f ? ' me' : ''}"><span class="dm-t" translate="no">${esc(x.t)}</span><span class="dim small">${fmtTime(x.at)}${x.f ? '' : ` · <button type="button" class="linkbtn small" data-dmrep="${x.id}">Report</button>`}</span></li>`).join('') || '<li class="empty">No messages yet. Say hi! 👋</li>'}</ol>
    ${canDM(p) ? `<form class="row dm-form" id="dmForm"><input id="dmIn" class="grow" maxlength="500" autocomplete="off" placeholder="Message ${esc(p.n)}" aria-label="Message ${esc(p.n)}"><button class="btn primary">Send</button></form>`
      : `<p class="muted small" style="margin:0">${isFriend(friendState(p.u)) ? `${esc(p.n)} needs to open the new version of LevelUp Life once before you can message them.` : `You can only message friends.`}</p>`}`;
}
function paintDM() {
  const l = $('#dmList'), c = $('#dmConv'); if (!l || !c) return;
  l.innerHTML = dmListHTML();
  const keep = $('#dmIn') ? $('#dmIn').value : '', had = document.activeElement && document.activeElement.id === 'dmIn';
  c.innerHTML = dmConvHTML(); $('#dmWrap').classList.toggle('open', !!DM.open);
  const inp = $('#dmIn'); if (inp) { inp.value = keep; if (had) inp.focus(); }
  const ms = $('#dmMsgs'); if (ms) ms.scrollTop = ms.scrollHeight;
  if (DM.open && document.visibilityState === 'visible') { const before = dmUnread(DM.open); S.dmRead[DM.open] = Date.now(); if (before) { save(); l.innerHTML = dmListHTML(); } }
  const st = $('#dmStatus'); if (st) st.textContent = DM.status; dmDot();
}
VIEWS.messages = () => {
  if (!me()) return `<div class="grid">${card('c12', 'Private messages', `<p class="muted" style="margin-top:-6px">Make an account and add friends to send private, end-to-end encrypted messages.</p><div class="row"><button type="button" class="btn primary" data-open-auth="signup">${icon('user')}Create account</button><button type="button" class="btn" data-open-auth="login">Log in</button></div>`)}</div>`;
  if (!S.pub) return `<div class="grid">${card('c12', 'Private messages', `<p class="muted" style="margin-top:-6px">Private messages are for friends. Make your profile public first so friends can find you; your messages stay end-to-end encrypted.</p><div class="row"><button type="button" class="btn primary" id="dmGoPublic">${icon('globe')}Make my profile public</button><a class="btn" href="#players">Players</a></div>`)}</div>`;
  return `<div class="grid"><section class="card c12 dm-card"><div class="dm-wrap${DM.open ? ' open' : ''}" id="dmWrap"><div class="dm-side"><div class="card-h"><h2>Friends</h2></div><ul class="dm-list" id="dmList"></ul></div><div class="dm-main" id="dmConv"></div></div>
    <p class="muted small" style="margin:12px 0 0"><span id="dmStatus"></span> 🔒 Only you and your friend can read these messages, not even the owner. They are readable on the device you use LevelUp Life on.</p></section></div>`;
};
function stopDM() { clearInterval(DM.timer); DM.timer = null; }
BIND.messages = m => {
  m.querySelectorAll('[data-open-auth]').forEach(b => b.onclick = () => openAuth(b.dataset.openAuth));
  const gp = $('#dmGoPublic'); if (gp) gp.onclick = goPublic;
  if (!$('#dmWrap')) return;
  m.addEventListener('click', e => {
    const w = e.target.closest('[data-dm]'); if (w) { DM.open = w.dataset.dm; paintDM(); pullDMs(DM.open); const i = $('#dmIn'); if (i) i.focus(); return; }
    if (e.target.closest('[data-dmback]')) { DM.open = ''; paintDM(); return; }
    const r = e.target.closest('[data-dmrep]'); if (r) { const x = (S.dm[DM.open] || []).find(y => y.id === r.dataset.dmrep), p = PL.by.get(DM.open); if (x && p) openReport({u:p.u, name:p.n, msg:{t:x.t, at:x.at}}); }
  });
  m.addEventListener('submit', async e => { if (e.target.id !== 'dmForm') return; e.preventDefault(); const i = $('#dmIn'), v = i.value; i.value = ''; if (!(await sendDM(DM.open, v))) i.value = v; const j = $('#dmIn'); if (j) j.focus(); });
  paintDM();
  loadPlayers().then(() => { if (DM.open && !PL.by.has(DM.open)) DM.open = ''; paintDM(); pullDMs(); });
  stopDM(); DM.timer = setInterval(() => { if (document.visibilityState === 'visible' && current === 'messages') pullDMs(); }, 6000);
};

/* ---------- study groups: see each other's focus timers live ----------
   Like the chat, a group is joined with a code: the code makes the encryption key, and the group id is a hash of it.
   Each device keeps one status item (name, timer mode and end time) that it updates while you're in a group. */
const GR = {code:'', kind:'', key:null, members:[], timer:null, tick:null, beat:0, status:'', loading:false};
const normGroup = c => String(c).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
async function openGroup(code) {
  const n = normGroup(code); if (n.length < 6) throw new Error('short');
  GR.code = n; GR.kind = 'grp-' + (await sha256('levelup-group-v1|' + n)).slice(0, 32);
  const base = await crypto.subtle.importKey('raw', enc.encode(n), 'PBKDF2', false, ['deriveKey']);
  GR.key = await crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:enc.encode('levelup-group-v1'), iterations:100000}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  GR.members = []; GR.status = 'Loading the group…';
}
const myGroupState = () => ({st:T.running ? (T.mode === 'work' ? 'focus' : 'break') : T.left < modeLen(T.mode) ? 'paused' : 'idle', end:T.running ? T.end : 0, left:T.running ? 0 : T.left});
async function sendGroupState(leaving) {
  if (!GR.key && !leaving) return;
  try {
    if (leaving) { await saveItem('gs-' + S.gid, 'grp-left', ''); return; }
    const iv = crypto.getRandomValues(new Uint8Array(12)), s = {n:displayName().slice(0, 24), ...myGroupState(), c:S.log.filter(x => x.d === today() && x.ref === 'focus').length, ts:Date.now()};
    await saveItem('gs-' + S.gid, GR.kind, b64(iv) + '.' + b64(await crypto.subtle.encrypt({name:'AES-GCM', iv}, GR.key, enc.encode(JSON.stringify(s)))));
    GR.beat = Date.now();
  } catch {}
}
async function pullGroup() {
  if (!GR.key || GR.loading) return; GR.loading = true;
  try {
    const items = await queryItems({kind:GR.kind}, 50), list = [];
    for (const it of items) { try { const [iv, ct] = String((it.data || {}).payload || '').split('.'); if (!iv || !ct || ct.length > 4000) continue;
      const s = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(iv)}, GR.key, unb64(ct))));
      const ts = num(s.ts, 0, 0, 1e15); if (!s || Date.now() - ts > 180000) continue; // gone quiet for 3 minutes: not here any more
      list.push({id:String(it.id), me:String(it.id) === 'gs-' + S.gid, n:cleanText(s.n, 24) || 'Player', st:['focus', 'break', 'paused', 'idle'].includes(s.st) ? s.st : 'idle', end:num(s.end, 0, 0, 1e15), left:num(s.left, 0, 0, 1e5), c:num(s.c, 0, 0, 999), ts}); } catch {} }
    GR.members = list.sort((a, b) => b.me - a.me || a.n.localeCompare(b.n)); GR.status = '';
  } catch { GR.status = "Can't reach the group right now. Trying again…"; }
  GR.loading = false; paintGroup();
}
const othersFocusing = () => GR.members.some(m => !m.me && (m.st === 'focus' || Date.now() - m.ts < 120000));
function memberTime(m) { const left = m.st === 'focus' || m.st === 'break' ? Math.max(0, Math.round((m.end - Date.now()) / 1000)) : m.left; return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; }
const ST_NAME = {focus:'Focusing', break:'On a break', paused:'Paused', idle:'Not started'};
function paintGroup() {
  const box = $('#grpBox'); if (!box) return;
  if (!GR.key) { box.innerHTML = `<p class="muted" style="margin-top:-6px">Study with friends: everyone in a group sees each other's focus timers live. Share the code only with people you know.</p>
    <div class="row"><button type="button" class="btn primary" id="grpNew">${icon('plus')}Create a group</button></div>
    <form class="row" id="grpJoin" style="margin-top:10px"><input id="grpCode" class="grow" maxlength="40" autocomplete="off" placeholder="Group code" aria-label="Group code"><button class="btn">Join</button></form><p class="err" id="grpErr" role="alert"></p>`; return; }
  box.innerHTML = `<div class="row" style="gap:8px"><span class="muted small">Code</span><code class="grp-code">${esc(GR.code)}</code><button type="button" class="btn sm" id="grpCopy">${icon('link')}Copy</button><span class="spacer"></span><button type="button" class="btn sm" id="grpLeave">Leave</button></div>
    <ul class="grp-list" id="grpList">${GR.members.map(m => `<li class="grp-m ${m.st}"><span class="avatar" style="background:${hue(m.n)}">${esc(m.n.charAt(0).toUpperCase())}</span><span class="grow"><b>${esc(m.n)}</b>${m.me ? ' <span class="tag">You</span>' : ''}<br><span class="muted small">${ST_NAME[m.st]}${m.c ? ` · ${m.c} session${m.c === 1 ? '' : 's'} today` : ''}</span></span><span class="grp-time" data-gm="${esc(m.id)}">${m.st === 'idle' ? '' : memberTime(m)}</span></li>`).join('') || `<li class="muted small">${GR.status || 'Nobody here yet.'}</li>`}</ul>
    <p class="muted small" style="margin:10px 0 0">${GR.status ? esc(GR.status) + ' ' : ''}Shared with the group: your name and your timer. Finish a focus session while someone else is studying for +10 bonus XP.</p>`;
}
function groupTick() { for (const el of $$('[data-gm]')) { const m = GR.members.find(x => x.id === el.dataset.gm); if (m && (m.st === 'focus' || m.st === 'break')) el.textContent = memberTime(m); } }
function stopGroup() { clearInterval(GR.timer); clearInterval(GR.tick); GR.timer = GR.tick = null; }
function startGroup() {
  stopGroup(); if (!GR.key) return; pullGroup();
  GR.timer = setInterval(() => { if (document.visibilityState !== 'visible') return; if (Date.now() - GR.beat > 45000) sendGroupState(); if (current === 'focus') pullGroup(); }, 8000);
  GR.tick = setInterval(groupTick, 1000);
}
async function joinGroup(code) {
  const n = displayName();
  if (!isOwner && !isAdmin && /owner|admin/i.test(n)) { toast('Names with "owner" or "admin" can\'t join groups. Change your nickname in Settings.'); return false; }
  await openGroup(code); S.group = GR.code; save(); await sendGroupState(); startGroup(); paintGroup(); return true;
}
async function leaveGroup() { stopGroup(); GR.key = null; GR.code = ''; GR.members = []; S.group = ''; save(); paintGroup(); await sendGroupState(true); }
function bindGroup() {
  const box = $('#grpBox'); if (!box) return; paintGroup();
  box.onclick = async e => {
    if (e.target.closest('#grpNew')) { const w = ['focus', 'study', 'brain', 'level', 'quest', 'pixel']; const c = `${w[crypto.getRandomValues(new Uint8Array(1))[0] % w.length]}-${randHex(3)}-${randHex(3)}`;
      if (await joinGroup(c)) toast('Group created. Share the code with your friends.'); }
    if (e.target.closest('#grpCopy')) { try { await navigator.clipboard.writeText(GR.code); toast('Code copied'); } catch { toast(`The code is ${GR.code}`); } }
    if (e.target.closest('#grpLeave')) { await leaveGroup(); toast('You left the group'); }
  };
  box.onsubmit = async e => { if (e.target.id !== 'grpJoin') return; e.preventDefault(); const v = $('#grpCode').value, err = $('#grpErr');
    if (normGroup(v).length < 6) return err.textContent = 'Group codes are at least 6 characters.';
    if (await joinGroup(v)) toast('Joined the group'); };
}

/* ---------- app shell: offline, updates and installing ---------- */
const APP = {install:null, update:false};
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function setupShell() {
  const bar = document.createElement('div'); bar.className = 'update-bar'; bar.id = 'updateBar'; bar.hidden = true; bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>A new version of LevelUp Life is ready.</span><button type="button" class="btn sm primary" id="updateBtn">Reload</button><button type="button" class="iconbtn" id="updateLater" aria-label="Later">${icon('x')}</button>`;
  const chip = document.createElement('div'); chip.className = 'net-chip'; chip.id = 'netChip'; chip.hidden = true; chip.setAttribute('role', 'status');
  chip.textContent = 'Offline · your progress is still saved on this device';
  document.body.append(bar, chip);
  bar.querySelector('#updateBtn').onclick = () => location.reload();
  bar.querySelector('#updateLater').onclick = () => { bar.hidden = true; };
  const net = () => { chip.hidden = navigator.onLine; };
  window.addEventListener('online', () => { net(); toast('Back online'); }); window.addEventListener('offline', net); net();
  if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol)) { // websites only (not the desktop app)
    navigator.serviceWorker.register('levelup-sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'update' && !APP.update) { APP.update = true; bar.hidden = false; } });
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); APP.install = e; if (current === 'options') rerender(); });
  window.addEventListener('appinstalled', () => { APP.install = null; toast('LevelUp Life is installed'); if (current === 'options') rerender(); });
}
async function installApp() {
  if (!APP.install) { location.hash = '#options'; return; }
  APP.install.prompt(); const r = await APP.install.userChoice.catch(() => null); APP.install = null;
  if (r && r.outcome === 'accepted') toast('Installing LevelUp Life…'); if (current === 'options') rerender();
}
function appCard() {
  const body = isStandalone() ? `<p class="muted" style="margin-top:-6px">You're using the installed app. It opens from your desktop or home screen and works offline.</p>`
    : APP.install ? `<p class="muted" style="margin-top:-6px">Install LevelUp Life to open it from your desktop or home screen like a normal app. It works offline too.</p><button type="button" class="btn primary" id="installBtn">${icon('download')}Install app</button>`
    : isIOS() ? `<p class="muted" style="margin-top:-6px">To install on iPhone or iPad: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p>`
    : `<p class="muted" style="margin-top:-6px">To install: in Chrome or Edge, use the install icon at the right of the address bar, or open the browser menu and choose <b>Install LevelUp Life</b>. On Windows you can also use the desktop installer.</p>`;
  return card('c6', 'App', body + `<p class="muted small" style="margin:12px 0 0">After your first visit the app opens offline too. Chat and Players need the internet.</p>`);
}

/* ---------- first-visit tour ---------- */
const isPhone = () => matchMedia('(max-width: 860px)').matches;
const TOUR = [
  {t:'Welcome to LevelUp Life! 👋', b:'Here is a quick tour of where everything is. It takes about 30 seconds, and you can skip it any time.'},
  {sel:() => isPhone() ? '#bottomnav' : '#nav', t:'Pages', b:'Study, Focus, Gaming, Series, YouTube and more. On a computer you can scroll this menu with your mouse wheel.'},
  {sel:'.profile', t:'Your level', b:'Earn XP by studying, focusing, finishing games and doing good deeds. Click here to see your badges.'},
  {sel:'#searchBtn', t:'Search everything', b:'Find any page or action. Shortcut: Ctrl + K. The number keys 1 to 9 jump between pages.'},
  {sel:() => isPhone() ? '#moreBtn' : '#nav [data-route="players"]', t:'Players and chat', b:'Join the leaderboard, add friends and chat. All of it is optional: your progress stays private until you choose otherwise.'},
  {sel:'a.round[href="#options"]', t:'Settings', b:'Light or dark mode, your account, public profile, backups and installing the app.'},
  {t:"You're ready! 🎮", b:'Start with today’s quests on the Help the World page, or open Study to pick a track. Have fun!'},
];
const TR = {i:-1, el:null, back:null};
function startTour() {
  closePalette(); closeProfile(); TR.back = document.activeElement; TR.i = 0;
  if (!TR.el) {
    TR.el = document.createElement('div'); TR.el.className = 'tour'; TR.el.hidden = true;
    TR.el.innerHTML = `<div class="tour-hole" aria-hidden="true"></div><div class="tour-box" role="dialog" aria-modal="true" aria-labelledby="tourT" aria-describedby="tourB">
      <p class="dim small" id="tourN" style="margin:0"></p><h2 id="tourT"></h2><p id="tourB" class="muted"></p>
      <div class="row tour-btns"><button type="button" class="linkbtn" id="tourSkip">Skip tour</button><span class="spacer"></span><button type="button" class="btn sm" id="tourBack">Back</button><button type="button" class="btn sm primary" id="tourNext">Next</button></div></div>`;
    document.body.append(TR.el);
    TR.el.querySelector('#tourSkip').onclick = () => endTour();
    TR.el.querySelector('#tourBack').onclick = () => { if (TR.i > 0) { TR.i--; paintTour(); } };
    TR.el.querySelector('#tourNext').onclick = () => { if (TR.i < TOUR.length - 1) { TR.i++; paintTour(); } else endTour(); };
    window.addEventListener('resize', () => { if (TR.i >= 0) paintTour(); });
  }
  TR.el.hidden = false; paintTour();
}
function paintTour() {
  const s = TOUR[TR.i], sel = typeof s.sel === 'function' ? s.sel() : s.sel, target = sel ? $(sel) : null;
  const hole = TR.el.querySelector('.tour-hole'), box = TR.el.querySelector('.tour-box');
  TR.el.querySelector('#tourN').textContent = `Step ${TR.i + 1} of ${TOUR.length}`;
  TR.el.querySelector('#tourT').textContent = s.t; TR.el.querySelector('#tourB').textContent = s.b;
  TR.el.querySelector('#tourBack').disabled = TR.i === 0;
  TR.el.querySelector('#tourNext').textContent = TR.i === TOUR.length - 1 ? 'Finish' : 'Next';
  if (target && target.getClientRects().length) { // (pinned elements like the phone menu have no offsetParent)
    if (target.closest('#nav') && target !== $('#nav')) target.scrollIntoView({block:'nearest', inline:'nearest'});
    const r = target.getBoundingClientRect(), pad = 6;
    TR.el.classList.remove('center'); hole.style.display = 'block';
    Object.assign(hole.style, {left:`${r.left - pad}px`, top:`${r.top - pad}px`, width:`${r.width + pad * 2}px`, height:`${r.height + pad * 2}px`});
    const bw = box.offsetWidth, bh = box.offsetHeight, below = r.bottom + 16 + bh < innerHeight;
    box.style.top = `${below ? r.bottom + 16 : Math.max(12, r.top - 16 - bh)}px`;
    box.style.left = `${Math.min(Math.max(12, r.left + r.width / 2 - bw / 2), innerWidth - bw - 12)}px`;
  } else { TR.el.classList.add('center'); hole.style.display = 'none'; box.style.top = box.style.left = ''; }
  TR.el.querySelector('#tourNext').focus();
}
function endTour() {
  if (!TR.el || TR.i < 0) return;
  TR.el.hidden = true; TR.i = -1; if (!S.toured) { S.toured = true; save(); }
  if (TR.back && TR.back.focus) try { TR.back.focus(); } catch {}
}
function maybeTour() { // new players only; automated test browsers are skipped so they can click freely
  if (S.toured || navigator.webdriver || !ACC.current || !$('#consent').hidden) return;
  setTimeout(() => { if (!S.toured && TR.i < 0 && $('#consent').hidden) startTour(); }, 700);
}

/* ---------- keep keyboard focus inside open pop-ups ---------- */
function openDialog() {
  if (TR.el && !TR.el.hidden) return TR.el.querySelector('.tour-box');
  for (const sel of ['#playerModal', '#consent', '#palette']) { const d = $(sel); if (d && !d.hidden) return d.querySelector('.modal-box, .palette-box') || d; }
  return null;
}
function trapFocus(e) {
  if (e.key !== 'Tab') return; const d = openDialog(); if (!d) return;
  const f = [...d.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!d.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- backup reminder ---------- */
const hasData = () => S.xp >= 100 || S.tasks.length + S.series.length + S.backlog.length + S.yt.length >= 3 || Object.keys(S.lessons).length >= 2;
const needBackup = () => hasData() && Date.now() - Math.max(S.lastBackup, S.since) > 14 * 864e5 && Date.now() > S.backupSnooze;
function downloadBackup() {
  S.lastBackup = Date.now(); save();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], {type:'application/json'}));
  a.download = `levelup-life-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup downloaded. Keep the file somewhere safe.');
}

/* ---------- reports: encrypted so only the owner and admins can read them ---------- */
const REASONS = ['Spam', 'Bullying or hate', 'Inappropriate name or picture', 'Cheating', 'Something else'];
const RP = {list:[], log:[], at:0, need:false, loading:null};
async function sealForStaff(obj) { // a fresh key per report, wrapped for the owner key and the admin key
  const eph = await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, true, ['deriveKey']), epk = await crypto.subtle.exportKey('jwk', eph.publicKey);
  const cek = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt']), raw = await crypto.subtle.exportKey('raw', cek);
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, cek, enc.encode(JSON.stringify(obj)));
  const keys = {};
  for (const [role, pub] of [['owner', OWNER_PUB], ['admin', ADMIN_PUB]]) {
    const pk = await crypto.subtle.importKey('jwk', {kty:'EC', crv:'P-256', x:pub.x, y:pub.y}, {name:'ECDH', namedCurve:'P-256'}, false, []);
    const kek = await crypto.subtle.deriveKey({name:'ECDH', public:pk}, eph.privateKey, {name:'AES-GCM', length:256}, false, ['encrypt']);
    const kiv = crypto.getRandomValues(new Uint8Array(12)); keys[role] = {iv:b64(kiv), ct:b64(await crypto.subtle.encrypt({name:'AES-GCM', iv:kiv}, kek, raw))};
  }
  return {v:1, epk:{x:epk.x, y:epk.y}, iv:b64(iv), ct:b64(ct), keys};
}
async function openSealed(env, role, dh) {
  const w = env.keys && env.keys[role]; if (!w || !env.epk) return null;
  const epk = await crypto.subtle.importKey('jwk', {kty:'EC', crv:'P-256', x:env.epk.x, y:env.epk.y}, {name:'ECDH', namedCurve:'P-256'}, false, []);
  const kek = await crypto.subtle.deriveKey({name:'ECDH', public:epk}, dh, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const raw = await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(w.iv)}, kek, unb64(w.ct));
  const cek = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(env.iv)}, cek, unb64(env.ct))));
}
function openReport(target) { // target: {u, name, msg?}
  const m = ensureProfileModal(); if (m.hidden) PM.back = document.activeElement; openU = ''; m.hidden = false;
  $('#pmBody').innerHTML = `<div class="pm-body"><h2>Report ${esc(target.name)}</h2>
    <p class="muted" style="margin:0">Reports go privately to the owner and admins. Only they can read them.</p>
    ${target.msg ? `<blockquote class="rep-quote">${esc(target.msg.t)}</blockquote>` : ''}
    <form class="form" id="repForm"><fieldset class="rep-reasons"><legend>What's wrong?</legend>${REASONS.map((r, i) => `<label class="row"><input type="radio" name="repWhy" value="${i}"${i ? '' : ' checked'}> ${r}</label>`).join('')}</fieldset>
    <label class="field"><span>Anything else the owner should know? (optional)</span><textarea id="repNote" maxlength="300" rows="3"></textarea></label>
    <p class="err" id="repErr" role="alert"></p>
    <div class="row"><button class="btn primary">Send report</button><button type="button" class="btn" data-close-pm>Cancel</button></div></form></div>`;
  $('#repForm').onsubmit = async e => {
    e.preventDefault(); const err = $('#repErr'); err.textContent = '';
    S.repAt = S.repAt.filter(x => x > Date.now() - 864e5);
    if (S.repAt.length && Date.now() - S.repAt[S.repAt.length - 1] < 60000) return err.textContent = 'Please wait a minute before sending another report.';
    if (S.repAt.length >= 10) return err.textContent = "You've sent a lot of reports today. Please try again tomorrow.";
    const btn = e.target.querySelector('.btn.primary'); btn.disabled = true;
    try {
      const why = +(($('input[name="repWhy"]:checked') || {}).value || 0);
      const env = await sealForStaff({v:1, target:{u:target.u || '', name:target.name}, msg:target.msg ? {t:target.msg.t.slice(0, 500), at:target.msg.at || 0} : null,
        reason:why, note:$('#repNote').value.replace(/\p{Cc}/gu, ' ').trim().slice(0, 300), by:{name:displayName().slice(0, 24), u:myU()}, ts:Date.now()});
      await saveItem('rep-' + randHex(8), 'report', JSON.stringify({v:1, env}));
      S.repAt.push(Date.now()); save(); closeProfile(); toast('Report sent. Thank you for helping keep LevelUp Life friendly.');
    } catch { btn.disabled = false; err.textContent = "Couldn't send the report. Check your connection and try again."; }
  };
  setTimeout(() => { const r = $('input[name="repWhy"]'); if (r) r.focus(); }, 30);
}
async function reportMsg(id) { // make sure we know which player sent it (their signature is checked first)
  const m = C.msgs.find(x => x.id === id); if (!m) return;
  if (m.u && m.ps && m.pv === undefined) { await loadPlayers(); const p = PL.by.get(m.u); if (p) { m.pv = await verifyWith(p, m.ps, sigText(m) + '|' + m.u); C.pv.set(m.id, m.pv); } }
  const p = chatPlayer(m); openReport({u:p ? p.u : '', name:m.n, msg:{t:m.t, at:m.at}});
}
const repTarget = r => r.u || (PL.by.has(r.name.toLowerCase()) ? r.name.toLowerCase() : ''); // a public player with that name
const cleanLog = v => arr(v).filter(e => e && ['hide', 'show'].includes(e.a) && USER_OK.test(e.u) && num(e.ts, 0, 0, 1e15) > 0).map(e => ({a:e.a, u:e.u, by:str(e.by, 24), ts:num(e.ts, 0, 0, 1e15)})).slice(-100);
async function loadReports(force) {
  if (!(isOwner || isAdmin)) return;
  if (!force && Date.now() - RP.at < 30000) return; if (RP.loading) return RP.loading;
  RP.loading = (async () => {
    try {
      const role = isOwner ? 'owner' : 'admin'; let dh = null; try { dh = await mediaGet(role + 'dh'); } catch {}
      RP.need = !dh; const items = [];
      for (let off = 0; off < 500; off += 100) { const got = await queryItems({kind:'report'}, 100, off); items.push(...got); if (got.length < 100) break; }
      const list = [], log = [];
      for (const it of items) {
        try {
          const id = String(it.id || (it.data || {})._id), w = JSON.parse(String((it.data || {}).payload || ''));
          if (w.res) { // handled: signed by the owner or an admin
            if (['owner', 'admin'].includes(w.role) && await verifyWith(w.role === 'owner' ? OWNER_PUB : ADMIN_PUB, String(w.sig), `res|${id}|${w.ts}|${w.act}|${w.u || ''}`))
              log.push({a:w.act === 'hidden' ? 'report-hide' : 'report-done', u:str(w.u, 24) || 'a player', by:str(w.by, 24), role:w.role, ts:num(w.ts, 0, 0, 1e15)});
          } else if (w.env && dh) {
            const r = await openSealed(w.env, role, dh); if (!r || !r.target) continue;
            list.push({id, reason:REASONS[num(r.reason, 4, 0, 4)], u:USER_OK.test(r.target.u) ? r.target.u : '', name:str(r.target.name, 24), msg:r.msg ? str(r.msg.t, 500) : '',
              note:str(r.note, 300), by:str(r.by && r.by.name, 24), byU:r.by && USER_OK.test(r.by.u) ? r.by.u : '', ts:num(r.ts, 0, 0, 1e15)});
          }
        } catch {}
      }
      RP.list = list.sort((a, b) => b.ts - a.ts); RP.log = log; RP.at = Date.now(); if (dh) reportNotes();
    } catch {}
    finally { RP.loading = null; }
    reqDot();
  })();
  return RP.loading;
}
async function resolveReport(id, act) {
  const r = RP.list.find(x => x.id === id), st = await staffKey(); if (!r) return;
  if (!st) return toast(`Open Chat and enter your ${isOwner ? 'owner' : 'admin'} key once on this device first.`);
  try {
    const tu = repTarget(r); if (act === 'hidden' && tu) await setHidden(tu, true);
    const ts = Date.now(), by = displayName().slice(0, 24), sig = await signText(st[1], `res|${id}|${ts}|${act}|${r.u || r.name}`);
    await saveItem(id, 'report', JSON.stringify({v:1, res:true, role:st[0], act, u:r.u || r.name, by, ts, sig}));
    RP.list = RP.list.filter(x => x.id !== id); RP.log.push({a:act === 'hidden' ? 'report-hide' : 'report-done', u:r.u || r.name, by, role:st[0], ts});
    toast(act === 'hidden' ? `Report handled · ${r.name} is hidden from the leaderboard` : 'Report marked as handled'); reqDot(); paintMod();
  } catch { toast("Couldn't reach the server. Try again."); }
}
const MOD_WORDS = {hide:'hid', show:'showed again', mute:'muted', unmute:'unmuted', 'report-done':'handled a report about', 'report-hide':'hid (after a report)'};
function paintMod() {
  const box = $('#repBox'), lg = $('#modLog'); if (!box) return;
  const rc = $('#repCount'); if (rc) { rc.textContent = RP.list.length; rc.hidden = !RP.list.length; }
  box.innerHTML = RP.need ? `<p class="muted" style="margin-top:0">Enter your ${isOwner ? 'owner' : 'admin'} key once on this device to open reports. Reports are encrypted so only the owner and admins can read them.</p>
      <form class="row" id="repKeyForm"><input id="repKeyIn" type="password" autocomplete="off" placeholder="${isOwner ? 'Owner' : 'Admin'} key" aria-label="${isOwner ? 'Owner' : 'Admin'} key"><button class="btn">Unlock reports</button></form>`
    : RP.list.map(r => `<div class="rep"><div class="row" style="gap:8px"><b>${esc(r.reason)}</b><span class="dim small">${fmtTime(r.ts)}</span></div>
      <p class="small" style="margin:0">About ${repTarget(r) ? `<button type="button" class="linkbtn" style="padding:0" data-player="${repTarget(r)}">${esc(r.name)}</button>` : `<b>${esc(r.name)}</b>`} · reported by ${r.byU ? `<button type="button" class="linkbtn" style="padding:0" data-player="${r.byU}">${esc(r.by)}</button>` : esc(r.by)}</p>
      ${r.msg ? `<blockquote class="rep-quote">${esc(r.msg)}</blockquote>` : ''}${r.note ? `<p class="muted small" style="margin:0">“${esc(r.note)}”</p>` : ''}
      <div class="row"><button type="button" class="btn sm" data-repres="${esc(r.id)}" data-act="done">${icon('check')}Mark handled</button>${repTarget(r) && canHidePlayer(PL.by.get(repTarget(r))) ? `<button type="button" class="btn sm danger" data-repres="${esc(r.id)}" data-act="hidden">Hide from leaderboard</button>` : ''}</div></div>`).join('')
    || '<p class="muted small" style="margin:0">No open reports. 🎉</p>';
  const kf = $('#repKeyForm'); if (kf) kf.onsubmit = async e => { e.preventDefault(); toast('Checking key…');
    const ok = isOwner ? await unlockSignKey($('#repKeyIn').value) : await unlockAdminSignKey($('#repKeyIn').value);
    if (!ok) return toast('That key is not right.'); await loadReports(true); paintMod(); toast('Reports unlocked'); };
  if (!lg) return;
  const all = [...PL.modlog, ...RP.log, ...(C.modlog || [])].filter(e => e.ts).sort((a, b) => b.ts - a.ts).slice(0, 60);
  lg.innerHTML = all.map(e => `<li>${e.role === 'owner' ? icon('crown') : icon('shield')}<span><b>${esc(e.by || (e.role === 'owner' ? 'Owner' : 'Admin'))}</b> ${MOD_WORDS[e.a] || esc(e.a)} <b>${esc((PL.by.get(String(e.u).toLowerCase()) || {}).n || e.u)}</b>${e.chat ? ' <span class="muted">in chat</span>' : ''}</span><span class="dim small">${fmtTime(e.ts)}</span></li>`).join('')
    || '<li class="muted small">Nothing yet. Hides, mutes and handled reports show up here.</li>';
}
document.addEventListener('click', e => {
  const t = e.target;
  const b = t.closest('[data-backup]'); if (b) { if (b.dataset.backup === 'now') downloadBackup(); else { S.backupSnooze = Date.now() + 7 * 864e5; save(); toast("OK, I'll remind you next week"); } if (current === 'home') rerender(); return; }
  const rp = t.closest('[data-report]'); if (rp) { openReport({u:rp.dataset.report, name:rp.dataset.name || rp.dataset.report}); return; }
  const rm = t.closest('[data-repmsg]'); if (rm) { reportMsg(rm.dataset.repmsg); return; }
  const rs = t.closest('[data-repres]'); if (rs) { resolveReport(rs.dataset.repres, rs.dataset.act); return; }
  if (t.closest('#tourBtn')) startTour();
});

/* ---------- global events ---------- */
/* top menu: hide the icons when they don't fit, then let the mouse wheel (or a drag) scroll it sideways */
function navScroll() {
  const nav = $('#nav'); if (!nav) return;
  const fades = () => { const max = nav.scrollWidth - nav.clientWidth;
    nav.classList.toggle('fade-l', nav.scrollLeft > 2); nav.classList.toggle('fade-r', max > 2 && nav.scrollLeft < max - 2); };
  const fit = () => { // measured with animations paused, so a link halfway through a size change can't fool it
    nav.classList.add('measure'); nav.classList.remove('compact');
    if (nav.scrollWidth > nav.clientWidth + 1) nav.classList.add('compact');
    void nav.offsetWidth; nav.classList.remove('measure'); fades(); };
  nav.addEventListener('wheel', e => {
    const max = nav.scrollWidth - nav.clientWidth; if (max <= 0) return; // nothing to scroll: leave the page alone
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const step = d * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? nav.clientWidth : 1);
    e.preventDefault(); nav.scrollLeft += step; // while the mouse is over the menu, the wheel moves the menu
  }, {passive:false});
  let drag = null;
  nav.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; drag = {x:e.clientX, left:nav.scrollLeft, moved:false}; });
  window.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) drag.moved = true; if (drag.moved) { nav.scrollLeft = drag.left - dx; nav.classList.add('dragging'); } });
  window.addEventListener('pointerup', () => { if (!drag) return; const moved = drag.moved; drag = null; nav.classList.remove('dragging');
    if (moved) nav._dragEnd = Date.now(); });
  nav.addEventListener('click', e => { if (Date.now() - (nav._dragEnd || 0) < 80) { e.preventDefault(); e.stopPropagation(); } }, true); // a drag is not a click
  nav.addEventListener('scroll', fades, {passive:true});
  let lastW = -1; // re-fit whenever the top bar changes width (window resize, scrollbar appearing, fonts loading)
  let fitT = 0;
  const refit = () => { const w = nav.parentElement.clientWidth; if (w !== lastW) { lastW = w; clearTimeout(fitT); fitT = setTimeout(fit, 60); } }; // wait for the new layout to settle
  if ('ResizeObserver' in window) new ResizeObserver(refit).observe(nav.parentElement);
  window.addEventListener('resize', () => { lastW = -1; refit(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  fit();
}
function events() {
  window.addEventListener('hashchange', route);
  navScroll(); setupShell();
  document.addEventListener('keydown', trapFocus);
  $('#themeBtn').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); if (current === 'options') rerender(); };
  $('#searchBtn').onclick = openPalette;
  $('#bellBtn').onclick = () => toggleNotes();
  $('.skip').onclick = e => { e.preventDefault(); $('#main').focus(); };
  document.addEventListener('click', e => {
    const np = $('#notePanel'); if (np && !np.hidden && !np.contains(e.target) && !e.target.closest('#bellBtn')) toggleNotes(false);
    if (e.target.closest('#moreBtn')) $('#sheet').hidden = false;
    else if (e.target.id === 'sheet') $('#sheet').hidden = true;
    if (e.target.id === 'palette') closePalette();
    const li = e.target.closest('#paletteList li[data-i]'); if (li) runPal(+li.dataset.i);
  });
  $('#paletteInput').oninput = () => { palSel = 0; paintPalette(); };
  $('#paletteInput').onkeydown = e => {
    if (e.key === 'ArrowDown') { palSel = Math.min(pal.length - 1, palSel + 1); paintPalette(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); paintPalette(); e.preventDefault(); }
    else if (e.key === 'Enter') runPal(palSel);
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { endTour(); toggleNotes(false); closePalette(); closeProfile(); const ep = $('#emoPick'); if (ep) ep.hidden = true; $('#sheet').hidden = true; if (ACC.current) $('#consent').hidden = true; return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || !$('#palette').hidden || !$('#consent').hidden;
    if (typing || e.ctrlKey || e.metaKey) return;
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const i = ROUTES.findIndex(r => r.id === current), n = (i + (e.key === 'ArrowRight' ? 1 : -1) + ROUTES.length) % ROUTES.length;
      location.hash = `#${ROUTES[n].id}`; e.preventDefault(); return;
    }
    if (e.altKey) return;
    const r = ROUTES.find(x => x.key === e.key); if (r) { location.hash = `#${r.id}`; return; }
    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (e.key === '?') location.hash = '#help';
    else if (e.key.toLowerCase() === 't') $('#themeBtn').click();
    else if (e.key === ' ' && current === 'focus' && !document.activeElement?.closest('button')) { e.preventDefault(); toggleTimer(); }
  });
  $$('[data-auth]').forEach(b => b.onclick = () => setAuthTab(b.dataset.auth));
  $('#signupForm').onsubmit = signup;
  addPeek($('#consent'));
  $('#suPass').oninput = $('#suPass2').oninput = showMatch;
  $('#loginForm').onsubmit = login;
  $('#guestBtn').onclick = asGuest;
  $('#authClose').onclick = () => { $('#consent').hidden = true; };
  $$('.toPrivacy').forEach(a => a.onclick = () => { $('#consent').hidden = true; });
  window.addEventListener('hashchange', () => { if (!ACC.current && current !== 'privacy') openAuth('signup'); });
}

/* ---------- sign up / log in ---------- */
const fails = {n:0, until:0};
function setAuthTab(t) {
  $$('[data-auth]').forEach(b => { b.classList.toggle('on', b.dataset.auth === t); b.setAttribute('aria-selected', String(b.dataset.auth === t)); });
  $('#signupForm').hidden = t !== 'signup'; $('#loginForm').hidden = t !== 'login';
  $('#suErr').textContent = ''; $('#liErr').textContent = '';
  hidePeeks($('#consent'));
}
function openAuth(t = 'signup') {
  $('#consent').hidden = false; $('#authClose').hidden = !ACC.current; $('#guestBtn').hidden = !!ACC.current; setAuthTab(t);
  setTimeout(() => $(t === 'login' ? '#liUser' : '#suUser').focus(), 30);
}
function switchTo(name) { // a username, GUEST, or null for "logged out"
  ACC.current = name; saveAcc(); KEY = keyFor(name);
  resetTimers(); leaveRoom(); C.autoTried = false; C.signKey = null; C.adminSignKey = null; clearTimeout(schedulePublish.t); schedulePublish.t = null; closeProfile(); PL.at = 0; PL.status = ''; TH.key = '';
  S = clean(loadJSON(KEY, {})); isOwner = false; isAdmin = false; clearMedia();
  resumeFocus(); if (S.run.game) startGame(S.run.game.game, S.run.game.start);
  init(); verifyOwner();
}
function logout() { switchTo(null); toast('Logged out'); }
async function signup(e) {
  e.preventDefault(); const err = $('#suErr'); err.textContent = '';
  const name = $('#suUser').value.trim(), pw = $('#suPass').value, email = $('#suEmail').value.trim();
  if (!USER_RE.test(name)) return err.textContent = 'Usernames are 3–20 letters, numbers or underscores.';
  if (ACC.users[name.toLowerCase()]) return err.textContent = 'That username is already used on this device. Pick another or log in.';
  if (pw.length < 8) return err.textContent = 'Use a password with at least 8 characters.';
  if (pw !== $('#suPass2').value) return err.textContent = 'The passwords do not match.';
  if (email && !EMAIL_RE.test(email)) return err.textContent = 'That email does not look right. You can also leave it empty.';
  if (!$('#suAgree').checked) return err.textContent = 'Please agree to the Privacy Terms to continue.';
  const btn = $('#signupForm .btn.primary'); btn.disabled = true;
  try {
    const u = {username:name, email, created:today()}; await setPassword(u, pw);
    ACC.users[name.toLowerCase()] = u;
    const carry = ACC.current === GUEST; // a guest who signs up keeps their progress
    const data = clean(carry ? loadJSON(GUEST_KEY, {}) : {}); data.agreed = true; if (!data.name) data.name = name;
    try { localStorage.setItem(keyFor(name), JSON.stringify(data)); if (carry) localStorage.removeItem(GUEST_KEY); } catch {}
    $('#signupForm').reset(); showMatch(); hidePeeks($('#consent')); $('#consent').hidden = true; switchTo(name);
    if (carry) toast(`Account created. Your progress moved into ${name}.`); else { gainXP(10, 'welcome'); toast(`Welcome, ${name}! +10 XP`); }
  } catch { err.textContent = 'Could not create the account in this browser. Try another browser.'; }
  finally { btn.disabled = false; }
}
async function login(e) {
  e.preventDefault(); const err = $('#liErr'); err.textContent = '';
  if (Date.now() < fails.until) return err.textContent = `Too many tries. Wait ${Math.ceil((fails.until - Date.now()) / 1000)} seconds.`;
  const name = $('#liUser').value.trim(), u = ACC.users[name.toLowerCase()];
  const btn = $('#loginForm .btn.primary'); btn.disabled = true;
  const ok = u && await checkPassword(u, $('#liPass').value).catch(() => false);
  btn.disabled = false;
  if (!ok) { if (++fails.n >= 5) { fails.n = 0; fails.until = Date.now() + 30000; } return err.textContent = 'Wrong username or password. Accounts only exist on the device where they were made.'; }
  fails.n = 0; $('#loginForm').reset(); hidePeeks($('#consent')); $('#consent').hidden = true; switchTo(u.username); toast(`Welcome back, ${u.username}!`);
}
function asGuest() {
  const g = clean(loadJSON(GUEST_KEY, {})); g.agreed = true;
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch {}
  $('#consent').hidden = true; switchTo(GUEST);
}

function resetTimers() {
  clearInterval(T.iv); T.running = false; T.mode = 'work'; T.left = modeLen('work');
  clearInterval(G.iv); G.start = 0;
}
function init() {
  stopGroup(); GR.key = null; GR.code = ''; GR.members = []; DM.keys.clear(); DM.open = ''; // a different account may have logged in
  applyTheme(); applySeason(); markDay(); paintPlayer(); route(); paintBell(); dmDot(); startSocialPoll(); checkProgress();
  if (S.group) openGroup(S.group).then(() => { sendGroupState(); startGroup(); paintGroup(); }).catch(() => {});
  if (me() && (S.pub || S.friends.length || S.staffAdds.length)) setTimeout(() => { if (me()) loadPlayers(); }, 2500); // shows the friend-request dot
  maybeTour();
  if (ACC.current) $('#consent').hidden = true; else openAuth('signup');
}
buildNav(); events();
resumeFocus();
if (S.run.game) startGame(S.run.game.game, S.run.game.start);
init();
verifyOwner();
})();
