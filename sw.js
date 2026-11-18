/*
 * Samay aur Mausam: keeps the app's own files on the phone, so that both pages (index.html and ghar.html)
 * open without internet and show what they last had.
 *
 * Rules:
 * - The app's own files: from the network when it answers, and a copy is kept each time. Without internet,
 *   or when the network has not answered in WAIT ms, the kept copy is used and the page is told so.
 * - Left alone, straight to the network as before: the time checks (HEAD requests), the weather file (each page
 *   keeps its own copy and says how old it is), the ship-time database, and every other site.
 * - Fonts from Google Fonts are kept too, so the page looks the same without internet.
 *
 * This site is shared with the owner's other apps (each in its own folder). This worker only answers for this
 * app's folder, and only ever creates or removes caches whose names start with PREFIX.
 */
'use strict';

var PREFIX = 'samay-mausam-';
var FILES_CACHE = PREFIX + 'files-v1';
var FONTS_CACHE = PREFIX + 'fonts-v1';
var KEEP = [FILES_CACHE, FONTS_CACHE];
var WAIT = 6000;
var SLOW = 30000;
var slowUntil = 0;                                          /* after the network has failed or been slow, use the kept copies at once for a while */
var HOME = new URL('./', self.location).pathname;          /* "/samay-mausam/" */

var FILES = [
  './', 'index.html', 'ghar.html', 'manifest.webmanifest',
  'css/panchang.css',
  'js/astronomy.browser.min.js', 'js/panchang.js', 'js/panchang-hi.js', 'js/panchang-ui.js', 'js/ghadi.js', 'js/net.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

/* a kept copy is filed under its path alone, so "?x=1" or a link's tracking tail still finds it */
function keyOf(url) { return url.origin + url.pathname; }

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(FILES_CACHE).then(function (cache) {
    return Promise.all(FILES.map(function (f) {
      var url = new URL(f, self.location);
      return fetch(new Request(url.href, { cache: 'reload' })).then(function (res) {
        if (res.ok && res.type === 'basic') return cache.put(keyOf(url), res);
      }).catch(function () {});                              /* without internet now: the copy is kept on a later visit */
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.map(function (n) {
      if (n.indexOf(PREFIX) === 0 && KEEP.indexOf(n) < 0) return caches.delete(n);   /* only this app's old copies */
    }));
  }).then(function () { return self.clients.claim(); }));
});

/* tell the page it is showing a kept copy because the network did not answer */
function tellStale(event) {
  var id = event.clientId || event.resultingClientId, tries = 0;
  if (!id) return;
  (function again() {
    self.clients.get(id).then(function (c) {
      if (c) c.postMessage({ samayNet: false });
      else if (++tries < 5) setTimeout(again, 400);           /* a page that is still opening is not a client yet */
    });
  })();
}

function keptCopy(req, url) {
  return caches.open(FILES_CACHE).then(function (cache) {
    return cache.match(keyOf(url)).then(function (hit) {
      if (hit || req.mode !== 'navigate') return hit;
      /* a page opened under another name: ghar.html for the family's page, the main page for anything else */
      var name = /ghar\.html$/.test(url.pathname) ? 'ghar.html' : 'index.html';
      return cache.match(keyOf(new URL(name, self.location))).then(function (h) {
        return h || cache.match(keyOf(new URL('./', self.location)));
      });
    });
  });
}

function ownFile(event, req, url) {
  if (Date.now() < slowUntil) {
    return keptCopy(req, url).then(function (hit) {
      if (!hit) return fromNetwork(event, req, url);
      event.waitUntil(save(req, url).then(function () {}, function () {}));   /* still try for a fresh copy, quietly */
      tellStale(event);
      return hit;
    });
  }
  return fromNetwork(event, req, url);
}

function save(req, url) {
  return fetch(req).then(function (res) {
    slowUntil = 0;                                           /* the network answered */
    if (res && res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(FILES_CACHE).then(function (cache) { return cache.put(keyOf(url), copy); }).catch(function () {});
    }
    return res;
  });
}

function fromNetwork(event, req, url) {
  var net = save(req, url);
  event.waitUntil(net.then(function () {}, function () {}));
  return new Promise(function (resolve) {
    var done = false;
    function settle(res) { if (!done) { done = true; resolve(res); } }
    var timer = setTimeout(function () {                     /* the network is slow: use the kept copy if there is one */
      slowUntil = Date.now() + SLOW;
      keptCopy(req, url).then(function (hit) { if (hit && !done) { tellStale(event); settle(hit); } });
    }, WAIT);
    net.then(function (res) { clearTimeout(timer); settle(res); }, function () {
      clearTimeout(timer);
      slowUntil = Date.now() + SLOW;
      keptCopy(req, url).then(function (hit) {
        if (hit) { if (!done) tellStale(event); settle(hit); } else settle(Response.error());
      }, function () { settle(Response.error()); });
    });
  });
}

function font(event, req, url) {
  return caches.open(FONTS_CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit && url.hostname === 'fonts.gstatic.com') return hit;   /* font files never change under the same address */
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(function () {});
        return res;
      });
      if (hit) { event.waitUntil(net.then(function () {}, function () {})); return hit; }   /* the font list: refreshed quietly */
      return net;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request, url;
  if (req.method !== 'GET') return;                          /* time checks and database writes: straight to the network */
  url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.indexOf(HOME) !== 0) return;            /* the owner's other apps on this site are not touched */
    if (/\/data\/weather\.json$/.test(url.pathname)) return; /* each page keeps its own copy of the weather */
    event.respondWith(ownFile(event, req, url));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(font(event, req, url));
  }
  /* anything else (the ship-time database, IMD, WhatsApp) is left to the browser as before */
});
