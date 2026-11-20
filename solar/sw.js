/*
 * Solar Plant Calculator: keeps this folder's page on the phone, so that it opens without internet.
 *
 * What it keeps: the locked page (index.html), its Home Screen icon, and the fonts the calculator uses.
 * The page it keeps is the encrypted file exactly as served. No key passes through here.
 *
 * Rules:
 * - The page: asked from the network every time, and a copy is kept each time it answers. Without internet,
 *   or when the network has not answered in WAIT ms, the kept copy is used.
 * - The icon and the fonts: the kept copy at once. The icon and the font list are refreshed quietly.
 * - Everything else: straight to the network, untouched.
 *
 * This folder sits inside the clock app's folder, whose own worker also covers it. A page is looked after by
 * the worker with the closest folder, so once this one is installed it answers for this page, and the clock
 * app's worker goes on answering for that app. This worker only creates or removes caches whose names start
 * with PREFIX.
 */
'use strict';

var PREFIX = 'solar-calc-';
var PAGE_CACHE = PREFIX + 'page-v1';
var FONT_CACHE = PREFIX + 'fonts-v1';
var KEEP = [PAGE_CACHE, FONT_CACHE];
var WAIT = 5000;
var PAGE = new URL('./', self.location).href;                 /* ".../solar/" */
var ICON = new URL('icon-180.png', self.location).href;

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(PAGE_CACHE).then(function (cache) {
    return Promise.all([PAGE, ICON].map(function (url) {
      return fetch(new Request(url, { cache: 'reload' })).then(function (res) {
        if (res.ok && res.type === 'basic') return cache.put(url, res);
      }).catch(function () {});                               /* no internet just now: the copy is kept on the next visit */
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.map(function (n) {
      if (n.indexOf(PREFIX) === 0 && KEEP.indexOf(n) < 0) return caches.delete(n);     /* only this page's old copies */
    }));
  }).then(function () { return self.clients.claim(); }));
});

/* The page. It is kept under its plain address, so "?owner", "?preview" or a link's tracking tail still find it.
   "no-cache" makes the browser check with the server each time, so a new version shows as soon as it is out. */
function page(event, url) {
  return caches.open(PAGE_CACHE).then(function (cache) {
    var net = fetch(new Request(url.href, { cache: 'no-cache' })).then(function (res) {
      if (!(res && res.ok && res.type === 'basic' && !res.redirected)) return null;
      return cache.put(PAGE, res.clone()).then(function () { return res; }, function () { return res; });
    }, function () { return null; });
    var slow = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, WAIT); });
    event.waitUntil(net);                                     /* an answer that comes late is still kept for next time */
    return Promise.race([net, slow]).then(function (res) {
      if (res) return res;
      return cache.match(PAGE).then(function (hit) {
        return hit || net.then(function (late) { return late || fetch(event.request); });
      });
    });
  });
}

/* The kept copy at once; without one, the network. With "renew", the network is asked quietly for next time. */
function kept(event, cacheName, key, request, renew) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(key).then(function (hit) {
      if (hit && !renew) return hit;
      var net = fetch(request).then(function (res) {
        if (res && res.ok) return cache.put(key, res.clone()).then(function () { return res; }, function () { return res; });
        return res;
      });
      if (!hit) return net;
      event.waitUntil(net.then(function () {}, function () {}));
      return hit;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request, url, bare;
  if (req.method !== 'GET') return;
  url = new URL(req.url);
  if (url.origin === self.location.origin) {
    bare = url.origin + url.pathname;
    if (bare === PAGE || bare === PAGE + 'index.html') { event.respondWith(page(event, url)); return; }
    if (bare === ICON) { event.respondWith(kept(event, PAGE_CACHE, ICON, req, true)); return; }
    return;                                                   /* anything else here goes straight to the network */
  }
  /* Google Fonts: the list of fonts, and the font files themselves, which never change */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      kept(event, FONT_CACHE, req.url, new Request(req.url, { mode: 'cors', credentials: 'omit' }), url.hostname === 'fonts.googleapis.com')
        .catch(function () { return fetch(req); })
    );
  }
});
