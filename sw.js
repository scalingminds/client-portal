var CACHE_NAME = 'sm-portal-v1';
var urlsToCache = [
  '/client-portal/',
  '/client-portal/index.html',
  '/client-portal/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  // Always go network-first for API calls and auth
  if (event.request.url.indexOf('firebasejs') !== -1 ||
      event.request.url.indexOf('googleapis.com/identitytoolkit') !== -1 ||
      event.request.url.indexOf('firestore.googleapis.com') !== -1 ||
      event.request.url.indexOf('securetoken.googleapis.com') !== -1) {
    return;
  }
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response && response.status === 200) {
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
