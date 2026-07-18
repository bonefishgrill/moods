const CACHE = 'moods-v3';
const ASSETS = ['/', '/index.html', '/playlists.json', '/privacy/', '/privacy/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always serve the latest deploy when online, and only fall
// back to the cache when the network is unreachable (offline). The previous
// cache-first strategy meant that once a browser cached the page, it kept
// serving that exact frozen snapshot forever and never checked the network
// again — every future deploy was invisible to a returning visitor.
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
