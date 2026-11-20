/*
 * Samay aur Mausam: panchang engine.
 *
 * Works the Hindu calendar out from the positions of the Sun and the Moon
 * (drik ganit), for one place on Earth. Nothing is read from any website.
 *
 *   tithi      = floor((Moon longitude - Sun longitude) / 12 degrees)
 *   month      = named from the Sun's sidereal sign at the new moons
 *                (Lahiri / Chitrapaksha ayanamsa, the Government of India standard)
 *   day's tithi = the tithi running at local sunrise
 *
 * Positions come from Astronomy Engine (MIT licence, Don Cross),
 * loaded before this file as the global `Astronomy`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var lib;
    try { lib = require('astronomy-engine'); } catch (e) { lib = require('./astronomy.browser.min.js'); }
    module.exports = factory(lib);
  } else root.Panchang = factory(root.Astronomy);
}(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';
  if (!A) return null;             /* the astronomy file did not load; the page says so */

  var DAY = 86400000, MIN = 60000;
  var AYAN_J2000 = 23.857092;      // Lahiri mean ayanamsa at J2000.0, degrees
  var TITHI_DAYS = 29.530588 / 30; // mean length of a tithi, days

  function mod(a, n) { return ((a % n) + n) % n; }
  function wrap180(a) { a = mod(a, 360); return a > 180 ? a - 360 : a; }
  function overlap(a, b, c, d) { return Math.max(0, Math.min(b, d) - Math.max(a, c)); }

  /* Earth's rotation has run fast since 2017; hold TT-UT at its 2017 value (about 70 s),
     as JPL Horizons does, instead of the older extrapolation that drifts upward */
  if (A.SetDeltaTFunction && A.DeltaT_JplHorizons) A.SetDeltaTFunction(A.DeltaT_JplHorizons);

  /* Moon minus Sun, apparent geocentric ecliptic longitude of date, 0..360.
     The Sun carries aberration; the Moon is taken where its light left it (1.28 s earlier). */
  function elong(ms) {
    return mod(A.EclipticGeoMoon(new Date(ms - 1281)).lon - A.SunPosition(new Date(ms)).elon, 360);
  }

  /* Sun's sidereal (nirayana) longitude: J2000 ecliptic longitude less the ayanamsa at J2000 */
  var ROT = null;
  function sunSid(ms) {
    if (!ROT) ROT = A.Rotation_EQJ_ECL();
    var v = A.GeoVector(A.Body.Sun, new Date(ms), true);
    return mod(A.SphereFromVector(A.RotateVector(ROT, v)).lon - AYAN_J2000, 360);
  }

  /* Moon's sidereal longitude, the same way (its light-time is under 2 arc-seconds, ignored) */
  function moonSid(ms) {
    if (!ROT) ROT = A.Rotation_EQJ_ECL();
    var v = A.GeoMoon(new Date(ms));
    return mod(A.SphereFromVector(A.RotateVector(ROT, v)).lon - AYAN_J2000, 360);
  }
  /* the moment near `guess` when the Moon's sidereal longitude equals `target` */
  function crossMoon(target, guess) {
    var t = guess, f, i;
    for (i = 0; i < 40; i++) {
      f = wrap180(moonSid(t) - target);
      if (Math.abs(f) < 2e-6) break;
      t -= f / (13.2 / DAY);
    }
    return t;
  }

  /* the moment near `guess` when the Moon-Sun angle equals `target` */
  function crossElong(target, guess) {
    var t = guess, rate = 12.19 / DAY, f, tp, fp, r, i;
    for (i = 0; i < 30; i++) {
      f = wrap180(elong(t) - target);
      if (Math.abs(f) < 2e-6) break;
      if (i > 0 && t !== tp) { r = (f - fp) / (t - tp); if (r > 9 / DAY && r < 17 / DAY) rate = r; }
      tp = t; fp = f;
      t -= f / rate;
    }
    return t;
  }

  /* the moment near `guess` when the Sun's sidereal longitude equals `target` */
  function crossSun(target, guess) {
    var t = guess, f, i;
    for (i = 0; i < 30; i++) {
      f = wrap180(sunSid(t) - target);
      if (Math.abs(f) < 2e-7) break;
      t -= f / (0.9856 / DAY);
    }
    return t;
  }

  function make(loc) {
    var tz = loc.tzMin * MIN;
    var obs = new A.Observer(loc.lat, loc.lon, loc.height || 0);
    var B = [], lo = 0, hi = 0, LUN = [];
    var cSr = {}, cSs = {}, cMr = {};

    /* ---------- civil days ---------- */
    function civil(ms) { return Math.floor((ms + tz) / DAY); }
    function midnight(dn) { return dn * DAY - tz; }
    function ymd(dn) {
      var d = new Date(dn * DAY);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() };
    }
    function dnOf(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY); }

    /* ---------- Sun and Moon rise and set ---------- */
    function riseSet(body, dir, from, days) {
      var r = A.SearchRiseSet(body, obs, dir, new Date(from), days);
      return r ? r.date.getTime() : NaN;
    }
    function sr(dn) { return cSr[dn] || (cSr[dn] = riseSet(A.Body.Sun, +1, midnight(dn), 1)); }
    function ss(dn) { return cSs[dn] || (cSs[dn] = riseSet(A.Body.Sun, -1, midnight(dn) + 6 * 3600000, 1)); }
    /* first moonrise after local noon of the day (the evening moonrise of a waning moon) */
    function moonrise(dn) { return cMr[dn] || (cMr[dn] = riseSet(A.Body.Moon, +1, midnight(dn) + 12 * 3600000, 1.2)); }
    function dayLen(dn) { return ss(dn) - sr(dn); }
    function nightLen(dn) { return sr(dn + 1) - ss(dn); }

    /* the Hindu day (sunrise to sunrise) that holds the moment t */
    function hday(t) { var d = civil(t); return t < sr(d) ? d - 1 : d; }
    /* the days whose sunrise falls inside [a, b) */
    function srDays(a, b) {
      var out = [], d = hday(a) + 1;
      while (sr(d) < b) { out.push(d); d++; }
      return out;
    }

    /* ---------- parts of the day ---------- */
    var W = {
      purvahna: function (d) { return [sr(d), sr(d) + dayLen(d) / 2]; },
      madhyahna: function (d) { return [sr(d) + dayLen(d) * 2 / 5, sr(d) + dayLen(d) * 3 / 5]; },
      aparahna: function (d) { return [sr(d) + dayLen(d) * 3 / 5, sr(d) + dayLen(d) * 4 / 5]; },
      pradosh: function (d) { return [ss(d), ss(d) + nightLen(d) / 5]; },
      nishita: function (d) { return [ss(d) + nightLen(d) * 7 / 15, ss(d) + nightLen(d) * 8 / 15]; },
      arunodaya: function (d) { return [sr(d) - 96 * MIN, sr(d)]; }
    };

    /* ---------- table of tithi boundaries ---------- */
    function build(from, to) {
      var t = from, e = elong(t), k = Math.floor(e / 12), n, guess, x;
      B = []; LUN = [];
      n = (k + 1) % 30;
      guess = t + ((k + 1) * 12 - e) / 12.19 * DAY;
      while (true) {
        x = crossElong(n * 12, guess);
        if (B.length && x <= B[B.length - 1].t) throw new Error('panchang: tithi table out of order');
        B.push({ t: x, n: n });
        if (x > to) break;
        n = (n + 1) % 30;
        guess = x + TITHI_DAYS * DAY;
      }
      lo = B[0].t; hi = B[B.length - 1].t;
      var i, s0, s1;
      for (i = 0; i + 30 < B.length; i++) {
        if (B[i].n !== 0) continue;
        s0 = Math.floor(sunSid(B[i].t) / 30);
        s1 = Math.floor(sunSid(B[i + 30].t) / 30);
        LUN.push({ i: i, start: B[i].t, end: B[i + 30].t, name: (s0 + 1) % 12, adhik: s1 === s0 });
      }
    }
    function ensure(from, to) {
      if (B.length && from - 45 * DAY >= lo && to + 45 * DAY <= hi) return;
      build(Math.min(from, B.length ? lo + 45 * DAY : from) - 95 * DAY, Math.max(to, B.length ? hi - 45 * DAY : to) + 95 * DAY);
    }
    function bIndex(ms) { // last boundary at or before ms
      var a = 0, b = B.length - 1, m;
      while (a < b) { m = (a + b + 1) >> 1; if (B[m].t <= ms) a = m; else b = m - 1; }
      return a;
    }
    function tithiAt(ms) {
      ensure(ms, ms);
      var i = bIndex(ms);
      return { n: B[i].n, start: B[i].t, end: B[i + 1].t };
    }
    function lunAt(ms) {
      ensure(ms, ms);
      var j;
      for (j = 0; j < LUN.length; j++) if (ms >= LUN[j].start && ms < LUN[j].end) return LUN[j];
      return null;
    }

    /* ---------- month, paksha, samvat ---------- */
    /* purnimanta naming (North India): the dark fortnight carries the next month's name */
    function monthOf(L, n) {
      var shukla = n < 15;
      if (shukla || L.adhik) return { name: L.name, adhik: L.adhik, shukla: shukla, amanta: L.name };
      return { name: (L.name + 1) % 12, adhik: false, shukla: false, amanta: L.name };
    }
    function samvat(L, dn) {
      var g = ymd(dn);
      var before = (g.m <= 6 && L.name >= 6); // Ashwin..Phalgun falling in Jan..Jun belong to the year that began last spring
      return { vikram: g.y + (before ? 56 : 57), shaka: g.y - (before ? 79 : 78) };
    }

    /* ---------- one day ---------- */
    function day(dn) {
      var rise = sr(dn), next = sr(dn + 1);
      ensure(rise, next);
      var i = bIndex(rise), L = lunAt(rise), segs = [], j;
      for (j = i; B[j].t < next; j++) {
        /* each tithi of the day with its own month name: a Purnima or Amavasya ending in the morning changes it */
        var tt = Math.min(Math.max(B[j].t, rise) + 60000, next - 1), ms = monthOf(lunAt(tt), B[j].n);
        segs.push({ n: B[j].n, start: B[j].t, end: B[j + 1].t, month: ms.name, adhik: ms.adhik, shukla: ms.shukla });
      }
      var g = ymd(dn), mo = monthOf(L, B[i].n), sv = samvat(L, dn);
      return {
        dn: dn, y: g.y, m: g.m, d: g.d, wd: g.wd,
        sunrise: rise, sunset: ss(dn), nextSunrise: next,
        tithi: B[i].n, tithiStart: B[i].t, tithiEnd: B[i + 1].t,
        segs: segs,                    // every tithi that touches this sunrise-to-sunrise day
        month: mo.name, adhik: mo.adhik, shukla: mo.shukla, amanta: mo.amanta,
        vikram: sv.vikram, shaka: sv.shaka
      };
    }

    /* ---------- rules that pick the day of an observance ---------- */
    /* tithi running at sunrise; a tithi that touches no sunrise is kept on the day it falls in */
    function rUdaya(a, b, last) {
      var S = srDays(a, b);
      if (!S.length) return hday(a);
      return last ? S[S.length - 1] : S[0];
    }
    /* tithi at sunrise and lasting at least `m` muhurtas after it; otherwise the day before */
    function rUdayaMin(a, b, m) {
      var S = srDays(a, b), X;
      if (!S.length) return hday(a);
      X = S[S.length - 1];
      return (b - sr(X) >= m * dayLen(X) / 15) ? X : X - 1;
    }
    /* tithi running during a part of the day */
    function hits(a, b, win, minMs) {
      var out = [], d, w, ov;
      for (d = civil(a) - 1; d <= civil(b) + 1; d++) {
        w = win(d); ov = overlap(a, b, w[0], w[1]);
        if (ov > (minMs || 0)) out.push({ d: d, ov: ov, frac: ov / (w[1] - w[0]) });
      }
      return out;
    }
    function rWindow(a, b, win, both, none, minMs) {
      var h = hits(a, b, win, minMs);
      if (h.length === 1) return h[0].d;
      if (h.length > 1) {
        if (both === 'first') return h[0].d;
        if (both === 'second') return h[h.length - 1].d;
        return (h[1].ov > h[0].ov + MIN) ? h[1].d : h[0].d;   // 'more'
      }
      if (none === 'udaya') return rUdaya(a, b);
      if (none === 'second') return rUdaya(a, b, true);
      return hday(a);
    }
    /* tithi running at one moment of the day (for example moonrise) */
    function rPoint(a, b, pt, both, none) {
      var out = [], d, p;
      for (d = civil(a) - 1; d <= civil(b) + 1; d++) { p = pt(d); if (p >= a && p < b) out.push(d); }
      if (out.length === 1) return out[0];
      if (out.length > 1) return both === 'second' ? out[out.length - 1] : out[0];
      if (none === 'udaya') return rUdaya(a, b);
      return hday(a);
    }

    /* Ekadashi fast: the day householders keep it (smarta), and the Vaishnava day when it differs */
    function ekadashi(e0, e1, d1) {
      var S = srDays(e0, e1), X, main, alt = null, kind;
      if (S.length >= 2) {
        X = S[0];
        if (d1 > sr(X + 2)) { main = X + 1; kind = 'vriddhi'; }
        else { main = X; alt = X + 1; kind = 'vriddhi'; }
      } else if (S.length === 1) {
        X = S[0];
        if (d1 > sr(X + 1)) {
          main = X; kind = 'plain';
          if (sr(X) - e0 < 96 * MIN) { alt = X + 1; kind = 'arunodaya'; }
        } else { main = X - 1; alt = X; kind = 'dwadashi-kshaya'; }
      } else { main = hday(e0); alt = main + 1; kind = 'kshaya'; }
      /* breaking the fast (parana), the day after: once the first quarter of Dwadashi (Hari Vasara) is over,
         in the morning fifth of the day; if that is missed, after the mid-day fifth; always inside Dwadashi */
      var pd = main + 1, s1 = sr(pd), L = dayLen(pd), hv = e1 + (d1 - e1) / 4, from = Math.max(s1, hv), to;
      if (from <= s1 + L / 5 - 5 * MIN) to = s1 + L / 5;
      else if (from < s1 + 3 * L / 5) { from = s1 + 3 * L / 5; to = s1 + 4 * L / 5; }
      else to = Math.max(s1 + 4 * L / 5, from + 30 * MIN);
      if (to > d1) to = d1;
      if (from >= to) { from = Math.max(s1, hv); to = d1; }
      return { main: main, alt: alt, kind: kind, paranaFrom: from, paranaTo: to, hariVasara: hv, dwadashiEnd: d1 };
    }

    /* Bhadra (Vishti karana) covers the first half of Purnima, measured by angle: it ends at 174 degrees */
    function bhadraEndOf(a, b) { return crossElong(174, (a + b) / 2); }

    /* Raksha Bandhan: Purnima in the afternoon, clear of Bhadra */
    function rakhi(a, b) {
      var bhadraEnd = bhadraEndOf(a, b), h = hits(a, b, W.aparahna), i, w, S, X;
      for (i = 0; i < h.length; i++) {
        w = W.aparahna(h[i].d);
        if (overlap(Math.max(a, bhadraEnd), b, w[0], w[1]) > 0) return h[i].d;
      }
      S = srDays(a, b);
      if (S.length) { X = S[S.length - 1]; if (b - sr(X) >= 3 * dayLen(X) / 15) return X; }
      return h.length ? h[0].d : hday(a);
    }

    /* Holika Dahan: Purnima at dusk, clear of Bhadra */
    function holika(a, b, nextEnd) {
      var bhadraEnd = bhadraEndOf(a, b), h = hits(a, b, W.pradosh), D, w, mid;
      if (h.length >= 2) return h[h.length - 1].d;
      D = h.length ? h[0].d : hday(a);
      if (h.length) {
        w = W.pradosh(D);
        if (overlap(Math.max(a, bhadraEnd), b, w[0], w[1]) > 0) return D;      // dusk free of Bhadra
        mid = ss(D) + nightLen(D) / 2;
        if (bhadraEnd < mid) return D;                                           // Bhadra over before midnight
      }
      /* Bhadra runs past midnight: the next evening is taken when Purnima lasts three and a half
         quarters of that day and the following tithi is a lengthening one */
      if (b >= sr(D + 1) + 3.5 * dayLen(D + 1) / 4 && (nextEnd - b) > DAY) return D + 1;
      if (b >= sr(D + 1) + 3.5 * dayLen(D + 1) / 4 && b < ss(D + 1)) return D + 1;
      return D;
    }

    /* the moon's stay in one nakshatra (27 equal parts of 13 1/3 degrees), found near the moment t */
    function nakshatraSpan(index, t) {
      var lo = index * 40 / 3;
      var r0 = crossMoon(lo, t + (wrap180(lo - moonSid(t)) / 13.2) * DAY);
      return [r0, crossMoon(lo + 40 / 3, r0 + DAY)];
    }

    /* Janmashtami for householders (smarta). a..b is Ashtami; Rohini is nakshatra 3.
       1. Ashtami and Rohini together at midnight: that night (the later one if two).
       2. Otherwise a day that opens in Ashtami, has Ashtami and Rohini together at some time,
          and has Rohini at its midnight.
       3. Otherwise Ashtami alone at midnight (the later night if two), else in the midnight window.
       4. Otherwise the day that opens in Ashtami. */
    function janmashtami(a, b) {
      var R = nakshatraSpan(3, a), y0 = Math.max(a, R[0]), y1 = Math.min(b, R[1]);
      var S = srDays(a, b), days = [hday(a)].concat(S), i, d, m, pick = null, h;
      function mid(d) { return ss(d) + nightLen(d) / 2; }
      for (i = 0; i < days.length; i++) { m = mid(days[i]); if (m >= a && m < b && m >= R[0] && m < R[1]) pick = days[i]; }
      if (pick !== null) return pick;
      for (i = 0; i < S.length; i++) {
        d = S[i]; m = mid(d);
        if (m >= R[0] && m < R[1] && overlap(y0, y1, sr(d), sr(d + 1)) > 0) pick = d;
      }
      if (pick !== null) return pick;
      for (i = 0; i < days.length; i++) { m = mid(days[i]); if (m >= a && m < b) pick = days[i]; }
      if (pick !== null) return pick;
      h = hits(a, b, W.nishita);
      if (h.length) return (h.length > 1 && h[1].ov > h[0].ov) ? h[1].d : h[0].d;
      return rUdaya(a, b, true);
    }

    /* Dussehra: Dashami in the afternoon; Shravana nakshatra (21) in the afternoon decides between two days */
    function dussehra(a, b) {
      var R = nakshatraSpan(21, a), h = hits(a, b, W.aparahna), i, w, X, S;
      function shravana(d) { var w = W.aparahna(d); return overlap(R[0], R[1], w[0], w[1]) > 0; }
      for (i = 0; i < h.length; i++) if (shravana(h[i].d)) return h[i].d;
      if (h.length) {
        X = h[h.length - 1].d + 1;       /* the next morning still in Dashami for three muhurtas, with Shravana that afternoon */
        if (sr(X) < b && b - sr(X) >= 3 * dayLen(X) / 15 && shravana(X)) return X;
        return (h.length > 1 && h[1].ov > h[0].ov + MIN) ? h[1].d : h[0].d;
      }
      return rUdaya(a, b);
    }

    /* Diwali: Amavasya at dusk; when it touches two dusks, the second if it lasts a ghati past sunset */
    function diwali(a, b) {
      var h = hits(a, b, W.pradosh);
      if (h.length >= 2) return (b - ss(h[1].d) >= 24 * MIN) ? h[1].d : h[0].d;
      if (h.length === 1) return h[0].d;
      return rUdaya(a, b);
    }

    /* ---------- the list of observances ---------- */
    /* m: purnimanta month (0 Chaitra .. 11 Phalguna), p: 'S' bright / 'K' dark half, t: tithi 1..15 */
    var YEARLY = [
      { id: 'sheetala-ashtami', m: 0, p: 'K', t: 8, r: 'udaya' },
      { id: 'nav-samvat', m: 0, p: 'S', t: 1, r: 'udaya' },
      { id: 'gangaur', m: 0, p: 'S', t: 3, r: 'udaya' },
      { id: 'ram-navami', m: 0, p: 'S', t: 9, r: 'madhyahna2' },
      { id: 'hanuman-janmotsav', m: 0, p: 'S', t: 15, r: 'udaya' },
      { id: 'akha-teej', m: 1, p: 'S', t: 3, r: 'udaya3' },
      { id: 'buddha-purnima', m: 1, p: 'S', t: 15, r: 'udaya' },
      { id: 'vat-savitri', m: 2, p: 'K', t: 15, r: 'udaya' },
      { id: 'pratap-jayanti', m: 2, p: 'S', t: 3, r: 'udaya' },
      { id: 'ganga-dussehra', m: 2, p: 'S', t: 10, r: 'udaya', inAdhik: true },
      { id: 'rath-yatra', m: 3, p: 'S', t: 2, r: 'udaya' },
      { id: 'guru-purnima', m: 3, p: 'S', t: 15, r: 'udaya' },
      { id: 'hariyali-amavas', m: 4, p: 'K', t: 15, r: 'udaya' },
      { id: 'hariyali-teej', m: 4, p: 'S', t: 3, r: 'udaya' },
      { id: 'nag-panchami', m: 4, p: 'S', t: 5, r: 'udaya' },
      { id: 'raksha-bandhan', m: 4, p: 'S', t: 15, r: 'rakhi' },
      { id: 'kajari-teej', m: 5, p: 'K', t: 3, r: 'udaya' },
      { id: 'janmashtami', m: 5, p: 'K', t: 8, r: 'janmashtami' },
      { id: 'goga-navami', m: 5, p: 'K', t: 9, r: 'udaya' },
      { id: 'bachh-baras', m: 5, p: 'K', t: 12, r: 'udaya' },
      { id: 'ramdev-beej', m: 5, p: 'S', t: 2, r: 'udaya' },
      { id: 'hartalika-teej', m: 5, p: 'S', t: 3, r: 'udaya' },
      { id: 'ganesh-chaturthi', m: 5, p: 'S', t: 4, r: 'madhyahna' },
      { id: 'teja-dashmi', m: 5, p: 'S', t: 10, r: 'udaya' },
      { id: 'anant-chaturdashi', m: 5, p: 'S', t: 14, r: 'udaya' },
      { id: 'shraddh-start', m: 6, p: 'K', t: 1, r: 'aparahna' },
      { id: 'sarvapitru-amavas', m: 6, p: 'K', t: 15, r: 'aparahna' },
      { id: 'navratri', m: 6, p: 'S', t: 1, r: 'udaya' },
      { id: 'durga-ashtami', m: 6, p: 'S', t: 8, r: 'udaya' },
      { id: 'maha-navami', m: 6, p: 'S', t: 9, r: 'aparahna' },
      { id: 'dussehra', m: 6, p: 'S', t: 10, r: 'dussehra' },
      { id: 'sharad-purnima', m: 6, p: 'S', t: 15, r: 'nishita' },
      { id: 'karwa-chauth', m: 7, p: 'K', t: 4, r: 'moonrise' },
      { id: 'ahoi-ashtami', m: 7, p: 'K', t: 8, r: 'moonrise' },
      { id: 'dhanteras', m: 7, p: 'K', t: 13, r: 'pradosh' },
      { id: 'roop-chaudas', m: 7, p: 'K', t: 14, r: 'arunodaya' },
      { id: 'diwali', m: 7, p: 'K', t: 15, r: 'diwali' },
      { id: 'govardhan', m: 7, p: 'S', t: 1, r: 'udaya' },
      { id: 'bhai-dooj', m: 7, p: 'S', t: 2, r: 'aparahna2' },
      { id: 'gopashtami', m: 7, p: 'S', t: 8, r: 'udaya' },
      { id: 'amla-navami', m: 7, p: 'S', t: 9, r: 'udaya' },
      { id: 'tulsi-vivah', m: 7, p: 'S', t: 12, r: 'udaya' },
      { id: 'kartik-purnima', m: 7, p: 'S', t: 15, r: 'udaya' },
      { id: 'til-chauth', m: 10, p: 'K', t: 4, r: 'moonrise' },
      { id: 'mauni-amavas', m: 10, p: 'K', t: 15, r: 'udaya' },
      { id: 'basant-panchami', m: 10, p: 'S', t: 5, r: 'purvahna' },
      { id: 'surya-saptami', m: 10, p: 'S', t: 7, r: 'udaya' },
      { id: 'maha-shivratri', m: 11, p: 'K', t: 14, r: 'nishita' },
      { id: 'phulera-dooj', m: 11, p: 'S', t: 2, r: 'udaya' },
      { id: 'holika-dahan', m: 11, p: 'S', t: 15, r: 'holika' }
    ];

    function pick(rule, a, b, nextEnd) {
      switch (rule) {
        case 'udaya': return rUdaya(a, b);
        case 'udaya3': return rUdayaMin(a, b, 3);
        case 'purvahna': return rWindow(a, b, W.purvahna, 'first', 'start');
        case 'madhyahna': return rWindow(a, b, W.madhyahna, 'more', 'start');     /* equal on both days, or on neither: the first */
        case 'madhyahna2': return rWindow(a, b, W.madhyahna, 'second', 'udaya');  /* Ram Navami: never the day that opens in Ashtami */
        case 'aparahna': return rWindow(a, b, W.aparahna, 'more', 'udaya');
        case 'aparahna2': return rWindow(a, b, W.aparahna, 'second', 'udaya');
        case 'dussehra': return dussehra(a, b);
        case 'pradosh': return rWindow(a, b, W.pradosh, 'more', 'udaya');
        case 'nishita': return rWindow(a, b, W.nishita, 'more', 'udaya');
        case 'arunodaya': return rWindow(a, b, W.arunodaya, 'first', 'udaya');
        case 'moonrise': return rPoint(a, b, moonrise, 'first', 'udaya');
        case 'rakhi': return rakhi(a, b);
        case 'holika': return holika(a, b, nextEnd);
        case 'diwali': return diwali(a, b);
        case 'janmashtami': return janmashtami(a, b);
      }
      throw new Error('panchang: unknown rule ' + rule);
    }

    /* every observance whose day falls in [dnFrom, dnTo], sorted by day */
    function events(dnFrom, dnTo) {
      var from = midnight(dnFrom) - 3 * DAY, to = midnight(dnTo) + 4 * DAY;
      ensure(from - 32 * DAY, to + 32 * DAY);
      var out = [], li, L, k, f, n, e, d, o, v, ek, mo, base, darkName, prevAdhik;
      function add(id, dn, extra) {
        var o = { id: id, dn: dn }, key;
        if (extra) for (key in extra) o[key] = extra[key];
        /* kept when its own day, or its second (Vaishnava) day, is inside the range */
        if ((dn < dnFrom || dn > dnTo) && !(o.alt != null && o.alt >= dnFrom && o.alt <= dnTo)) return null;
        out.push(o);
        return o;
      }
      function span(L, n) { return { a: B[L.i + n].t, b: B[L.i + n + 1].t, c: B[L.i + n + 2].t }; }
      var sawanN = 0, sawanLast = -1e9;
      function mondays(t0, t1) {
        var d;
        for (d = civil(t0) - 1; d <= civil(t1) + 1; d++) {
          if (ymd(d).wd !== 1 || sr(d) < t0 || sr(d) >= t1) continue;
          if (d - sawanLast > 45) sawanN = 0;           /* a new Sawan */
          sawanLast = d;
          add('sawan-somvar', d, { nth: sawanN++ });
        }
      }
      /* Mondays of Shravana (Sawan), purnimanta: the dark half before it and its own bright half.
         Every lunation in the table is walked so that the count starts from the first Monday. */
      for (li = 0; li < LUN.length; li++) {
        L = LUN[li];
        if (L.name === 4) mondays(L.start, B[L.i + 15].t);
        if ((L.adhik ? L.name : (L.name + 1) % 12) === 4) mondays(B[L.i + 15].t, L.end);
      }

      for (li = 0; li < LUN.length; li++) {
        L = LUN[li];
        if (L.end < from - 2 * DAY || L.start > to + 2 * DAY) continue;
        darkName = L.adhik ? L.name : (L.name + 1) % 12;   // purnimanta name of this lunation's dark half
        prevAdhik = li > 0 && LUN[li - 1].adhik && LUN[li - 1].name === L.name;

        /* named yearly days: not in an adhik month. One exception (inAdhik) is kept in the
           adhik month when its month is doubled. */
        for (k = 0; k < YEARLY.length; k++) {
          f = YEARLY[k];
          if (f.inAdhik ? (!L.adhik && prevAdhik) : L.adhik) continue;
          if (f.p === 'S' ? f.m !== L.name : f.m !== darkName) continue;
          n = (f.p === 'S' ? 0 : 15) + f.t - 1;
          e = span(L, n);
          d = pick(f.r, e.a, e.b, e.c);
          o = { start: e.a, end: e.b };
          if (f.id === 'janmashtami') { v = rUdaya(e.a, e.b); if (v !== d) o.alt = v; }
          if (f.id === 'raksha-bandhan' || f.id === 'holika-dahan') o.bhadraEnd = bhadraEndOf(e.a, e.b);
          add(f.id, d, o);
          if (f.id === 'holika-dahan') add('dhulandi', d + 1);
        }

        /* every month: both Ekadashis, Pradosh, Purnima, Amavasya, Chauth, Shivratri */
        for (k = 0; k < 2; k++) {
          base = k * 15; mo = monthOf(L, base);
          e = span(L, base + 10);
          ek = ekadashi(e.a, e.b, e.c);
          add('ekadashi', ek.main, {
            start: e.a, end: e.b, alt: ek.alt, kind: ek.kind, paranaFrom: ek.paranaFrom, paranaTo: ek.paranaTo, hariVasara: ek.hariVasara,
            month: mo.name, adhik: mo.adhik, shukla: k === 0
          });
          e = span(L, base + 12);
          add('pradosh', rWindow(e.a, e.b, W.pradosh, 'more', 'udaya'), { start: e.a, end: e.b, month: mo.name, adhik: mo.adhik, shukla: k === 0 });
        }
        e = span(L, 14);
        add('purnima', rUdaya(e.a, e.b), { start: e.a, end: e.b, month: L.name, adhik: L.adhik });
        e = span(L, 29);
        add('amavasya', rUdaya(e.a, e.b), { start: e.a, end: e.b, month: darkName, adhik: L.adhik });
        e = span(L, 18);
        add('chauth', rPoint(e.a, e.b, moonrise, 'first', 'udaya'), { start: e.a, end: e.b, month: darkName, adhik: L.adhik });
        e = span(L, 28);
        add('masik-shivratri', rWindow(e.a, e.b, W.nishita, 'more', 'udaya'), { start: e.a, end: e.b, month: darkName, adhik: L.adhik });

      }

      /* Makar Sankranti: the Sun enters sidereal Makara; kept that day if it happens before sunset */
      var y0 = ymd(dnFrom).y, y1 = ymd(dnTo).y, y, t, dd;
      for (y = y0; y <= y1 + 1; y++) {
        t = crossSun(270, Date.UTC(y, 0, 14, 12));
        dd = civil(t);
        add('makar-sankranti', t <= ss(dd) ? dd : dd + 1, { at: t });
      }

      out.sort(function (p, q) { return p.dn - q.dn || (p.id < q.id ? -1 : 1); });
      return out;
    }

    return {
      loc: loc, civil: civil, midnight: midnight, ymd: ymd, dnOf: dnOf,
      sunrise: sr, sunset: ss, moonrise: moonrise, tithiAt: tithiAt, day: day, events: events,
      _W: W, _lunations: function (from, to) { ensure(from, to); return LUN.slice(); }, _sunSid: sunSid, _crossSun: crossSun, _moonSid: moonSid, _crossMoon: crossMoon
    };
  }

  return { make: make, version: 1 };
}));
