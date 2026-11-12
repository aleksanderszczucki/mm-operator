// Pliki strony w pamięci telefonu – strona otwiera się bez internetu po pierwszym razie.
// Najpierw sieć (zawsze świeża wersja), bez sieci – kopia. Wersję wstawia zbuduj.py.
var CACHE = 'mm-operator-20261113004505';
var PLIKI = ['./', 'index.html', 'telefon.js', 'telefon.css', 'raport-telefon.js', 'manifest.webmanifest', 'ikona.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PLIKI); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (klucze) {
    return Promise.all(klucze.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (odp) {
    var kopia = odp.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, kopia); });
    return odp;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (z) { return z || caches.match('index.html'); });
  }));
});
