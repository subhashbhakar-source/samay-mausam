// Checks the panchang engine against published dates. No packages needed:  node scripts/check-panchang.cjs
//
// What is compared
//   1. Ekadashi tithi start and end times, 2026 and 2027 (Drik Panchang, New Delhi). Drik's clock times run
//      about a minute ahead of standard ephemeris positions; this engine agrees with the Swiss Ephemeris to
//      within about five seconds, so a gap of 40 to 100 seconds from Drik's printed minute is expected.
//   2. Ekadashi fast days with the second (Vaishnava) day, and Pradosh days (Drik Panchang lists for New Delhi).
//   3. Festival days 2018 to 2033 for New Delhi. Akha Teej, Janmashtami and Holika Dahan are from Drik Panchang
//      pages read on 17 Nov 2026; the rest are the dates widely published for those years.
//   4. Drik Panchang's whole 2027 list for Lancaster, California: the same rules at a far-away place.
//      One entry there (Ahoi Ashtami) sits four minutes from the boundary and is expected to differ.
const P = require('../js/panchang.js');
const IST = 330;
const delhi = P.make({ lat: 28.6139, lon: 77.2090, tzMin: IST });
const md = (E, dn) => { const g = E.ymd(dn); return String(g.m).padStart(2, '0') + '-' + String(g.d).padStart(2, '0'); };
let bad = 0, ok = 0;
const fail = (m) => { bad++; console.log('DIFF ' + m); };

// ---- 1. tithi times
const TIMES = `2026-01-13 15:17|2026-01-14 17:52,2026-01-28 16:35|2026-01-29 13:55,2026-02-12 12:22|2026-02-13 14:25,2026-02-27 00:33|2026-02-27 22:32,2026-03-14 08:10|2026-03-15 09:16,2026-03-28 08:45|2026-03-29 07:46,2026-04-13 01:16|2026-04-14 01:08,2026-04-26 18:06|2026-04-27 18:15,2026-05-12 14:52|2026-05-13 13:29,2026-05-26 05:10|2026-05-27 06:21,2026-06-11 00:57|2026-06-11 22:36,2026-06-24 18:12|2026-06-25 20:09,2026-07-10 08:16|2026-07-11 05:22,2026-07-24 09:12|2026-07-25 11:34,2026-08-08 13:59|2026-08-09 11:04,2026-08-23 02:00|2026-08-24 04:18,2026-09-06 19:29|2026-09-07 17:03,2026-09-21 20:00|2026-09-22 21:43,2026-10-06 02:07|2026-10-07 00:34,2026-10-21 14:11|2026-10-22 14:47,2026-11-04 11:03|2026-11-05 10:35,2026-11-20 07:15|2026-11-21 06:31,2026-12-03 23:03|2026-12-04 23:44,2026-12-19 22:09|2026-12-20 20:14,2027-01-02 14:24|2027-01-03 16:08,2027-01-18 10:26|2027-01-19 07:49,2027-02-01 08:41|2027-02-02 11:10,2027-02-16 20:19|2027-02-17 17:31,2027-03-03 04:44|2027-03-04 07:24,2027-03-18 04:21|2027-03-19 01:51,2027-04-02 00:45|2027-04-03 02:51,2027-04-16 11:21|2027-04-17 09:27,2027-05-01 18:53|2027-05-02 19:51,2027-05-15 18:17|2027-05-16 17:13,2027-05-31 10:02|2027-06-01 09:39,2027-06-14 02:11|2027-06-15 02:07,2027-06-29 22:03|2027-06-30 20:30,2027-07-13 12:08|2027-07-14 13:10,2027-07-29 07:33|2027-07-30 05:12,2027-08-12 00:58|2027-08-13 02:59,2027-08-27 15:25|2027-08-28 12:42,2027-09-10 17:00|2027-09-11 19:35,2027-09-25 22:30|2027-09-26 19:49,2027-10-10 11:40|2027-10-11 14:08,2027-10-25 05:40|2027-10-26 03:22,2027-11-09 07:34|2027-11-10 09:11,2027-11-23 13:44|2027-11-24 12:11,2027-12-09 02:58|2027-12-10 03:19,2027-12-22 23:40|2027-12-23 23:11`
  .split(',').map(l => l.split('|').map(s => Date.parse(s.replace(' ', 'T') + ':00+05:30')));
