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
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>', upload:'<path d="M12 21V9m-5 5 5-5 5 5M4 3h16"/>',
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
  {id:'options', name:'Settings', sub:'Make the app yours. Export or delete your data anytime.', key:'9'},
  {id:'help', name:'Help', sub:'How to use LevelUp Life, and keyboard shortcuts.'},
  {id:'privacy', name:'Privacy Terms', sub:'Short version: your data stays on your device.'},
];
const iconFor = id => icon(id === 'options' ? 'settings' : id);

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

/* ---------- state ---------- */
const KEY = 'levelup-life-v1';
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
  const r = s.run || {};
  if (r.game && num(r.game.start, 0, 0, 1e15) > 0) d.run.game = {start:num(r.game.start, 0, 0, 1e15), game:str(r.game.game, 60) || 'Gaming'};
  if (r.focus && ['work', 'short', 'long'].includes(r.focus.mode) && num(r.focus.end, 0, 0, 1e15) > 0) d.run.focus = {mode:r.focus.mode, end:num(r.focus.end, 0, 0, 1e15)};
  return d;
}
let S;
try { S = clean(JSON.parse(localStorage.getItem(KEY) || '{}')); }
catch { S = clean({}); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const addLog = (cat, m, ref) => { if (m > 0) { const e = {d: today(), cat, m: Math.round(m)}; if (ref) e.ref = ref; S.log.push(e); save(); } };
const dropLog = ref => { S.log = S.log.filter(x => x.ref !== ref); save(); };
const minsOn = (d, cat) => S.log.filter(x => x.d === d && (!cat || x.cat === cat)).reduce((a, x) => a + x.m, 0);
const level = () => { let lv = 1, need = 100, xp = S.xp; while (xp >= need) { xp -= need; lv++; need = 100 + (lv - 1) * 25; } return {lv, xp, need}; };
const gainXP = (n, why) => {
  const before = level().lv; S.xp = Math.max(0, S.xp + n); save(); paintPlayer();
  if (n > 0) toast(level().lv > before ? `🎉 Level up! You are now level ${level().lv}` : `+${n} XP · ${why}`);
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
  const {lv, xp, need} = level();
  $('#lvl').textContent = lv; $('#xpBar').style.width = (xp / need * 100) + '%';
  $('.profile').title = `${S.name || 'Player'} · ${xp}/${need} XP to level ${lv + 1}`;
  $('#avatar').textContent = (S.name || 'P').trim().charAt(0).toUpperCase();
}
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  $('#themeBtn').setAttribute('aria-checked', S.theme === 'dark');
}
function buildNav() {
  $('#nav').innerHTML = ROUTES.filter(r => r.main).map(r => `<a href="#${r.id}" data-route="${r.id}" title="${r.name} (${r.key})">${iconFor(r.id)}<span>${r.short || r.name}</span></a>`).join('');
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
function render() { const m = $('#main'); m.innerHTML = VIEWS[current](); (BIND[current] || (() => {}))(m); }
const rerender = () => render();

/* ---------- small components ---------- */
const card = (cls, title, body, extra = '') => `<section class="card ${cls}">${title ? `<div class="card-h"><h3>${title}</h3>${extra}</div>` : ''}${body}</section>`;
const empty = t => `<div class="empty">${t}</div>`;
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
  ${card('c5', '', `<div class="spark"><div><div class="badge">${icon('star')}</div><h3 style="margin-top:14px;font-size:1.3rem">Analytics</h3><div class="muted">Last 7 days</div>
    <div class="small" style="color:var(--accent2);margin-top:6px">${prevL ? `${trend >= 0 ? '+' : ''}${trend}% learning vs last week` : 'Your first week of tracking'}</div></div>
    <div style="flex:1;min-width:0">${lineChart(['learn','play','watch'].map(c=>({c:CAT[c].c,data:week(c)})))}
    <div class="legend" style="margin-top:10px">${Object.values(CAT).map(c=>`<span><i style="background:${c.c}"></i>${c.n}</span>`).join('')}</div></div></div>`)}
  ${card('c7', `${greet}, ${esc(S.name || 'Player')}`, `<div class="statrow">
    <div class="stat"><span class="k">Learned today</span><span class="v">${fmtMin(L)}</span><span class="d">goal ${fmtMin(S.goals.learn)}</span></div>
    <div class="stat"><span class="k">Played today</span><span class="v">${fmtMin(Pl)}</span><span class="d">limit ${fmtMin(S.goals.play)}</span></div>
    <div class="stat"><span class="k">Watched today</span><span class="v">${fmtMin(W)}</span><span class="d">limit ${fmtMin(S.goals.watch)}</span></div>
    <div class="stat"><span class="k">Streak</span><span class="v">${streak()}🔥</span><span class="d">${S.questsTotal} good deeds</span></div></div>`,
    `<a class="btn primary" href="#focus">${icon('focus')}Start focus</a>`)}
  ${card('c4', 'Continue learning', next ? `<div class="orb" aria-hidden="true"><i></i><i></i><i></i></div>
    <p style="text-align:center;margin:0">${esc(next.lesson)}</p><p class="muted small" style="text-align:center;margin:4px 0 16px">${esc(TRACKS[next.track].name)} · ${esc(next.module)}</p>
    <div class="row" style="justify-content:center"><a class="btn" target="_blank" rel="noopener" href="${next.url}">${icon('link')}Open lesson</a><a class="btn primary" href="#study">Study Path</a></div>`
    : empty('🏆 You finished every lesson! Build something and share it.'), `<span class="tag p">${pctDone()}% done</span>`)}
  ${card('c4', 'Up next', `<ul class="list">
    <li class="item"><span class="thumb" style="--h:${ep ? hue(ep.title) : 'var(--dim)'}">${icon('series')}</span><div class="grow"><div class="t">${ep ? esc(ep.title) : 'No series in progress'}</div><div class="s">${ep ? `Season ${ep.s} · Episode ${ep.e + 1}` : 'Add one in Series'}</div></div>${ep ? `<button class="btn sm" data-ep="${ep.id}">Watched</button>` : '<a class="btn sm" href="#series">Add</a>'}</li>
    ${(() => { const g = S.backlog.find(b=>b.status==='playing'); return `<li class="item"><span class="thumb" style="--h:${g ? hue(g.title) : 'var(--dim)'}">${icon('gaming')}</span><div class="grow"><div class="t">${g ? esc(g.title) : 'No game marked as playing'}</div><div class="s">${g ? esc(g.platform || 'Game') : 'Add one in Gaming'}</div></div><a class="btn sm" href="#gaming">${g ? 'Play' : 'Add'}</a></li>`; })()}
    ${(() => { const v = S.yt.find(y=>!y.watched); return `<li class="item"><span class="thumb" style="--h:#e0465a">${icon('youtube')}</span><div class="grow"><div class="t">${v ? esc(v.title) : 'No saved videos'}</div><div class="s">${v ? (v.kind === 'learn' ? 'Learning' : 'Fun') : 'Save one in YouTube'}</div></div><a class="btn sm" href="#youtube">Open</a></li>`; })()}
  </ul>`, '<span class="more">···</span>')}
  ${card('c4', "Today's quest", `<div class="quest" style="border:0;padding:0"><span class="thumb" style="--h:var(--accent)">${icon('impact')}</span><div><b>${esc(qi[1][0])}</b><p class="muted small" style="margin:4px 0 0">${esc(qi[1][1])}</p></div></div>
    <div class="row" style="margin-top:16px"><button class="btn primary" data-quest="${qi[0]}" ${questDone(qi[0]) ? 'disabled' : ''}>${questDone(qi[0]) ? 'Done ✓' : 'Complete +15 XP'}</button><a class="btn" href="#impact">All quests</a></div>`)}
  ${card('c12', 'Programs', `<div class="tiles cols-5">${ROUTES.filter(r=>r.id!=='home').map(r=>`<a class="tile" href="#${r.id}">${iconFor(r.id)}<span>${r.short||r.name}</span></a>`).join('')}</div>`, '<span class="more">···</span>')}
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
    <ul class="list" style="margin-top:10px">${S.tasks.map(x=>`<li class="item ${x.done?'done':''}"><input type="checkbox" class="check" data-task="${x.id}" ${x.done?'checked':''} aria-label="Done"><div class="grow"><div class="t">${esc(x.text)}</div></div><button class="iconbtn" data-deltask="${x.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('') || empty('No tasks yet. Add your first one above.')}</ul>`)}
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
function startTicking() { clearInterval(T.iv); T.running = true; T.iv = setInterval(tick, 250); S.run.focus = {mode:T.mode, end:T.end}; save(); }
function stopTicking() { T.running = false; clearInterval(T.iv); delete S.run.focus; save(); }
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
  ${card('', 'Today', `<div class="statrow" style="grid-template-columns:1fr 1fr"><div class="stat"><span class="k">Sessions</span><span class="v">${S.log.filter(x=>x.d===today()&&x.ref==='focus').length}</span></div><div class="stat"><span class="k">Learning time</span><span class="v">${fmtMin(todayF)}</span></div></div>
    <div class="meter" style="margin-top:16px"><i style="width:${Math.min(100,todayF/S.goals.learn*100)}%"></i></div><p class="muted small">${fmtMin(todayF)} of your ${fmtMin(S.goals.learn)} daily learning goal</p>`)}
  ${card('', 'Timer lengths (minutes)', `<div class="row">${[['work','Focus'],['short','Short'],['long','Long']].map(([k,n])=>`<label class="field" style="flex:1"><span>${n}</span><input type="number" min="1" max="120" data-len="${k}" value="${S.focus[k]}"></label>`).join('')}</div>`)}
  ${card('', 'Why it works', `<p class="muted small" style="margin:0">Short, focused blocks beat long distracted ones. Every 4th break is a long one. Each finished focus session gives XP and counts toward your learning goal.</p>`)}
  </div></div>`;
};
BIND.focus = m => {
  paintTimer();
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
    <ul class="list" style="margin-top:12px">${S.backlog.map(b=>`<li class="item"><span class="thumb" style="--h:${hue(b.title)}">${esc(b.title.charAt(0).toUpperCase())}</span><div class="grow"><div class="t">${esc(b.title)}</div><div class="s">${esc(b.platform||'—')} · ${fmtMin(S.log.filter(x=>x.cat==='play'&&x.g===b.title).reduce((a,x)=>a+x.m,0))} logged</div></div>
      <select data-bstat="${b.id}" style="flex:0 0 140px;padding:7px 34px 7px 14px" aria-label="Status">${Object.entries(st).map(([k,[n]])=>`<option value="${k}" ${b.status===k?'selected':''}>${n}</option>`).join('')}</select>
      <button class="iconbtn" data-bdel="${b.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('') || empty('Your library is empty. Add the games you are playing or want to play.')}</ul>`)}
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
function watchEp(id) { const s = S.series.find(x=>x.id===id); if (!s) return; s.e++; if (s.status === 'plan') s.status = 'watching'; addLog('watch', S.epLen); save(); toast(`${s.title}: S${s.s}E${s.e} watched`); rerender(); }
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
      <div class="grow"><div class="t">${esc(s.title)}</div><div class="s">${esc(s.platform||'—')} · Season ${s.s}, episode ${s.e} seen</div></div>
      <span class="tag ${s.status==='watching'?'p':s.status==='done'?'g':'y'}">${st[s.status]}</span>
      ${s.status!=='done'?`<button class="btn sm" data-sep="${s.id}" title="Mark next episode watched">+1 ep</button>`:''}
      <button class="iconbtn" data-snext="${s.id}" title="Next season" aria-label="Next season">S+</button>
      <select data-sstat="${s.id}" aria-label="Status" style="flex:0 0 140px;padding:7px 34px 7px 14px">${Object.entries(st).map(([k,v])=>`<option value="${k}" ${s.status===k?'selected':''}>${v}</option>`).join('')}</select>
      <button class="iconbtn" data-sdel="${s.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('') || empty('Nothing here yet. Add the series you are watching.')}</ul>`)}
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
      <div class="grow"><div class="t">${esc(v.title)}</div><div class="s">${v.kind==='learn'?'📚 Learning':'🍿 Fun'} · ${fmtMin(v.mins)}</div></div>
      ${v.url ? `<a class="btn sm" href="${esc(v.url)}" target="_blank" rel="noopener">Open ↗</a>` : ''}
      <button class="btn sm" data-yw="${v.id}">${v.watched?'Unwatch':'Watched'}</button><button class="iconbtn" data-ydel="${v.id}" aria-label="Delete">${icon('trash')}</button></li>`; }).join('') || empty('No videos saved. Paste a link to start your list.')}</ul>`)}
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

