#!/usr/bin/env node
// Reads the India Meteorological Department local weather reports for Jaipur and Nagaur
// and saves the figures to data/weather.json, which index.html shows.
// No packages needed: Node 18 or newer.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'weather.json');
export const STATIONS = [
  { key: 'jaipur', id: '42348', expect: /jaipur/i },
  { key: 'nagaur', id: '42242', expect: /nagaur/i },
];
export const pageUrl = (id) => `https://city.imd.gov.in/citywx/city_weather_test_try_warnings.php?id=${id}`;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const REWRITE_AFTER_MS = 110 * 60 * 1000; // with no change at IMD, still refresh the "last checked" time about every 2 hours
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function decode(s) {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;|&rsquo;|&#8217;/gi, "'").replace(/&deg;|&#176;|&#xb0;/gi, '°')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
}

// One line per table row, one tab per cell. Everything else becomes plain text.
export function htmlToText(html) {
  let s = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<\/(td|th)\s*>/gi, '\t').replace(/<(\/tr|\/p|\/div|\/h[1-6]|\/table|\/li|\/center|\/title)\b[^>]*>/gi, '\n').replace(/<tr\b[^>]*>/gi, '\n');
  s = decode(s.replace(/<[^>]+>/g, ' ')).replace(/\r/g, '').replace(/[  \f\v]+/g, ' ');
  return s.split('\n').map((l) => l.replace(/ *\t */g, '\t').trim()).filter((l) => l.replace(/\t/g, '').trim()).join('\n');
}