// fast day, then the second day when Drik lists one
const EK = { 2026: '01-14 01-29 02-13 02-27 03-15 03-29 04-13 04-27 05-13 05-27 06-11 06-25 07-10/07-11 07-25 08-09 08-23 09-07 09-22 10-06 10-22 11-05 11-20/11-21 12-04 12-20',
             2027: '01-03 01-18/01-19 02-02 02-17 03-04 03-18 04-02 04-17 05-02 05-16 06-01 06-14 06-30 07-14 07-29/07-30 08-12 08-28 09-11 09-26 10-11 10-25/10-26 11-10 11-24 12-09 12-23' };
const ek = delhi.events(delhi.dnOf(2026, 1, 1), delhi.dnOf(2027, 12, 31)).filter(e => e.id === 'ekadashi');
if (ek.length !== TIMES.length) fail('ekadashi count ' + ek.length);
ek.forEach((e, i) => {
  for (const [mine, pub] of [[e.start, TIMES[i][0]], [e.end, TIMES[i][1]]]) {
    const gap = (mine - pub) / 1000;
    if (gap < 0 || gap > 150) fail('ekadashi time ' + new Date(pub).toISOString() + ' gap ' + gap.toFixed(0) + ' s'); else ok++;
  }
});
for (const y of [2026, 2027]) {
  const list = EK[y].split(' ');
  ek.filter(e => delhi.ymd(e.dn).y === y).forEach((e, i) => {
    const mine = md(delhi, e.dn) + (e.alt != null ? '/' + md(delhi, e.alt) : '');
    // Drik's 2026 page did not show second days for every entry; compare the fast day always, the second day when given
    const want = list[i];
    if (want.includes('/') ? mine !== want : md(delhi, e.dn) !== want) fail('ekadashi ' + y + ' mine ' + mine + ' published ' + want); else ok++;
  });
}

// ---- 2. Pradosh 2027
const PR = '01-05 01-20 02-03 02-18 03-05 03-20 04-04 04-18 05-03 05-17 06-02 06-16 07-01 07-15 07-31 08-14 08-29 09-13 09-27 10-12 10-27 11-11 11-25 12-11 12-25'.split(' ');
delhi.events(delhi.dnOf(2027, 1, 1), delhi.dnOf(2027, 12, 31)).filter(e => e.id === 'pradosh')
  .forEach((e, i) => { if (md(delhi, e.dn) !== PR[i]) fail('pradosh mine ' + md(delhi, e.dn) + ' published ' + PR[i]); else ok++; });

