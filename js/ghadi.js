/*
 * Samay aur Mausam: the ship's clock for the family at home.
 *
 * One phone leaves a small note in a database: how many minutes its own clock is ahead of India's,
 * and when it said so. The family's page (ghar.html) reads the note and runs that clock from it.
 * Nothing else is stored: no name, no place.
 *
 * The note sits under a long random key that only the two phones know. The key is made on the sending
 * phone and travels in the link (ghar.html#k=...), never in this file. The database address below is not
 * a secret: the database's own rules allow one thing only, two numbers under a key of 20 characters or more.
 */
(function () {
  'use strict';

  var DB = 'https://subhash-shiptime-default-rtdb.asia-southeast1.firebasedatabase.app';
  var IST_MIN = 330, MIN = 60000, WAIT = 20000;
  var ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';   /* no letters or digits that look alike */

  function okKey(k) { return typeof k === 'string' && /^[A-Za-z0-9]{20,64}$/.test(k); }

  function newKey() {
    var a = new Uint8Array(24), s = '', i;
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (i = 0; i < a.length; i++) s += ALPHA.charAt(a[i] % ALPHA.length);
    return s;
  }

  /* the key out of a link: ...#k=<key> */
  function keyFrom(hash) {
    var m = /(?:^|[#&])k=([A-Za-z0-9]{20,64})(?:&|$)/.exec(String(hash || ''));
    return m ? m[1] : null;
  }

  /* a note is two numbers: o, minutes ahead of India (negative: behind); t, when it was sent (ms since 1970) */
  function clean(v) {
    if (!v || typeof v !== 'object') return null;
    var o = Number(v.o), t = Number(v.t);
    if (!isFinite(o) || !isFinite(t) || Math.abs(o) > 900 || t <= 0) return null;
    return { o: Math.round(o), t: t };
  }

  function at(key) { return DB + '/ghadi/' + key + '.json'; }

  function call(url, opts) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = null;
    if (ctl) { opts.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, WAIT); }
    opts.cache = 'no-store';
    return fetch(url, opts).then(function (r) {
      if (!r.ok) { var e = new Error('http ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }).then(function (v) { if (timer) clearTimeout(timer); return v; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  /* Leave the note: resolves with what the database kept.
     A PUT is the plain way. If the browser or the network in between will not let a PUT through (it fails
     without any answer from the database), the same write is asked for as a POST carrying the database's
     documented method override, which needs no permission round-trip first. */
  function send(key, o, t) {
    if (!okKey(key)) return Promise.reject(new Error('key'));
    var body = JSON.stringify({ o: Math.round(o), t: Math.round(t) });
    return call(at(key), { method: 'PUT', body: body }).then(clean, function (e) {
      if (e && e.status) throw e;                      /* the database answered: refused, or busy */
      return call(at(key) + '?x-http-method-override=PUT', { method: 'POST', body: body }).then(clean);
    });
  }

  /* read the note: resolves with { o, t }, or null when nothing has been left yet */
  function read(key) {
    if (!okKey(key)) return Promise.reject(new Error('key'));
    return call(at(key), { method: 'GET' }).then(clean);
  }

  /* How far this phone's own clock is ahead of India's, in whole minutes.
     What the phone shows is its clock plus its time-zone setting; the true time comes from the network. */
  function gapMin(trueNowMs) {
    var shown = Date.now() - new Date().getTimezoneOffset() * MIN;
    return Math.round((shown - (trueNowMs + IST_MIN * MIN)) / MIN);
  }

  window.Ghadi = { okKey: okKey, newKey: newKey, keyFrom: keyFrom, clean: clean, send: send, read: read, gapMin: gapMin, _db: DB };
}());
