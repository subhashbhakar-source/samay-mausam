/*
 * Samay aur Mausam: the panchang panel under the India clock.
 * Draws today's tithi, the day's observances with their meaning, and the days ahead.
 * Needs panchang.js (dates), panchang-hi.js (words) and the page's own clock (window.SamayApp).
 */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var DAY = 86400000, MIN = 60000, IST = 330;
  var JAIPUR = { lat: 26.9124, lon: 75.7873, tzMin: IST };
  var DRIK = 'https://www.drikpanchang.com/panchang/day-panchang.html?geoname-id=1269515&date=';
  var AHEAD = 400;          /* days of observances worked out ahead */
  var SHOWN = 7;            /* rows shown before "the whole year" */

  var P, T, eng, host;
  var S = { dn: null, cur: null, is24: null, events: null, from: null, partial: false, openYear: false };

  function app() { return window.SamayApp || { now: function () { return Date.now(); }, is24: function () { return true; } }; }

  /* ---------- small DOM helpers ---------- */
  function el(tag, props) {
    var n = document.createElement(tag), k, i, c;
    if (props) for (k in props) { if (props[k] == null || props[k] === false) continue; if (k === 'class') n.className = props[k]; else if (k === 'text') n.textContent = props[k]; else n.setAttribute(k, props[k] === true ? '' : props[k]); }
    for (i = 2; i < arguments.length; i++) {
      c = arguments[i]; if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null && x !== false) n.appendChild(x.nodeType ? x : document.createTextNode(String(x))); });
      else n.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  }
  function p(cls, text) { return el('p', { class: cls, text: text }); }

  /* ---------- icons: each deity by a symbol, drawn here (no image files) ---------- */
  function rays() {
    var s = '', k, a, r1 = 13.6, r2;
    for (k = 0; k < 12; k++) {
      a = k * Math.PI / 6; r2 = k % 2 ? 17.4 : 20.6;
      s += 'M' + (24 + r1 * Math.cos(a)).toFixed(1) + ' ' + (24 + r1 * Math.sin(a)).toFixed(1) + 'L' + (24 + r2 * Math.cos(a)).toFixed(1) + ' ' + (24 + r2 * Math.sin(a)).toFixed(1);
    }
    return s;
  }
  function petals() {
    var s = '', k, a;
    for (k = 0; k < 8; k++) { a = k * Math.PI / 4; s += '<circle cx="' + (24 + 8.6 * Math.cos(a)).toFixed(1) + '" cy="' + (24 + 8.6 * Math.sin(a)).toFixed(1) + '" r="3.3"/>'; }
    return s;
  }
  var FOOT = '<path d="M15.5 43c-3.9 0-5.9-4-5.9-10.200 0-6 2.100-10.600 5.900-10.600s5.900 4.600 5.900 10.600c0 6.200-2 10.200-5.900 10.200z"/><circle cx="21" cy="17.800" r="2.500"/><circle cx="16.800" cy="15.200" r="2.100"/><circle cx="13" cy="15.700" r="1.900"/><circle cx="9.800" cy="17.600" r="1.700"/><circle cx="7.500" cy="20.600" r="1.500"/>';
  var ICONS = {
    surya: '<circle class="ha" cx="24" cy="24" r="9.2"/><circle class="l l-sa" cx="24" cy="24" r="9.2" stroke-width="2"/><path class="l l-sa" stroke-width="2.6" d="' + rays() + '"/>',
    chandra: '<path class="ha" d="M29.5 7.500A17 17 0 1 0 41.500 32 14 14 0 0 1 29.500 7.500z"/><path class="l l-sa" stroke-width="1.600" d="M29.5 7.500A17 17 0 1 0 41.500 32 14 14 0 0 1 29.500 7.500z"/><path class="ku" d="M38 8l1.200 3 3 1.200-3 1.200-1.200 3-1.200-3-3-1.200 3-1.200z"/>',
    poonam: '<circle class="ha" cx="24" cy="24" r="17" opacity=".25"/><circle class="ha" cx="24" cy="24" r="12"/><circle class="l l-sa" cx="24" cy="24" r="12" stroke-width="1.800"/><circle class="sa" cx="19.500" cy="20" r="2.300" opacity=".32"/><circle class="sa" cx="28.500" cy="27.500" r="3" opacity=".28"/><circle class="sa" cx="27" cy="17.500" r="1.400" opacity=".3"/>',
    diya: '<path class="ha" d="M24 4c5.200 6.200 6.400 11.200 3.800 15-1.700 2.400-5.900 2.400-7.600 0C17.600 15.200 18.800 10.200 24 4z"/><path class="ku" d="M24 10.500c2.200 2.700 2.600 5 1.500 6.700-.700 1-2.300 1-3 0-1.100-1.700-.700-4 1.500-6.700z"/><path class="l l-in" stroke-width="1.600" d="M24 21v4"/><path class="mi" d="M5 24c2.500 11.500 9 17 19 17s16.500-5.500 19-17c-5.300 3.200-11.600 4.800-19 4.800S10.300 27.200 5 24z"/><path class="l l-ha" stroke-width="1.700" d="M12.500 33c3.700 1.800 7.500 2.700 11.500 2.700s7.800-.900 11.500-2.700"/><rect class="mi" x="16.500" y="41" width="15" height="3.200" rx="1.600"/>',
    devi: '<g class="tu"><path d="M24 20.500c-1-6.500-5-10.500-11.500-11.500 0 6.500 4 10.500 11.500 11.500z"/><path d="M24 20.500c1-6.500 5-10.500 11.500-11.500 0 6.500-4 10.500-11.500 11.500z"/><path d="M24 21.500c-3.500-4-8.500-5-13.500-3 3.500 4.200 8.500 5.200 13.500 3z"/><path d="M24 21.500c3.500-4 8.500-5 13.500-3-3.500 4.200-8.500 5.200-13.500 3z"/></g><path class="mi" d="M24 2.500c3.900 0 6.300 3.900 6.300 8.300S27.900 19.500 24 19.500s-6.300-4.300-6.300-8.700S20.100 2.500 24 2.500z"/><path class="l l-sh" stroke-width="1.200" d="M21.700 6.500l2.300 2.200 2.300-2.200"/><path class="sa" d="M17 21.500h14l-1.200 3.200c5.200 1.900 8.200 5.700 8.200 10 0 5.800-6 9.800-14 9.800s-14-4-14-9.800c0-4.300 3-8.100 8.200-10z"/><path class="l l-ha" stroke-width="2" d="M11 35.500c4 2 8.300 3 13 3s9-1 13-3"/><circle class="ku" cx="24" cy="30.500" r="2.100"/><rect class="ha" x="15.500" y="19.500" width="17" height="3.200" rx="1.600"/>',
    lakshmi: '<g class="gu"><path d="M5 25c7.500-1.200 14 1.800 19 9-9 2-16-.500-19-9z" opacity=".55"/><path d="M43 25c-7.500-1.200-14 1.800-19 9 9 2 16-.500 19-9z" opacity=".55"/><path d="M11.500 13.500c7 2.300 11.500 9 12.500 19-8-2.300-12.500-9-12.500-19z" opacity=".78"/><path d="M36.500 13.500c-7 2.300-11.500 9-12.500 19 8-2.300 12.500-9 12.500-19z" opacity=".78"/><path d="M24 7.500c5.500 7 6.500 16 0 25-6.500-9-5.500-18 0-25z"/></g><path class="tu" d="M10 37.500c4.500 3.300 9 4.500 14 4.500s9.500-1.200 14-4.500c-4.700-.200-9.300-1.300-14-3.500-4.700 2.200-9.300 3.300-14 3.500z"/><circle class="ha" cx="24" cy="31" r="2.300"/>',
    vishnu: '<path class="wa" d="M24 3.500c2.600 1.300 4.800 3.500 5 6 6.700 2.300 10.800 8.800 9.200 16.500-1.900 8.800-9.700 14.500-16.200 19.500 0-5.200-7.800-9-10.700-16.500-3-7.700.500-16 7.700-19.500.200-2.500 2.400-4.700 5-6z"/><path class="l l-i2" stroke-width="1.900" d="M24 3.500c2.600 1.300 4.800 3.500 5 6 6.700 2.300 10.800 8.800 9.200 16.500-1.900 8.800-9.700 14.500-16.200 19.500 0-5.200-7.800-9-10.700-16.500-3-7.700.500-16 7.700-19.500.200-2.500 2.400-4.700 5-6z"/><path class="l l-i2" stroke-width="1.700" d="M33.500 15.500c-7 2.500-11 10.500-11.200 29M19 9.700c3.400 1.300 6.600 1.300 10 0M21.200 6.300c1.900.700 3.700.700 5.600 0"/><path class="l l-ku" stroke-width="1.700" d="M14.500 19c3 1.700 6 2 9.500 1M12.500 26c3 2 6 2.600 9.500 2"/>',
    shiva: '<path class="l l-mi" stroke-width="2.800" d="M24 15v29"/><path class="sa" d="M24 2.500l3.400 8L24 15.500l-3.400-5z"/><path class="l l-sa" stroke-width="2.900" d="M24 19.500c-7.200 0-11.200-4.300-10.600-12.500M24 19.500c7.200 0 11.200-4.300 10.600-12.500"/><path class="sa" d="M13.400 2.500l2.300 5.500h-4.600zM34.600 2.500l2.300 5.500h-4.600z"/><path class="ku" d="M16.500 25.500h15l-4.900 5.200 4.900 5.300h-15l4.900-5.300z"/><path class="l l-ha" stroke-width="1.600" d="M16.500 25.500h15M16.500 36h15"/><circle class="ha" cx="24" cy="30.700" r="1.700"/>',
    shivling: '<path class="i2" d="M3.500 37.500c0-3.200 3.200-5.200 8.500-5.200h24c5.300 0 8.500 2 8.500 5.200s-3.200 5.300-8.500 5.300H12c-5.300 0-8.500-2.100-8.500-5.300z"/><path class="in" d="M15.500 33.500V20c0-5.800 3.700-9.500 8.500-9.500s8.500 3.700 8.500 9.500v13.500z"/><path class="l l-sh" stroke-width="1.700" d="M19 19.500h10M19 23h10M19 26.500h10"/><circle class="ku" cx="24" cy="23" r="1.900"/><g class="tu"><path d="M24 9.500c-2.300-3-2.300-5.500 0-7.500 2.300 2 2.300 4.500 0 7.500z"/><path d="M23 10c-3.300-.300-5.600-1.900-6.300-4.800 3.300-.200 5.600 1.400 6.300 4.800z"/><path d="M25 10c3.300-.300 5.600-1.900 6.300-4.800-3.300-.200-5.600 1.400-6.300 4.800z"/></g>',
    ganesha: '<ellipse class="sa" cx="10" cy="21.500" rx="7.800" ry="10.500" opacity=".72"/><ellipse class="sa" cx="38" cy="21.500" rx="7.800" ry="10.500" opacity=".72"/><ellipse class="sh" cx="10.500" cy="21.500" rx="3.600" ry="6" opacity=".4"/><ellipse class="sh" cx="37.500" cy="21.500" rx="3.600" ry="6" opacity=".4"/><circle class="sa" cx="24" cy="20.500" r="11.200"/><path class="l l-sa" stroke-width="7.600" d="M24 27c0 6-1 9.200 1.800 11.800 2.400 2.200 5.900 1 5.900-2"/><path class="ha" d="M15.500 11.500L24 2.500l8.500 9z"/><rect class="ku" x="14.500" y="10.500" width="19" height="2.800" rx="1.400"/><circle class="in" cx="19.300" cy="19.500" r="1.600"/><circle class="in" cx="28.700" cy="19.500" r="1.600"/><path class="ku" d="M24 14.200l1.700 3.600h-3.400z"/><path class="l l-sh" stroke-width="2.300" d="M18.800 27.200l-3.600 2.600"/>',
    hanuman: '<path class="l l-mi" stroke-width="4.200" d="M11.500 40.500L25.500 22.500"/><circle class="mi" cx="10" cy="42.300" r="3"/><circle class="ha" cx="31" cy="15" r="10.800"/><path class="l l-sa" stroke-width="1.700" d="M31 4.200v21.600M21 11.200c3.200 2 16.800 2 20 0M21 18.800c3.200-2 16.800-2 20 0"/><circle class="l l-sa" cx="31" cy="15" r="10.800" stroke-width="2.100"/>',
    rama: '<path class="l l-sa" stroke-width="3.300" d="M13.500 4.500c17 5.200 17 33.800 0 39"/><path class="l l-in" stroke-width="1.200" d="M13.500 4.500v39"/><path class="l l-i2" stroke-width="2.100" d="M7 24h30"/><path class="ku" d="M44.500 24l-8.500-4.800v9.600z"/><path class="l l-ku" stroke-width="1.700" d="M7 24l-3.200-3.200M7 24l-3.200 3.200M10.500 24l-3.200-3.200M10.500 24l-3.200 3.200"/>',
    saraswati: '<path class="l l-mi" stroke-width="3.600" d="M11 37L38.500 9.500"/><circle class="ha" cx="13" cy="35" r="8.800"/><circle class="l l-sa" cx="13" cy="35" r="8.800" stroke-width="1.900"/><circle class="ha" cx="33" cy="15" r="5.700"/><circle class="l l-sa" cx="33" cy="15" r="5.700" stroke-width="1.900"/><path class="l l-in" stroke-width="1" d="M15.500 37.500L41 12"/><path class="l l-mi" stroke-width="2.600" d="M38.500 9.500l5-5M36 6.500l-2.500-2.500M41.500 12l2.500 2.500"/>',
    naag: '<path class="l l-tu" stroke-width="5.700" d="M8.500 41.500c8.500 4 26.500 3 27.500-3 .900-5.200-17.500-3-17.500-9.200 0-3.600 5.500-4.300 5.500-8.300"/><path class="tu" d="M24 5.500c7.200 0 11.700 5 11.700 10.200S30.700 26 24 27.500C17.300 26 12.300 20.900 12.300 15.700S16.800 5.500 24 5.500z"/><path class="l l-ku" stroke-width="1.400" d="M24 5.500V2.700M24 2.700l-1.900-1.500M24 2.700l1.900-1.500"/><circle class="ha" cx="20.700" cy="10.700" r="1.300"/><circle class="ha" cx="27.300" cy="10.700" r="1.300"/><path class="ha" d="M24 14c2.100 2.700 2.100 5 0 6.800-2.100-1.800-2.100-4.100 0-6.800z"/>',
    pagliya: '<g class="ku">' + FOOT + '<g transform="translate(48 0) scale(-1 1)">' + FOOT + '</g></g>',
    tulsi: '<rect class="mi" x="14" y="31" width="20" height="10.300" rx="1.600"/><rect class="mi" x="10.500" y="41" width="27" height="3.600" rx="1.300"/><path class="ha" d="M21 41v-4.300a3 3 0 0 1 6 0V41z"/><path class="l l-tu" stroke-width="1.900" d="M24 31V9.500M24 25l-6.500-5M24 25l6.500-5M24 18l-5.500-4.500M24 18l5.500-4.500"/><g class="tu"><ellipse cx="16" cy="18.500" rx="4.300" ry="2.500" transform="rotate(38 16 18.500)"/><ellipse cx="32" cy="18.500" rx="4.300" ry="2.500" transform="rotate(-38 32 18.500)"/><ellipse cx="17.300" cy="12.300" rx="3.900" ry="2.300" transform="rotate(40 17.300 12.300)"/><ellipse cx="30.700" cy="12.300" rx="3.900" ry="2.300" transform="rotate(-40 30.700 12.300)"/><ellipse cx="24" cy="8" rx="2.400" ry="4"/></g><circle class="gu" cx="24" cy="3.200" r="1.700"/>',
    rakhi: '<path class="l l-ku" stroke-width="2.300" d="M2.500 24c4.500-3 7.500 3 12 0M33.500 24c4.500-3 7.500 3 12 0"/><g class="sa">' + petals() + '</g><circle class="ha" cx="24" cy="24" r="7.200"/><circle class="ku" cx="24" cy="24" r="3.300"/>',
    agni: '<path class="sa" d="M24 2.500c8.500 9.500 13.500 16.500 13.500 24.700 0 7.300-6.200 12.300-13.500 12.300s-13.500-5-13.500-12.300c0-5 2.200-8.500 5.200-11.500 0 4 1.100 6.300 3.100 7.300-1-7.500 1-13.500 5.200-20.500z"/><path class="ha" d="M24 17c4.200 5 6.300 8.300 6.300 12.300 0 3.700-2.800 6.200-6.300 6.200s-6.300-2.500-6.300-6.200c0-2.100 1-4.100 2.600-5.700.500 2.100 1.300 3.200 2.100 3.700-.500-3.700 0-6.700 1.600-10.300z"/><path class="l l-mi" stroke-width="3.500" d="M6.500 44.500l35-6.500M41.500 44.500l-35-6.500"/>',
    krishna: '<path class="l l-tu" stroke-width="1.700" d="M12 33.500C15.500 26 21 18.500 28 12.500"/><g transform="rotate(40 31 12.500)"><ellipse class="tu" cx="31" cy="12.500" rx="8.300" ry="11.500"/><ellipse class="ha" cx="31" cy="13.300" rx="5.900" ry="8"/><ellipse class="mt" cx="31" cy="14" rx="4.500" ry="6"/><ellipse class="md" cx="31" cy="15" rx="2.700" ry="3.600"/></g><path class="l l-ha" stroke-width="5.200" d="M5.500 33.500l37 7.500"/><g class="in"><circle cx="16" cy="35.700" r="1.150"/><circle cx="22" cy="36.900" r="1.150"/><circle cx="28" cy="38.100" r="1.150"/><circle cx="34" cy="39.300" r="1.150"/></g><path class="l l-ku" stroke-width="1.900" d="M9.300 31.500l-1.100 5.300M40 37.700l-1.100 5.300"/>'
  };
  function icon(name, size) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('class', 'pi'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || ICONS.diya;
    return s;
  }
  /* the swing of Teej: a branch, two ropes strung with marigolds, a seat with a lehariya cloth */
  function jhula() {
    var s = document.createElementNS(SVGNS, 'svg'), g = '', y, i = 0;
    s.setAttribute('viewBox', '0 0 120 92'); s.setAttribute('class', 'pi jhula'); s.setAttribute('aria-hidden', 'true');
    for (y = 24; y <= 62; y += 9.5, i++) {
      g += '<circle class="' + (i % 2 ? 'g2' : 'g1') + '" cx="38" cy="' + y + '" r="3.600"/><circle class="' + (i % 2 ? 'g1' : 'g2') + '" cx="82" cy="' + y + '" r="3.600"/>';
    }
    s.innerHTML = '<path class="l l-mi" stroke-width="5.500" d="M3 14c22-8 44 4 66-1 17-4 32-3 48 2"/>' +
      '<g class="tu"><ellipse cx="14" cy="7" rx="8" ry="3.600" transform="rotate(-18 14 7)"/><ellipse cx="29" cy="5.500" rx="8" ry="3.600" transform="rotate(12 29 5.500)"/><ellipse cx="52" cy="6.500" rx="8" ry="3.600" transform="rotate(-10 52 6.500)"/><ellipse cx="70" cy="6" rx="8" ry="3.600" transform="rotate(14 70 6)"/><ellipse cx="92" cy="5" rx="8" ry="3.600" transform="rotate(-14 92 5)"/><ellipse cx="108" cy="8" rx="8" ry="3.600" transform="rotate(16 108 8)"/><ellipse cx="20" cy="21" rx="7" ry="3.200" transform="rotate(28 20 21)"/><ellipse cx="100" cy="21" rx="7" ry="3.200" transform="rotate(-28 100 21)"/><ellipse cx="60" cy="19" rx="7" ry="3.200" transform="rotate(8 60 19)"/></g>' +
      '<path class="l l-i2" stroke-width="1.400" d="M38 13v58M82 12v59"/>' + g +
      '<rect class="mi" x="26" y="71" width="68" height="7" rx="3.500"/>' +
      '<path class="gu" d="M31 71.500h58l-3 9.500-5-4-5 4-5-4-5 4-5-4-5 4-5-4-5 4-5-4-5 4z"/>' +
      '<path class="l l-ha" stroke-width="1.600" d="M33 74.500h54"/>';
    return s;
  }

  /* ---------- words for dates and times ---------- */
  function parts(ms) { var d = new Date(ms + IST * MIN); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; }
  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function hm(ms) {
    var q = parts(ms + 30000);   /* to the nearest minute */
    if (app().is24()) return two(q.h) + ':' + two(q.mi);
    var part = q.h < 4 ? 'रात' : q.h < 12 ? 'सुबह' : q.h < 16 ? 'दोपहर' : q.h < 20 ? 'शाम' : 'रात';
    return part + ' ' + (q.h % 12 || 12) + ':' + two(q.mi);
  }
  function dateShort(dn, withYear) {
    var g = eng.ymd(dn);
    return g.d + ' ' + T.gregMonthShort[g.m - 1] + (withYear ? ' ' + g.y : '');
  }
  function dateLong(dn) { var g = eng.ymd(dn); return T.weekday[g.wd] + ', ' + g.d + ' ' + T.gregMonth[g.m - 1]; }
  function dayWord(dn) { var k = dn - S.dn; return k === 0 ? 'आज' : k === 1 ? 'कल' : k === 2 ? 'परसों' : null; }
  /* "आज 14:35", "कल 06:06", "20 नव॰ 07:16" */
  function when(ms) { var dn = eng.civil(ms); return (dayWord(dn) || dateShort(dn)) + ' ' + hm(ms); }
  function away(dn) { var k = dn - S.dn; return k === 0 ? 'आज' : k === 1 ? 'कल' : k === 2 ? 'परसों' : k + ' दिन बाद'; }
  var NTH = ['पहला', 'दूसरा', 'तीसरा', 'चौथा', 'पांचवां', 'छठा', 'सातवां', 'आठवां', 'नौवां'];

  /* ---------- turning a calculated observance into words ---------- */
  var TEEJ = { 'gangaur': 1, 'akha-teej': 1, 'hariyali-teej': 1, 'kajari-teej': 1, 'hartalika-teej': 1 };
  var NAMED_PURNIMA = ['hanuman-janmotsav', 'buddha-purnima', 'guru-purnima', 'raksha-bandhan', 'sharad-purnima', 'kartik-purnima', 'holika-dahan'];
  var NAMED_AMAVAS = ['mauni-amavas', 'vat-savitri', 'hariyali-amavas', 'sarvapitru-amavas', 'diwali'];

  /* drop the plain monthly entry when a named day of the same kind falls on that date */
  function tidy(list) {
    var byDay = {}, out = [], i, e;
    for (i = 0; i < list.length; i++) { e = list[i]; (byDay[e.dn] = byDay[e.dn] || {})[e.id] = true; }
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.id === 'purnima' && NAMED_PURNIMA.some(function (k) { return byDay[e.dn][k]; })) continue;
      if (e.id === 'amavasya' && NAMED_AMAVAS.some(function (k) { return byDay[e.dn][k]; })) continue;
      if (e.id === 'chauth' && !e.adhik && (e.month === 7 || e.month === 10)) continue;   /* Karwa Chauth and Til Chauth have their own entries */
      if (e.id === 'masik-shivratri' && !e.adhik && e.month === 11) continue;             /* that one is Maha Shivratri */
      out.push(e);
    }
    return out;
  }

  function tithiSpan(e, label) { return label + ': ' + when(e.start) + ' से ' + when(e.end) + ' तक'; }

  function describe(e) {
    var base = T.events[e.id] || {}, g = eng.ymd(e.dn), o, lines = [], ek;
    o = { id: e.id, dn: e.dn, name: base.name, deity: base.deity, icon: base.icon, level: base.level || 1, look: base.look || 'vrat', text: base.text, more: null, lines: lines, e: e };

    if (e.id === 'ekadashi') {
      ek = T.ekadashiOf(e);
      o.name = ek.name; o.text = ek.text; o.more = T.ekadashiCommon; o.deity = 'भगवान विष्णु, श्री कृष्ण'; o.icon = 'krishna'; o.level = 3; o.look = 'ekadashi';
      o.sub = T.dayName(e.month, e.adhik, e.shukla ? 10 : 25, true);
      lines.push('व्रत का दिन (गृहस्थ): ' + dateLong(e.dn));
      if (e.alt != null) lines.push('वैष्णव संप्रदाय में व्रत: ' + dateLong(e.alt));
      lines.push(tithiSpan(e, 'ग्यारस तिथि'));
      if (e.kind === 'kshaya') lines.push('यह ग्यारस किसी सूर्योदय को नहीं छूती। इसलिए गृहस्थ उसी दिन व्रत रखते हैं जिस दिन ग्यारस लगती है, और वैष्णव अगले दिन।');
      else if (e.kind === 'dwadashi-kshaya') lines.push('ग्यारस के बाद बारस अगले सूर्योदय से पहले ही खत्म हो जाती है। इसलिए गृहस्थ एक दिन पहले व्रत रखते हैं, ताकि पारण बारस में हो सके; वैष्णव अगले दिन।');
      else if (e.kind === 'arunodaya') lines.push('ग्यारस सूर्योदय से कुछ ही देर पहले लगती है, यानी भोर में दसम का स्पर्श है। इसलिए वैष्णव अगले दिन व्रत रखते हैं।');
      else if (e.kind === 'vriddhi') lines.push(e.alt != null ? 'ग्यारस दो दिन सूर्योदय पर है; गृहस्थ पहले दिन और वैष्णव दूसरे दिन व्रत रखते हैं।' : 'ग्यारस दो दिन सूर्योदय पर है; व्रत दूसरे दिन रखा जाता है।');
      lines.push('पारण (व्रत खोलना): ' + when(e.paranaFrom) + ' से ' + hm(e.paranaTo) + ' के बीच' +
        (e.hariVasara > eng.sunrise(e.dn + 1) ? '; हरि वासर ' + hm(e.hariVasara) + ' तक रहता है, उसमें पारण नहीं होता' : '') + '।' +
        (e.alt != null ? ' यह समय गृहस्थों के व्रत के लिए है।' : ''));
      return o;
    }
    if (e.id === 'pradosh') {
      o.name = T.pradoshByDay[g.wd] + ' व्रत';
      var ss = eng.sunset(e.dn);
      lines.push('प्रदोष काल (जयपुर): ' + hm(ss) + ' से ' + hm(ss + (eng.sunrise(e.dn + 1) - ss) / 5) + ' तक');
      return o;
    }
    if (e.id === 'purnima') { o.name = (e.adhik ? T.adhik + ' ' : '') + T.monthRj[e.month] + ' पूनम'; lines.push(tithiSpan(e, 'पूनम तिथि')); return o; }
    if (e.id === 'amavasya') {
      o.name = (e.adhik ? T.adhik + ' ' : '') + T.monthRj[e.month] + ' अमावस';
      if (g.wd === 1) { o.name = 'सोमवती अमावस (' + T.monthRj[e.month] + ')'; o.more = T.somvati; }
      if (g.wd === 6) { o.name = 'शनि अमावस (' + T.monthRj[e.month] + ')'; o.more = T.shaniAmavas; }
      lines.push(tithiSpan(e, 'अमावस तिथि'));
      return o;
    }
    if (e.id === 'chauth') {
      if (g.wd === 2) { o.name = 'अंगारकी संकष्टी चौथ'; o.more = T.angarki; }
      lines.push('जयपुर में चांद निकलेगा: लगभग ' + hm(eng.moonrise(e.dn)));
      return o;
    }
    if (e.id === 'masik-shivratri') { if (e.month === 4) o.name = 'सावण शिवरात्रि'; return o; }
    if (e.id === 'sawan-somvar') { o.name = 'सावण का ' + (NTH[e.nth] || '') + ' सोमवार'; return o; }

    /* named days */
    if (e.id === 'karwa-chauth' || e.id === 'til-chauth' || e.id === 'kajari-teej') lines.push('जयपुर में चांद निकलेगा: लगभग ' + hm(eng.moonrise(e.dn)));
    if (e.id === 'janmashtami' && e.alt != null) lines.push('गृहस्थ (स्मार्त): ' + dateLong(e.dn) + '। वैष्णव मंदिरों में: ' + dateLong(e.alt) + '।');
    if (e.id === 'makar-sankranti') {
      lines.push('सूर्य का मकर राशि में प्रवेश: ' + when(e.at) + ' के आसपास');
      if (eng.civil(e.at) !== e.dn) lines.push('प्रवेश सूर्यास्त के बाद हुआ, इसलिए स्नान-दान का पुण्य काल इस दिन है।');
    }
    if (e.id === 'nav-samvat') lines.push('इस दिन से विक्रम संवत ' + eng.day(e.dn).vikram + ' शुरू होता है।');
    if (e.id === 'raksha-bandhan' || e.id === 'holika-dahan') {
      var bh = e.bhadraEnd;
      if (e.id === 'raksha-bandhan') lines.push(bh > eng.sunrise(e.dn) ? 'भद्रा ' + when(bh) + ' तक है; राखी उसके बाद बांधें।' : 'इस दिन भद्रा नहीं है।');
      else lines.push(bh > eng.sunset(e.dn) ? 'भद्रा ' + when(bh) + ' तक है।' : 'शाम को भद्रा नहीं है।');
    }
    if (NAMED_AMAVAS.indexOf(e.id) >= 0 && g.wd === 1) lines.push('सोमवार की अमावस होने से यह सोमवती अमावस भी है।');
    if (e.id === 'diwali') { var s2 = eng.sunset(e.dn); lines.push('लक्ष्मी पूजन का प्रदोष काल (जयपुर): ' + hm(s2) + ' से ' + hm(s2 + (eng.sunrise(e.dn + 1) - s2) / 5) + ' तक'); }
    if (e.start && e.end) {
      var n = eng.tithiAt((e.start + e.end) / 2).n;
      lines.push(tithiSpan(e, T.tithiName(n, true) + ' तिथि'));
    }
    return o;
  }

  /* ---------- cards ---------- */
  function strip(look) { return el('div', { class: 'occ-strip ' + look, 'aria-hidden': 'true' }); }

  function card(o, mode) {
    /* mode: 'today' | 'alt' (the Vaishnava day of an Ekadashi or Janmashtami) */
    var head, title = o.name, kicker = null, body, art;
    if (o.look === 'ekadashi') { kicker = mode === 'alt' ? 'आज वैष्णव ग्यारस है' : 'आज ग्यारस है'; }
    else if (o.look === 'teej') { kicker = 'आज तीज है'; }
    if (mode === 'alt' && o.id === 'janmashtami') kicker = 'आज वैष्णव मंदिरों में जन्माष्टमी है';

    head = el('div', { class: 'occ-head' },
      el('div', { class: 'occ-titles' },
        kicker ? el('p', { class: 'occ-kicker', text: kicker }) : null,
        el('h3', { text: title }),
        o.sub || o.deity ? el('p', { class: 'occ-deity', text: [o.sub, o.deity].filter(Boolean).join(', ') }) : null),
      el('div', { class: 'occ-icon' }, icon(o.icon, o.level >= 3 ? 64 : 52)));

    body = el('div', { class: 'occ-body' }, head);
    if (o.id === 'hariyali-teej' || o.id === 'kajari-teej') { art = el('div', { class: 'occ-art' }, jhula()); body.appendChild(art); }
    if (mode === 'alt' && o.id === 'ekadashi') body.appendChild(p('occ-note', 'गृहस्थों का व्रत कल था; आज वैष्णव संप्रदाय का व्रत है।'));
    if (o.text) body.appendChild(p('occ-text', o.text));
    if (o.more) body.appendChild(p('occ-text', o.more));
    if (o.lines.length) body.appendChild(el('ul', { class: 'occ-lines' }, o.lines.map(function (t) { return el('li', { text: t }); })));

    var dress = o.look;
    if (o.id === 'diwali' || o.id === 'dhanteras' || o.id === 'roop-chaudas') dress = 'utsav diwali';
    if (o.id === 'dhulandi') dress = 'utsav holi';
    return el('article', { class: 'occ ' + o.look + (o.level >= 3 ? ' big' : '') }, o.look === 'vrat' ? null : strip(dress), body);
  }

  function row(o, open) {
    var k = o.dn - S.dn, g = eng.ymd(o.dn);
    var cls = 'up-row' + (o.look === 'ekadashi' ? ' is-ek' : o.look === 'teej' ? ' is-teej' : o.level >= 3 ? ' is-big' : '');
    var sum = el('summary', null,
      el('span', { class: 'up-date' }, el('b', { text: g.d + ' ' + T.gregMonthShort[g.m - 1] }), el('span', { text: T.weekdayShort[g.wd] })),
      el('span', { class: 'up-name' }, o.name,
        o.e.alt != null && (o.id === 'ekadashi' || o.id === 'janmashtami') ? el('small', { text: 'वैष्णव: ' + dateShort(o.e.alt) }) : null),
      el('span', { class: 'up-away', text: away(o.dn) }));
    var d = el('details', { class: cls }, sum), built = false;
    d.addEventListener('toggle', function () {
      if (!d.open || built) return;
      built = true;
      var day = eng.day(o.dn);
      d.appendChild(el('div', { class: 'up-more' },
        el('div', { class: 'up-who' }, icon(o.icon, 40),
          el('div', null,
            p('up-tithi', 'उस दिन: ' + T.dayName(day.month, day.adhik, day.tithi, true) + ', ' + T.weekday[day.wd]),
            o.deity ? p('occ-deity', o.deity) : null)),
        o.text ? p('occ-text', o.text) : null,
        o.more ? p('occ-text', o.more) : null,
        o.lines.length ? el('ul', { class: 'occ-lines' }, o.lines.map(function (t) { return el('li', { text: t }); })) : null));
    });
    void k; void open;
    return d;
  }

  /* ---------- seasons that are running ---------- */
  function seasons(d) {
    var out = [], k = d.tithi % 15, pos = d.month * 30 + (d.shukla ? 15 + k : k);
    var sign = Math.floor(eng._sunSid(d.sunrise) / 30);
    if (d.adhik) out.push('अधिक मास (पुरुषोत्तम मास)');
    if ((d.month === 6 || d.month === 0) && d.shukla && k <= 8 && !d.adhik) out.push('नवरात्रि');
    if (d.month === 6 && !d.shukla && !d.adhik) out.push('श्राद्ध पक्ष');
    if (d.month === 4) out.push('सावण का महीना');
    if (d.month === 7 && !d.adhik) out.push('काती का महीना');
    if (pos >= 115 && pos < 235) out.push('चातुर्मास');
    if (sign === 8 || sign === 11) out.push('मलमास (खरमास): शादियों के मुहूर्त नहीं');
    return out;
  }

  /* ---------- today ---------- */
  function todayBlock() {
    var d = eng.day(S.dn), now = app().now(), cur = eng.tithiAt(now);
    var todays = [], tomorrows = [], i, e, top;
    for (i = 0; i < S.events.length; i++) {
      e = S.events[i];
      if (e.dn === S.dn) todays.push({ o: describe(e), mode: 'today' });
      else if (e.alt === S.dn && (e.id === 'ekadashi' || e.id === 'janmashtami')) todays.push({ o: describe(e), mode: 'alt' });
      else if (e.dn === S.dn + 1) tomorrows.push(describe(e));
    }
    todays.sort(function (a, b) { return b.o.level - a.o.level; });
    top = todays.length ? todays[0].o : null;
    var vaar = T.vaar[d.wd];

    /* the tithi line: every tithi that touches this sunrise-to-sunrise day */
    var segs = d.segs, tl = T.tithiName(segs[0].n, true) + ' ' + when(segs[0].end) + ' तक';
    for (i = 1; i < segs.length; i++) tl += ', फिर ' + T.tithiName(segs[i].n, true) + ' ' + when(segs[i].end) + ' तक';
    if (segs.length === 1) tl += ', फिर ' + T.tithiName((segs[0].n + 1) % 30, true);
    tl += '।';

    var box = el('div', { class: 'pan-today' },
      el('div', { class: 'pan-tithi' },
        el('div', { class: 'pan-medal' }, icon(top ? top.icon : vaar.icon, 56)),
        el('div', { class: 'pan-names' },
          el('p', { class: 'pan-rj', text: T.dayName(d.month, d.adhik, d.tithi, true) }),
          el('p', { class: 'pan-hi', text: T.dayName(d.month, d.adhik, d.tithi, false) + ', विक्रम संवत ' + d.vikram }))),
      p('pan-line', tl),
      cur.n !== d.tithi && now >= d.sunrise ? p('pan-line', 'अभी ' + T.tithiName(cur.n, true) + ' चल रही है।') : null,
      now < d.sunrise ? p('pan-line pan-soft', 'पंचांग का दिन सूर्योदय (' + hm(d.sunrise) + ') से गिना जाता है।') : null,
      p('pan-line pan-soft', 'जयपुर में सूर्योदय ' + hm(d.sunrise) + ', सूर्यास्त ' + hm(d.sunset)));

    var chips = seasons(d);
    if (chips.length) box.appendChild(el('ul', { class: 'pan-chips' }, chips.map(function (t) { return el('li', { text: t }); })));

    todays.forEach(function (x) { box.appendChild(card(x.o, x.mode)); });

    /* tomorrow, said in advance for fasts and big days */
    var tm = tomorrows.filter(function (o) { return o.level >= 2; }).sort(function (a, b) { return b.level - a.level; });
    if (tm.length) {
      box.appendChild(el('p', { class: 'pan-kal' + (tm[0].look === 'ekadashi' ? ' is-ek' : tm[0].look === 'teej' ? ' is-teej' : '') },
        el('b', { text: 'कल: ' }), tm.map(function (o) { return o.name; }).join('; '),
        tm.some(function (o) { return o.id === 'hariyali-teej' || o.id === 'kajari-teej'; }) ? '। आज सिंजारा है।' : ''));
    }

    /* the weekday and the tithi, in plain words */
    box.appendChild(el('div', { class: 'pan-about' },
      p(null, vaar.text),
      p(null, T.tithiName(d.tithi, true) + ': ' + T.tithiMeaning(d.tithi))));
    return box;
  }

  /* ---------- the days ahead ---------- */
  function aheadBlock() {
    var all = S.events.filter(function (e) { return e.dn > S.dn; }).map(describe);
    all.forEach(function (o, i) { o.ord = i; });
    all.sort(function (a, b) { return a.dn - b.dn || b.level - a.level || a.ord - b.ord; });   /* on one day, the bigger observance first */
    var nextEk = null, nextTeej = null, i, list, rest, g, lastMonth = null, wrap;
    for (i = 0; i < all.length; i++) {
      if (!nextEk && all[i].look === 'ekadashi') nextEk = all[i];
      if (!nextTeej && TEEJ[all[i].id]) nextTeej = all[i];
    }
    var box = el('div', { class: 'pan-ahead' }, el('h3', { class: 'pan-h3', text: 'आगे के खास दिन' }));
    if (S.partial) { box.appendChild(p('pan-wait', 'आगे के दिन गिने जा रहे हैं।')); return box; }

    var two = el('div', { class: 'pan-next' });
    if (nextEk) two.appendChild(el('p', { class: 'next is-ek' }, el('span', { class: 'next-icon' }, icon('krishna', 34)),
      el('span', null, el('b', { text: 'अगली ग्यारस: ' }), dateLong(nextEk.dn) + ' (' + away(nextEk.dn) + ')', el('br'), nextEk.name)));
    if (nextTeej) two.appendChild(el('p', { class: 'next is-teej' }, el('span', { class: 'next-icon' }, icon(nextTeej.icon, 34)),
      el('span', null, el('b', { text: 'अगली तीज: ' }), dateLong(nextTeej.dn) + ' ' + eng.ymd(nextTeej.dn).y + ' (' + away(nextTeej.dn) + ')', el('br'), nextTeej.name)));
    box.appendChild(two);

    list = el('div', { class: 'up-list' });
    all.slice(0, SHOWN).forEach(function (o) { list.appendChild(row(o)); });
    box.appendChild(list);

    rest = all.slice(SHOWN);
    if (rest.length) {
      wrap = el('div', { class: 'up-list' });
      rest.forEach(function (o) {
        g = eng.ymd(o.dn);
        if (g.m !== lastMonth) { lastMonth = g.m; wrap.appendChild(el('h4', { class: 'up-month', text: T.gregMonth[g.m - 1] + ' ' + g.y })); }
        wrap.appendChild(row(o));
      });
      var det = el('details', { class: 'up-year', open: S.openYear || null }, el('summary', { text: 'पूरे साल के खास दिन देखें (' + rest.length + ' और)' }), wrap);
      det.addEventListener('toggle', function () { S.openYear = det.open; });
      box.appendChild(det);
    }
    box.appendChild(p('pan-tap', 'किसी दिन पर दबाएं, उसका अर्थ और समय खुल जाएगा।'));
    return box;
  }

  function footNote() {
    var g = eng.ymd(S.dn);
    return el('p', { class: 'pan-foot' },
      'यह पंचांग किसी वेबसाइट से नहीं आता: सूर्य और चंद्रमा की स्थिति से, जयपुर के सूर्योदय के हिसाब से, इसी ऐप में गिना जाता है। व्रत और त्योहार के दिन गृहस्थों (स्मार्त) के नियम से हैं; मंदिर या संप्रदाय का दिन कभी-कभी अलग होता है। समय में एक-दो मिनट का फर्क हो सकता है। ',
      el('a', { href: DRIK + two(g.d) + '/' + two(g.m) + '/' + g.y, rel: 'noopener', text: 'आज का दिन Drik Panchang पर मिलाएं' }), '।');
  }

  /* ---------- render ---------- */
  function fail(msg) {
    if (!host) return;
    host.textContent = '';
    host.appendChild(p('pan-wait', msg));
  }
  function render(full) {
    var now = app().now(), dn = eng.civil(now), is24 = app().is24();
    if (S.events == null || S.from == null || dn < S.from || dn > S.from + 30) {
      /* today first, so the panel appears at once; the year ahead a moment later */
      S.from = dn;
      S.events = tidy(eng.events(dn - 1, dn + 1));
      S.partial = true;
      full = true;
      setTimeout(function () {
        try { S.events = tidy(eng.events(S.from - 1, S.from + AHEAD)); S.partial = false; render(true); }
        catch (err) { S.partial = false; }
      }, 80);
    }
    if (dn !== S.dn || is24 !== S.is24) full = true;
    S.dn = dn; S.is24 = is24; S.cur = eng.tithiAt(now).n;
    var t = todayBlock();
    if (full || !host.firstChild) {
      host.textContent = '';
      host.appendChild(t);
      host.appendChild(aheadBlock());
      host.appendChild(footNote());
    } else {
      host.replaceChild(t, host.firstChild);
    }
  }
  function tick() {
    if (!eng || !host) return;
    try {
      var now = app().now(), dn = eng.civil(now);
      if (dn !== S.dn || app().is24() !== S.is24) render(true);
      else if (eng.tithiAt(now).n !== S.cur || (S.dn != null && Math.abs(now - eng.sunrise(S.dn)) < 90000)) render(false);
    } catch (err) { fail('पंचांग नहीं गिना जा सका। पेज दोबारा खोलकर देखें।'); }
  }
  function init() {
    host = document.getElementById('pan-body');
    if (!host) return;
    P = window.Panchang; T = window.PanchangText;
    if (!P || !T || !window.Astronomy) { fail('पंचांग की फाइलें नहीं खुल सकीं। नेटवर्क आने पर पेज दोबारा खोलें।'); return; }
    try { eng = P.make(JAIPUR); render(true); }
    catch (err) { fail('पंचांग नहीं गिना जा सका। पेज दोबारा खोलकर देखें।'); }
  }

  window.PanchangUI = { init: init, tick: tick, refresh: function () { if (eng && host) { try { render(true); } catch (e) { } } }, _icons: ICONS, _icon: icon, _jhula: jhula };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
