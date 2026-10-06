/* Garde l'app disponible sans réseau.
   Les fichiers sont mis en cache tous ensemble à l'installation, puis servis depuis ce cache :
   une mise à jour ne s'applique que si tous les fichiers ont pu être téléchargés.
   Changer VERSION à chaque modification d'un fichier de l'app. */
var VERSION = 'carnet-visites-v4';
var FICHIERS = [
  './',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icone-180.png',
  './icone-192.png',
  './icone-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) {
        return c.addAll(FICHIERS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
      })
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
    caches.open(VERSION).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (enCache) {
        if (enCache) return enCache;
        if (req.mode === 'navigate') {
          return c.match('./').then(function (accueil) { return accueil || fetch(req); });
        }
        return fetch(req);
      });
    })
  );
});