// ---- 3. festivals, New Delhi
const KNOWN = {
  'akha-teej': { 2021: '05-14', 2022: '05-03', 2023: '04-22', 2024: '05-10', 2025: '04-30', 2026: '04-19', 2027: '05-09', 2028: '04-27', 2029: '05-16', 2030: '05-05', 2031: '04-24', 2032: '05-12', 2033: '05-01' },
  'janmashtami': { 2021: '08-30', 2022: '08-18', 2023: '09-06', 2024: '08-26', 2025: '08-15', 2026: '09-04', 2027: '08-25', 2028: '08-13', 2029: '09-01', 2030: '08-21', 2031: '08-09' },
  'holika-dahan': { 2022: '03-17', 2023: '03-07', 2024: '03-24', 2025: '03-13', 2026: '03-03', 2027: '03-21', 2028: '03-10' },
  'diwali': { 2021: '11-04', 2022: '10-24', 2023: '11-12', 2024: '11-01', 2025: '10-20', 2026: '11-08', 2027: '10-29' },
  'dussehra': { 2021: '10-15', 2022: '10-05', 2023: '10-24', 2024: '10-12', 2025: '10-02', 2026: '10-20', 2027: '10-09' },
  'raksha-bandhan': { 2021: '08-22', 2022: '08-11', 2023: '08-30', 2024: '08-19', 2025: '08-09', 2026: '08-28', 2027: '08-17' },
  'karwa-chauth': { 2021: '10-24', 2022: '10-13', 2023: '11-01', 2024: '10-20', 2025: '10-10', 2026: '10-29', 2027: '10-18' },
  'dhanteras': { 2021: '11-02', 2022: '10-22', 2023: '11-10', 2024: '10-29', 2025: '10-18', 2026: '11-06', 2027: '10-27' },
  'bhai-dooj': { 2021: '11-06', 2022: '10-26', 2023: '11-15', 2024: '11-03', 2025: '10-23', 2026: '11-11', 2027: '10-31' },
  'govardhan': { 2021: '11-05', 2022: '10-26', 2023: '11-14', 2024: '11-02', 2025: '10-22', 2026: '11-10', 2027: '10-30' },
  'maha-shivratri': { 2021: '03-11', 2022: '03-01', 2023: '02-18', 2024: '03-08', 2025: '02-26', 2026: '02-15', 2027: '03-06' },
  'ganesh-chaturthi': { 2021: '09-10', 2022: '08-31', 2023: '09-19', 2024: '09-07', 2025: '08-27', 2026: '09-14', 2027: '09-04' },
  'ram-navami': { 2021: '04-21', 2022: '04-10', 2023: '03-30', 2024: '04-17', 2025: '04-06', 2026: '03-26', 2027: '04-15' },
  'basant-panchami': { 2021: '02-16', 2022: '02-05', 2023: '01-26', 2024: '02-14', 2025: '02-02', 2026: '01-23', 2027: '02-11' },
  'dhulandi': { 2021: '03-29', 2022: '03-18', 2023: '03-08', 2024: '03-25', 2025: '03-14', 2026: '03-04', 2027: '03-22' },
  'hariyali-teej': { 2018: '08-13', 2019: '08-03', 2020: '07-23', 2021: '08-11', 2022: '07-31', 2023: '08-19', 2024: '08-07', 2025: '07-27', 2026: '08-15', 2027: '08-04' },
  'hartalika-teej': { 2021: '09-09', 2022: '08-30', 2023: '09-18', 2024: '09-06', 2025: '08-26', 2026: '09-14', 2027: '09-03' },
  'kajari-teej': { 2022: '08-14', 2023: '09-02', 2024: '08-22', 2025: '08-12', 2026: '08-31', 2027: '08-20' },
  'gangaur': { 2022: '04-04', 2023: '03-24', 2024: '04-11', 2025: '03-31', 2026: '03-21', 2027: '04-09' },
  'guru-purnima': { 2021: '07-24', 2022: '07-13', 2023: '07-03', 2024: '07-21', 2025: '07-10', 2026: '07-29', 2027: '07-18' },
  'sharad-purnima': { 2022: '10-09', 2023: '10-28', 2024: '10-16', 2025: '10-06', 2026: '10-25', 2027: '10-14' },
  'hanuman-janmotsav': { 2021: '04-27', 2022: '04-16', 2023: '04-06', 2024: '04-23', 2025: '04-12', 2026: '04-02', 2027: '04-20' },
  'navratri': { 2021: '10-07', 2022: '09-26', 2023: '10-15', 2024: '10-03', 2025: '09-22', 2026: '10-11', 2027: '09-30' },
  'nav-samvat': { 2021: '04-13', 2022: '04-02', 2023: '03-22', 2024: '04-09', 2025: '03-30', 2026: '03-19', 2027: '04-07' },
  'durga-ashtami': { 2021: '10-13', 2022: '10-03', 2023: '10-22', 2024: '10-11', 2025: '09-30', 2026: '10-19', 2027: '10-07' },
  'maha-navami': { 2023: '10-23', 2024: '10-11', 2025: '10-01', 2026: '10-19' },
  'nag-panchami': { 2021: '08-13', 2022: '08-02', 2023: '08-21', 2024: '08-09', 2025: '07-29', 2026: '08-17', 2027: '08-06' },
  'makar-sankranti': { 2021: '01-14', 2022: '01-14', 2023: '01-15', 2024: '01-15', 2025: '01-14', 2026: '01-14', 2027: '01-15', 2028: '01-15' },
  'sheetala-ashtami': { 2023: '03-15', 2024: '04-02', 2025: '03-22', 2026: '03-11', 2027: '03-30' },
  'ganga-dussehra': { 2026: '05-25' }
};
const byYear = {};
for (let y = 2018; y <= 2033; y++) { byYear[y] = {}; for (const e of delhi.events(delhi.dnOf(y, 1, 1), delhi.dnOf(y, 12, 31))) if (!byYear[y][e.id]) byYear[y][e.id] = e; }
for (const id of Object.keys(KNOWN)) for (const y of Object.keys(KNOWN[id])) {
  const e = byYear[y][id], m = e ? md(delhi, e.dn) : 'none';
  if (m !== KNOWN[id][y]) fail(id + ' ' + y + ' mine ' + m + ' published ' + KNOWN[id][y]); else ok++;
}

