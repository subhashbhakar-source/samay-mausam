/*
 * Samay aur Mausam: working without internet.
 *
 * 1. Registers the service worker (sw.js), which keeps the app's own files on this phone so the page opens
 *    without internet.
 * 2. Shows "No Internet!" at the top right while the internet can't be reached, or while the page is showing
 *    a kept copy. It checks with a small HEAD request to this site: on opening, when the phone says it is back
 *    online, when the page comes back to the front, and every few minutes while it is open.
 *
 * It does not touch the clocks, the weather or the ship-time note; those keep their own checks and messages.
 */
(function () {
  'use strict';

  var WAIT = 8000, EVERY = 2 * 60 * 1000, SOON = 30 * 1000;
  var badge = null, off = false, busy = false, next = null;

  var WIFI = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round">'
    + '<path d="M2.5 9.2a14 14 0 0 1 19 0"/><path d="M5.8 12.6a9.2 9.2 0 0 1 12.4 0"/><path d="M9.1 16a4.5 4.5 0 0 1 5.8 0"/></g>'
    + '<circle cx="12" cy="19.300" r="1.600" fill="currentColor"/></svg>';

  function make() {
    var st = document.createElement('style');
    st.textContent = '.sm-net{position:fixed;z-index:60;top:calc(.5rem + env(safe-area-inset-top,0px));right:calc(.6rem + env(safe-area-inset-right,0px));'
      + 'margin:0;display:flex;align-items:center;gap:.3rem;padding:.32rem .8rem;border-radius:999px;'
      + 'font:600 .9375rem/1.2 var(--body,system-ui,sans-serif);background:var(--kumkum,#a3141c);color:var(--page,#fff);'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.28);pointer-events:none}'
      + '.sm-net[hidden]{display:none}'
      + '.sm-net svg{width:1.15em;height:1.15em;flex:none}'
      + 'html.sm-offline body{padding-top:2.7rem}'
      + '@media print{.sm-net{display:none}html.sm-offline body{padding-top:0}}';
    document.head.appendChild(st);
    badge = document.createElement('p');
    badge.className = 'sm-net';
    badge.setAttribute('role', 'status');
    badge.setAttribute('lang', 'en');
    badge.setAttribute('aria-label', 'No Internet!');
    badge.hidden = true;
    badge.innerHTML = '<span>No</span>' + WIFI + '<span>Internet!</span>';
    document.body.appendChild(badge);
  }

  function show(on) {
    off = on;
    if (!badge) { if (!document.body) return; make(); }
    if (badge.hidden === on) badge.hidden = !on;
    document.documentElement.classList.toggle('sm-offline', on);
  }

  function later(ms) { clearTimeout(next); next = setTimeout(check, ms); }

  /* any answer from the site counts as internet; no answer within WAIT does not */
  function check() {
    if (busy) return;
    if (document.hidden) { later(off ? SOON : EVERY); return; }
    busy = true;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, WAIT) : null;
    var opts = { method: 'HEAD', cache: 'no-store' };
    if (ctl) opts.signal = ctl.signal;
    fetch('manifest.webmanifest?net=' + Date.now(), opts).then(function () { show(false); }, function () { show(true); })
      .then(function () { if (t) clearTimeout(t); busy = false; later(off ? SOON : EVERY); });
  }

  function start() {
    if (navigator.onLine === false) show(true);
    check();
    window.addEventListener('offline', function () { show(true); later(SOON); });
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  }

  /* the page is showing a kept copy because the network did not answer */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.samayNet === false) { show(true); later(500); }   /* then let a fresh check decide */
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  /* keep the app's files on this phone (only on the real website, or a test copy on this computer) */
  var ownSite = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && ownSite) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  window.SamayNet = { check: check, isOff: function () { return off; } };
}());
