/* LevelUp Life service worker: opens instantly and works offline.
   App files are served from a saved copy and refreshed in the background; when a new version is
   downloaded, the page is told so it can offer a "Reload" button. Wix APIs, YouTube and other sites
   are never cached: they always go straight to the network. No personal data is stored here. */
const CACHE = 'levelup-shell-v1';
const SHELL = ['./', 'app.js', 'styles.css', 'icon.svg', 'manifest.json', 'icon-192.png', 'icon-512.png',
  'fonts/outfit.woff2'];
const WATCH = /\/(app\.js|styles\.css)?$/; // a change to these means a new version of the app

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
  const key = req.mode === 'navigate' ? './' : url.pathname.replace(/\/index\.html$/, '/');
  e.respondWith(fromCache(req, key, e));
});
async function fromCache(req, key, e) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key, {ignoreSearch:true});
  const fresh = fetch(req.mode === 'navigate' ? './' : req, {cache:'no-cache'}).then(async res => {
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