// ---- 4. Drik Panchang's 2027 list for Lancaster, California
const L = P.make({ lat: 34.6868, lon: -118.1542, tzMin: -480 });
const LAN = { 'makar-sankranti': '01-14', 'til-chauth': '01-24', 'mauni-amavas': '02-05', 'basant-panchami': '02-11', 'surya-saptami': '02-13', 'maha-shivratri': '03-05', 'holika-dahan': '03-21', 'dhulandi': '03-22', 'sheetala-ashtami': '03-29', 'nav-samvat': '04-07', 'gangaur': '04-09', 'ram-navami': '04-14', 'hanuman-janmotsav': '04-20', 'akha-teej': '05-08', 'buddha-purnima': '05-19', 'vat-savitri': '06-04', 'ganga-dussehra': '06-13', 'rath-yatra': '07-05', 'guru-purnima': '07-18', 'hariyali-teej': '08-04', 'nag-panchami': '08-06', 'raksha-bandhan': '08-16', 'kajari-teej': '08-19', 'janmashtami': '08-24', 'hartalika-teej': '09-02', 'ganesh-chaturthi': '09-03', 'anant-chaturdashi': '09-14', 'shraddh-start': '09-16', 'sarvapitru-amavas': '09-29', 'navratri': '09-30', 'durga-ashtami': '10-07', 'maha-navami': '10-08', 'dussehra': '10-09', 'sharad-purnima': '10-14', 'karwa-chauth': '10-18', 'ahoi-ashtami': '10-21', 'dhanteras': '10-26', 'roop-chaudas': '10-28', 'diwali': '10-28', 'govardhan': '10-29', 'bhai-dooj': '10-30', 'tulsi-vivah': '11-10', 'kartik-purnima': '11-13' };
const LAN_EK = '01-02 01-18 02-01 02-16 03-03 03-18 04-02 04-16 05-02 05-15 05-31 06-14 06-30 07-13 07-29 08-12 08-27 09-11 09-25 10-10 10-25 11-09 11-23 12-09 12-23'.split(' ');
const LAN_PU = '01-21 02-20 03-21 04-20 05-19 06-18 07-18 08-16 09-15 10-14 11-13 12-13'.split(' ');
const le = L.events(L.dnOf(2027, 1, 1), L.dnOf(2027, 12, 31));
let edge = 0;
for (const e of le) if (LAN[e.id]) {
  if (md(L, e.dn) === LAN[e.id]) ok++;
  else if (e.id === 'ahoi-ashtami') { edge++; console.log('known edge: Lancaster ahoi-ashtami mine ' + md(L, e.dn) + ' published ' + LAN[e.id] + ' (Ashtami begins 4 minutes after moonrise)'); }
  else fail('Lancaster ' + e.id + ' mine ' + md(L, e.dn) + ' published ' + LAN[e.id]);
}
le.filter(e => e.id === 'ekadashi').forEach((e, i) => { if (md(L, e.dn) !== LAN_EK[i]) fail('Lancaster ekadashi ' + md(L, e.dn) + ' ' + LAN_EK[i]); else ok++; });
le.filter(e => e.id === 'purnima').forEach((e, i) => { if (md(L, e.dn) !== LAN_PU[i]) fail('Lancaster purnima ' + md(L, e.dn) + ' ' + LAN_PU[i]); else ok++; });

console.log('agree ' + ok + ', known edge ' + edge + ', differ ' + bad);
process.exit(bad ? 1 : 0);