/* settings */
VIEWS.options = () => `<div class="grid">
  ${card('c6', 'Profile & look', `<div class="form">
    <label class="field"><span>Your name / gamer tag</span><input id="stName" maxlength="24" value="${esc(S.name)}"></label>
    <div class="row" style="justify-content:space-between"><span>Dark mode</span><button class="switch" id="stTheme" role="switch" aria-checked="${S.theme==='dark'}"><i></i></button></div>
    <div class="row" style="justify-content:space-between"><span>Show YouTube thumbnails<br><span class="muted small">Loads images from YouTube's servers</span></span><button class="switch" id="stThumbs" role="switch" aria-checked="${S.thumbs}"><i></i></button></div>
    <div class="row" style="justify-content:space-between"><span>Desktop notifications<br><span class="muted small">For timers & break reminders</span></span><button class="switch" id="stNotify" role="switch" aria-checked="${S.notify}"><i></i></button></div>
    <p class="muted small">Level ${level().lv} · ${S.xp} total XP</p></div>`)}
  ${card('c6', 'Healthy habits', `<div class="form">
    <label class="field"><span>Gaming break reminder every (minutes, 0 = off)</span><input type="number" min="0" max="600" id="stBreak" value="${S.breakEvery}"></label>
    <label class="field"><span>Average episode length (minutes)</span><input type="number" min="1" max="200" id="stEp" value="${S.epLen}"></label>
    <a class="btn" href="#balance">Edit daily goals →</a></div>`)}
  ${card('c12', 'Your data', `<p class="muted" style="margin-top:-6px">All your data is stored only in this browser/app on this device. Back it up, move it to another device, or wipe it.</p>
    <div class="row"><button class="btn" id="stExport">${icon('download')}Export backup (.json)</button>
    <label class="btn" style="cursor:pointer">${icon('upload')}Import backup<input type="file" id="stImport" accept="application/json,.json" hidden></label>
    <button class="btn" id="stCopy">${icon('link')}Copy backup</button>
    <button class="btn danger" id="stWipe">${icon('trash')}Delete all my data</button></div>
    <textarea id="stBackupText" hidden readonly style="margin-top:12px" aria-label="Backup text"></textarea>`)}
</div>`;
BIND.options = () => {
  $('#stName').onchange = e => { S.name = e.target.value.trim(); save(); paintPlayer(); toast('Name saved'); };
  const sw = (id, fn) => $(id).onclick = () => { fn(); save(); rerender(); };
  sw('#stTheme', () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; applyTheme(); });
  sw('#stThumbs', () => S.thumbs = !S.thumbs);
  sw('#stNotify', () => { S.notify = !S.notify; if (S.notify && 'Notification' in window && Notification.permission !== 'granted') Notification.requestPermission(); });
  $('#stBreak').onchange = e => { S.breakEvery = Math.max(0, +e.target.value || 0); save(); toast('Saved'); };
  $('#stEp').onchange = e => { S.epLen = Math.max(1, +e.target.value || 40); save(); toast('Saved'); };
  $('#stExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], {type:'application/json'})); a.download = `levelup-life-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Backup downloaded'); };
  $('#stImport').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { const d = JSON.parse(t); if (typeof d !== 'object' || !d || Array.isArray(d)) throw 0; S = clean(d); save(); resetTimers(); init(); toast('Backup restored'); }).catch(() => toast('That file is not a valid backup')); };
  let armed = false;
  $('#stWipe').onclick = () => {
    if (!armed) { armed = true; $('#stWipe').innerHTML = `${icon('trash')}Click again to delete everything`; setTimeout(() => { armed = false; const b = $('#stWipe'); if (b) b.innerHTML = `${icon('trash')}Delete all my data`; }, 5000); return; }
    try { localStorage.removeItem(KEY); } catch {} S = clean({}); resetTimers(); save(); init(); location.hash = '#home'; toast('All data deleted'); };
  $('#stCopy').onclick = () => { const t = JSON.stringify(S); const fb = () => { const a = $('#stBackupText'); a.hidden = false; a.value = t; a.select(); toast('Select all and copy the text below'); };
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
    <li><b style="color:var(--text)">Back up</b> from Settings any time. Nothing is ever uploaded.</li></ol>`)}
  ${card('c5', 'Keyboard shortcuts', `<div class="keys">
    <span><kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd></span><span class="muted">Search & jump anywhere</span>
    <span><kbd>1</kbd> – <kbd>9</kbd></span><span class="muted">Go to tab 1–9</span>
    <span><kbd>Alt</kbd> <kbd>←</kbd> <kbd>→</kbd></span><span class="muted">Previous / next tab</span>
    <span><kbd>Space</kbd></span><span class="muted">Start / pause the focus timer (Focus tab)</span>
    <span><kbd>T</kbd></span><span class="muted">Toggle light / dark</span>
    <span><kbd>?</kbd></span><span class="muted">Open this help page</span></div>`)}
  ${card('c12', 'All tabs', `<div class="tiles">${ROUTES.map(r=>`<a class="tile" href="#${r.id}">${iconFor(r.id)}<span>${r.name}</span></a>`).join('')}</div>`)}
</div>`;

/* privacy */
VIEWS.privacy = () => card('c12', '', `<div class="prose">
  <p class="dim small">Last updated: 24 November 2026</p>
  <h2>1. The short version</h2>
  <p>LevelUp Life is a local-first app. <b>Everything you type stays on your own device.</b> We do not have servers that store your data, we do not require an account, and we do not use analytics, trackers, cookies for advertising, or sell anything about you.</p>
  <h2>2. What data the app stores</h2>
  <ul><li>Your name or gamer tag (optional).</li><li>Study progress, tasks, focus sessions and goals.</li><li>Games, gaming sessions, series and saved YouTube links you add.</li><li>Completed daily quests, XP and app settings (theme, reminders).</li></ul>
  <p>This is saved in your browser's <i>localStorage</i> (website) or the app's local storage folder (desktop app) on this device only.</p>
  <h2>3. What we do not collect</h2>
  <ul><li>No email, phone number, location or contacts.</li><li>No usage analytics or crash tracking.</li><li>No advertising IDs. No ads at all.</li></ul>
  <h2>4. Third-party content</h2>
  <p>Some features load content from other services only when you use them:</p>
  <ul><li><b>YouTube thumbnails</b> are loaded from YouTube (i.ytimg.com) for videos you saved. You can turn this off in Settings.</li>
  <li><b>Links</b> to lessons, YouTube searches and charities open those websites, which have their own privacy policies.</li>
  <li><b>Fonts</b> may be loaded from Google Fonts; if unavailable, your system font is used.</li></ul>
  <h2>5. Notifications</h2>
  <p>If you turn on notifications, they are created locally by your device for timers and break reminders. Nothing is sent over the internet.</p>
  <h2>6. Your control</h2>
  <ul><li><b>Access & portability:</b> export all your data as a JSON file in Settings.</li><li><b>Deletion:</b> "Delete all my data" in Settings removes everything instantly. Uninstalling the desktop app or clearing site data also removes it.</li><li><b>Correction:</b> edit or delete any item directly in the app.</li></ul>
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
  $('#paletteList').innerHTML = pal.map((a, i) => `<li data-i="${i}" class="${i===palSel?'sel':''}">${icon(a.i)}${esc(a.n)}<span class="dim">${a.h}</span></li>`).join('') || '<li class="dim">No matches</li>';
}
function runPal(i) { const a = pal[i]; if (!a) return; closePalette(); a.run(); }

/* ---------- global events ---------- */
function events() {
  window.addEventListener('hashchange', route);
  $('#themeBtn').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); if (current === 'options') rerender(); };
  $('#searchBtn').onclick = openPalette;
  $('.skip').onclick = e => { e.preventDefault(); $('#main').focus(); };
  document.addEventListener('click', e => {
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
    if (e.key === 'Escape') { closePalette(); $('#sheet').hidden = true; return; }
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
  $('#consentOk').onclick = () => { S.agreed = true; S.name = $('#consentName').value.trim() || 'Player'; save(); $('#consent').hidden = true; paintPlayer(); render(); toast(`Welcome, ${S.name}! +10 XP`); gainXP(10, 'welcome'); };
  $('#consentName').onkeydown = e => { if (e.key === 'Enter') $('#consentOk').click(); };
  $('#consentPrivacy').onclick = () => { $('#consent').hidden = true; };
  window.addEventListener('hashchange', () => { if (!S.agreed && current !== 'privacy') $('#consent').hidden = false; });
}

function resetTimers() {
  clearInterval(T.iv); T.running = false; T.mode = 'work'; T.left = modeLen('work');
  clearInterval(G.iv); G.start = 0;
}
function init() {
  applyTheme(); paintPlayer(); route();
  $('#consent').hidden = S.agreed;
}
buildNav(); events();
resumeFocus();
if (S.run.game) startGame(S.run.game.game, S.run.game.start);
init();
})();
