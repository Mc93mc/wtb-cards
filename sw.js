/* Fait fonctionner le carnet sans connexion et reçoit les images partagées depuis Android.
   Changez le numéro de version pour forcer une mise à jour. */
var CACHE = 'carnet-v5';
var SHARE_CACHE = 'carnet-partage';
var FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== SHARE_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Une image (ou un lien) partagée vers l'application arrive en POST : on la garde, puis on ouvre le carnet. */
function receiveShare(req) {
  return (async function () {
    try {
      var form = await req.formData();
      var cache = await caches.open(SHARE_CACHE);
      var file = form.get('photo');
      if (file && typeof file !== 'string' && file.size) {
        await cache.put('partage-photo', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
      } else {
        await cache.delete('partage-photo');
      }
      var meta = { url: String(form.get('url') || ''), text: String(form.get('text') || ''), title: String(form.get('title') || '') };
      await cache.put('partage-infos', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
    } catch (err) { /* on ouvre le carnet quand même */ }
    return Response.redirect(new URL('index.html?partage=1#ajouter', self.registration.scope).href, 303);
  })();
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && /\/share-target$/.test(url.pathname)) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined); });
        return hit || net;
      });
    })
  );
});