const isNum = (t) => /^[-+]?\d+(\.\d+)?$/.test(t);
const num = (t) => (t != null && isNum(String(t).replace(/[,;]$/, '')) ? Number(String(t).replace(/[,;]$/, '')) : null);
const isBlankish = (t) => /^(na|n\/a|-+|–|—)$/i.test(t);
function rain(t) {
  if (t == null) return null;
  if (/^nil$/i.test(t)) return 'NIL';
  if (/^tr(ace)?$/i.test(t)) return 'TRACE';
  return num(t);
}
function isoFromDMY(d, m, y) {
  if (d == null || d === '') return null;
  let year = Number(y); if (year < 100) year += 2000;
  const mm = Number(m), dd = Number(d);
  if (!(mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
const hhmm = (t) => (t ? t.replace('.', ':').replace(/^(\d):/, '0$1:') : null);
const recordedOn = (label) => { const x = /on\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(label || ''); return x ? isoFromDMY(x[1], x[2], x[3]) : null; };

export function parseReport(html) {
  const text = htmlToText(html);
  const flat = text.replace(/[\t\n]+/g, ' ').replace(/ +/g, ' ');
  const rows = text.split('\n').map((l) => l.split('\t').map((c) => c.trim()));
  const imd = {
    station: null, dated: null, max_c: null, max_recorded_on: null, max_departure_c: null,
    min_c: null, min_recorded_on: null, min_departure_c: null, rain_24h: null, rh_0830: null, rh_1730: null,
    rh_1730_recorded_on: null, sunset: null, sunrise_tomorrow: null, moonset: null, moonrise: null, forecast: [],
  };
  let m = /Forecast\s+For\s*:\s*(.+?)\s+Dated\s*:\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(flat);
  if (m) {
    imd.station = m[1].trim();
    const mo = MON.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) imd.dated = `${m[4]}-${String(mo + 1).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }

  // The report is a two-column table: a label cell, then its value cell.
  const find = (re) => { const out = []; rows.forEach((cells, i) => { if (cells.length > 1 && re.test(cells[0])) out.push({ i, label: cells[0], value: cells.slice(1).find((c) => c !== '') || '' }); }); return out; };
  const maxRow = find(/^Maximum\s*Temp/i)[0], minRow = find(/^Minimum\s*Temp/i)[0];
  if (maxRow || minRow) {
    if (maxRow) { imd.max_c = num(maxRow.value); imd.max_recorded_on = recordedOn(maxRow.label); }
    if (minRow) { imd.min_c = num(minRow.value); imd.min_recorded_on = recordedOn(minRow.label); }
    for (const d of find(/^Departure\s+from\s+Normal/i)) {
      const afterMin = minRow && d.i > minRow.i;
      if (!afterMin && maxRow && d.i > maxRow.i && imd.max_departure_c === null) imd.max_departure_c = num(d.value);
      else if (afterMin && imd.min_departure_c === null) imd.min_departure_c = num(d.value);
    }
    const r = find(/^24\s*Hours?\s*Rainfall/i)[0]; if (r) imd.rain_24h = rain(r.value);
    const h1 = find(/^Relative\s+Humidity\s+at\s+0830/i)[0]; if (h1) imd.rh_0830 = num(h1.value);
    const h2 = find(/^Relative\s+Humidity\s+at\s+1730/i)[0]; if (h2) { imd.rh_1730 = num(h2.value); imd.rh_1730_recorded_on = recordedOn(h2.label); }
  } else {
    // No table cells found: read the same labels from the running text instead.
    const REC = 'Recorded\\.?\\s*on\\s*(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})\\s*\\)?';
    const TOK = '(\\S+)(?=\\s|$)';
    const maxM = new RegExp(`Maximum\\s*Temp[\\s\\S]{0,40}?${REC}\\s*${TOK}`, 'i').exec(flat);
    const minM = new RegExp(`Minimum\\s*Temp[\\s\\S]{0,40}?${REC}\\s*${TOK}`, 'i').exec(flat);
    if (maxM) { imd.max_c = num(maxM[4]); imd.max_recorded_on = isoFromDMY(maxM[1], maxM[2], maxM[3]); }
    if (minM) { imd.min_c = num(minM[4]); imd.min_recorded_on = isoFromDMY(minM[1], minM[2], minM[3]); }
    const minAt = minM ? minM.index : Infinity;
    for (const d of flat.matchAll(new RegExp(`Departure\\s+from\\s+Normal\\s*(?:\\([^)]*\\))?\\s*${TOK}(?!\\s+Hours?\\b)`, 'gi'))) {
      if (maxM && d.index > maxM.index && d.index < minAt && imd.max_departure_c === null) imd.max_departure_c = num(d[1]);
      else if (minM && d.index > minAt && imd.min_departure_c === null) imd.min_departure_c = num(d[1]);
    }
    m = new RegExp(`24\\s*Hours?\\s*Rainfall[\\s\\S]{0,170}?of\\s+today\\s*\\)?\\s*${TOK}`, 'i').exec(flat); if (m) imd.rain_24h = rain(m[1]);
    m = new RegExp(`Relative\\s+Humidity\\s+at\\s+0830\\s*hrs\\s*(?:\\([^)]*\\))?\\s*${TOK}`, 'i').exec(flat); if (m) imd.rh_0830 = num(m[1]);
    m = new RegExp(`Relative\\s+Humidity\\s+at\\s+1730\\s*hrs\\s*(?:\\(\\s*%\\s*\\))?\\s*(?:\\(\\s*${REC})?\\s*${TOK}`, 'i').exec(flat);
    if (m) { imd.rh_1730 = num(m[4]); imd.rh_1730_recorded_on = isoFromDMY(m[1], m[2], m[3]); }
  }
  const clock = (label) => { const x = new RegExp(`${label}\\s*(?:\\(\\s*IST\\s*\\))?\\s*:?\\s*(\\d{1,2}[:.]\\d{2})`, 'i').exec(flat); return x ? hhmm(x[1]) : null; };
  imd.sunset = clock('Sunset'); imd.sunrise_tomorrow = clock('Sunrise'); imd.moonset = clock('Moonset'); imd.moonrise = clock('Moonrise');

  // Forecast: one table row per day (date, min, max, icon, text, icon, warning, humidity twice).
  const dayName = (d, mon) => `${String(d).padStart(2, '0')}-${mon[0].toUpperCase()}${mon.slice(1).toLowerCase()}`;
  for (const cells of rows) {
    if (imd.forecast.length >= 7) break;
    const head = /^(\d{1,2})\s*-\s*([A-Za-z]{3})$/.exec(cells[0] || '');
    if (!head || cells.length < 4 || MON.indexOf(head[2].toLowerCase()) < 0) continue;
    const rest = cells.slice(1).filter(Boolean), tail = [];
    while (rest.length > 2 && tail.length < 2 && (isNum(rest[rest.length - 1]) || isBlankish(rest[rest.length - 1]))) tail.unshift(rest.pop());
    const texts = rest.slice(2).filter((t) => !isNum(t));
    const row = { date: dayName(head[1], head[2]), min_c: num(rest[0]), max_c: num(rest[1]), forecast: texts[0] || '', warning: texts.slice(1).join(', '), rh_0830: num(tail[0]), rh_1730: num(tail[1]) };
    if (row.min_c !== null || row.max_c !== null) imd.forecast.push(row);
  }
  if (imd.forecast.length < 3) {
    imd.forecast = [];
    const re = /(\d{1,2})-([A-Za-z]{3})\s+(\S+)\s+(\S+)\s+(.+?)\s+(\S+)\s+(\S+)(?=\s+\d{1,2}-[A-Za-z]{3}\s|\s+\(|\s*$)/g;
    for (const x of flat.matchAll(re)) {
      if (imd.forecast.length >= 7 || MON.indexOf(x[2].toLowerCase()) < 0) continue;
      const w = /\bNo\s+warning\b/i.exec(x[5]);
      const row = { date: dayName(x[1], x[2]), min_c: num(x[3]), max_c: num(x[4]), forecast: (w ? x[5].slice(0, w.index) : x[5]).trim(), warning: w ? 'No warning' : '', rh_0830: num(x[6]), rh_1730: num(x[7]) };
      if (row.min_c !== null || row.max_c !== null) imd.forecast.push(row);
    }
  }
  return imd;
}

export function validate(imd, st, now = new Date()) {
  const bad = [];
  if (!imd.station || !st.expect.test(imd.station)) bad.push(`station name "${imd.station}"`);
  const d = imd.dated ? Date.parse(imd.dated + 'T00:00:00+05:30') : NaN;
  if (!Number.isFinite(d)) bad.push('no report date');
  else if (Math.abs(now - d) > 3 * 86400000) bad.push(`report dated ${imd.dated}`);
  const okT = (v) => v === null || (v > -15 && v < 60);
  if (!okT(imd.max_c) || !okT(imd.min_c)) bad.push('temperature out of range');
  if (imd.forecast.length < 3) bad.push(`only ${imd.forecast.length} forecast rows`);
  for (const r of imd.forecast) {
    if (!okT(r.min_c) || !okT(r.max_c)) bad.push(`forecast ${r.date} out of range`);
    if (r.min_c !== null && r.max_c !== null && r.min_c > r.max_c) bad.push(`forecast ${r.date} min above max`);
  }
  return bad;
}

async function get(u) {
  let last;
  for (const wait of [0, 4000, 10000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: ctl.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (body.length < 400) throw new Error(`short reply (${body.length} bytes)`);
      return body;
    } catch (e) { last = e; } finally { clearTimeout(timer); }
  }
  const why = last && last.cause ? `${last.message}: ${last.cause.code || last.cause.message}` : String(last && last.message);
  throw new Error(`could not read IMD (${why})`);
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString().replace(/\.\d+Z$/, 'Z');
  let old = null;
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }
  const out = { schema: 1, checkedAt: (old && old.checkedAt) || null, stations: { ...((old && old.stations) || {}) } };
  let ok = 0, changed = false;
  for (const st of STATIONS) {
    try {
      const html = await get(pageUrl(st.id));
      const imd = parseReport(html);
      const bad = validate(imd, st, now);
      if (bad.length) {
        console.log(`::warning::${st.key}: IMD page not understood (${bad.join('; ')})`);
        console.log(`--- ${st.key}: start of the page as text ---\n${htmlToText(html).slice(0, 5000)}\n--- end ---`);
        continue;
      }
      const prev = old && old.stations && old.stations[st.key];
      if (!prev || JSON.stringify(prev.imd) !== JSON.stringify(imd)) changed = true;
      out.stations[st.key] = { stationId: st.id, source: pageUrl(st.id), fetchedAt: nowIso, imd };
      ok += 1;
      console.log(`${st.key}: ${imd.station}, dated ${imd.dated}, max ${imd.max_c}, min ${imd.min_c}, ${imd.forecast.length} forecast days`);
    } catch (e) {
      console.log(`::warning::${st.key}: ${e.message}`);
    }
  }
  if (!ok) { console.log('Nothing read this time. The saved figures stay as they are.'); return; }
  out.checkedAt = nowIso;
  const age = old && old.checkedAt ? now - Date.parse(old.checkedAt) : Infinity;
  if (changed || process.env.FORCE_SAVE === 'true' || !(age < REWRITE_AFTER_MS)) {
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
    console.log(changed ? 'IMD figures changed: saved.' : 'No change at IMD: refreshed the last-checked time.');
  } else console.log('No change at IMD since the last save.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
