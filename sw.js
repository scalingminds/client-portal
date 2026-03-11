var CACHE_NAME = 'sm-portal-v2';
var urlsToCache = [
  '/client-portal/',
  '/client-portal/index.html'
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
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('firebasejs') !== -1 ||
      event.request.url.indexOf('googleapis.com') !== -1 ||
      event.request.url.indexOf('firestore.googleapis.com') !== -1 ||
      event.request.url.indexOf('securetoken.googleapis.com') !== -1 ||
      event.request.url.indexOf('gstatic.com') !== -1) {
    return;
  }
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response && response.status === 200 && response.type === 'basic') {
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
