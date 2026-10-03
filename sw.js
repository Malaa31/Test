/* Garde l'app disponible sans réseau. Changer VERSION à chaque mise à jour des fichiers. */
var VERSION = 'carnet-visites-v1';
var FICHIERS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icone-180.png',
  './icone-192.png',
  './icone-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll(FICHIERS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (cles) {
        return Promise.all(cles.filter(function (k) { return k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (enCache) {
      var reseau = fetch(req).then(function (rep) {
        if (rep && rep.ok) {
          var copie = rep.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copie); });
        }
        return rep;
      });
      if (enCache) {
        /* Réponse immédiate depuis le cache, mise à jour en arrière-plan. */
        reseau.catch(function () {});
        return enCache;
      }
      return reseau.catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
