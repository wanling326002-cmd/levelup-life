/* LevelUp Life service worker: opens instantly and works offline.
   App files are served from a saved copy and refreshed in the background; when a new version is
   downloaded, the page is told so it can offer a "Reload" button. Wix APIs, YouTube and other sites
   are never cached: they always go straight to the network. No personal data is stored here. */
const CACHE = 'levelup-shell-v3'; // v3: the app moved to app.html (the front page is now the landing page); clears older saved copies
const SHELL = ['app.html', 'app.js', 'companion-core.js', 'styles.css', 'icon.svg', 'manifest.json', 'icon-192.png', 'icon-512.png',
  'fonts/inter-tight.woff2'];
const WATCH = /\/(app\.html|app\.js|styles\.css)$/; // a change to these means a new version of the app

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // other sites (Wix APIs, YouTube): network only
  if (/\/downloads\.json$/.test(url.pathname)) return; // where the app download lives: always the latest
  const base = new URL(self.registration.scope).pathname, rel = url.pathname.slice(base.length);
  // Wix's own pages and services on this address (its sign-in page at /_api/oauth2/authorize, /__auth/..., /_partials/...)
  // always go to the network: answering them with the saved home page broke "Continue with Google or Wix"
  if (!url.pathname.startsWith(base) || rel.startsWith('_')) return;
  if (req.mode === 'navigate' && rel !== 'app.html') return; // only the app's own page is served offline (the front page always comes from the network)
  const key = req.mode === 'navigate' ? 'app.html' : url.pathname;
  e.respondWith(fromCache(req, key, e));
});
async function fromCache(req, key, e) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key, {ignoreSearch:true});
  const fresh = fetch(req.mode === 'navigate' ? 'app.html' : req, {cache:'no-cache'}).then(async res => {
    if (res.ok && res.type === 'basic') {
      const changed = hit && WATCH.test(new URL(res.url).pathname) && (hit.headers.get('etag') || '') !== (res.headers.get('etag') || '');
      await cache.put(key, res.clone());
      if (changed) (await self.clients.matchAll()).forEach(c => c.postMessage({type:'update'}));
    }
    return res;
  }).catch(() => null);
  if (hit) { e.waitUntil(fresh); return hit; }
  return (await fresh) || new Response('You are offline and this file was not saved yet.', {status:503, headers:{'Content-Type':'text/plain'}});
}
