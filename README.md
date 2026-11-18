# Samay aur Mausam

A small web app: clocks for India, Abu Dhabi and China, a Hindu panchang for Jaipur, and India Meteorological Department (IMD) weather for Jaipur and Nagaur. A second page, `ghar.html`, shows the family at home India's time, the ship's time and the panchang in Hindi.

Open it: <https://subhashbhakar-source.github.io/samay-mausam/>

## How it stays up to date

- `index.html` is the page. The clocks take the time from the web server that hosts the page, not from the phone, and use fixed offsets: IST is GMT+5:30, Abu Dhabi GMT+4, China GMT+8.
- The panchang is worked out in the browser every time the page opens. It needs no feed and no update.
- `.github/workflows/refresh.yml` runs twice an hour. It runs `scripts/fetch-imd.mjs`, which reads IMD's local weather report pages for Jaipur (station 42348) and Nagaur (station 42242) and writes `data/weather.json`.
- The page loads `data/weather.json` and checks it again every 10 minutes while it is open.

Nothing else is needed: no server, no keys, no accounts.

## The panchang

Neither Drik Panchang nor Kalnirnay offers a feed an app may read, so the page calculates the panchang itself, the way they do (drik ganit).

- `js/panchang.js` is the calculation. The tithi is the angle between the Moon and the Sun divided into 12-degree steps. The lunar month is named from the Sun's sidereal sign at the new moons, with the Lahiri ayanamsa (the Government of India standard), and shown the North Indian (purnimanta) way. The day's tithi is the one running at sunrise in Jaipur. Each vrat and festival has a rule for which day it falls on (tithi at sunrise, at midday, in the afternoon, at dusk, at midnight or at moonrise), following the householder (smarta) rules; where Vaishnava temples keep another day, both are given.
- `js/panchang-hi.js` holds the words: month and tithi names in Hindi and in Rajasthani (चैत, बैसाख, जेठ, आसाढ़, सावण, भादवा, आसोज, काती, मिगसर, पोह, माह, फागण; सुदी and बदी), and what each day is and why it is kept. Every day also has one plain line saying what kind of day it is (an अबूझ सावा, a fast, a day for the ancestors), shown under its name in the list. The running seasons (चातुर्मास, मलमास, श्राद्ध पक्ष, होलाष्टक, नवरात्रि, अधिक मास) each have a line on what they mean for the household. The family's own day, kept by tithi, is in `T.apna`; it carries no names because the page is public.
- `js/panchang-ui.js` draws the panel under the India clock, with a symbol for each deity. The season notes begin and end on the worked-out fast and festival days, so they agree with the cards.
- `js/astronomy.browser.min.js` is [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 by Don Cross (MIT licence, notice inside the file). It gives the positions of the Sun and Moon.

To check the calculation against published dates:

```
node scripts/check-panchang.cjs
```

It compares 462 dates and times: Ekadashi tithi times and fast days for 2026 and 2027, Pradosh days for 2027, festival days from 2018 to 2033 for New Delhi, and Drik Panchang's 2027 list for one far-away city. All but one agree; that one sits four minutes from its boundary. Tithi times agree with the Swiss Ephemeris to within a few seconds and come out about a minute later than the times Drik Panchang prints.

## The family's page

`ghar.html` is a second page for the family at home, in Hindi and set larger for older eyes: India's time and the ship's time side by side, then today's panchang. At the end it gives the weather for Jaipur and Nagaur in a few plain lines: today, tomorrow, rain, sunrise, sunset and moonrise. Those figures are the same IMD ones the main page shows, read from `data/weather.json`; IMD's English forecast phrases are turned into Hindi piece by piece, and a phrase the page does not know is shown as IMD wrote it. It uses the same panchang files as the main page; the panel's styles are shared in `css/panchang.css`.

The ship's time is the time on one phone, whose clock is set by hand. The main page knows how far that clock is from India's time, because it takes the true time from the network. Each time it is open with internet on, it leaves that one number where the family's page can read it (`js/ghadi.js`):

- The note is two numbers: `o`, minutes ahead of India (negative when behind), and `t`, when it was sent. No name and no place.
- It is kept in a Firebase Realtime Database that belongs to the owner of this app. A static page on GitHub Pages cannot store anything itself.
- The note sits under a 24-character random key made on the sending phone. The key travels only in the link (`ghar.html#k=...`), which is sent by hand, and is remembered by each phone. It is not in this repository.
- The family's page keeps the last note it read, so the ship's clock goes on running when either phone is offline, and it says when the note was last received.

The database address in `js/ghadi.js` is not a secret. The database's rules are the lock:

```json
{
  "rules": {
    "ghadi": {
      "$key": {
        ".read": "$key.length >= 20",
        ".write": "$key.length >= 20",
        ".validate": "newData.hasChildren(['o','t']) && newData.child('o').isNumber() && newData.child('o').val() >= -900 && newData.child('o').val() <= 900 && newData.child('t').isNumber()"
      }
    }
  }
}
```

## Without internet

Both pages open without internet once they have been opened with internet after this was added.

- `sw.js`, a service worker, keeps a copy of the app's own files (pages, scripts, styles, icons) and of the Google fonts. The app's files come from the network whenever it answers, and the copy is refreshed each time. Without internet, or when the network has not answered in 6 seconds, the kept copy is used, and for the next 30 seconds kept copies are used at once.
- It leaves alone, as before: the time checks (HEAD requests to this site), the weather file (each page keeps its own copy and says how old it is), the ship-time database, and every other site.
- This site is shared with the owner's other apps, each in its own folder. The worker answers only for this app's folder, and only creates or removes caches whose names start with `samay-mausam-`.
- `js/net.js` registers the worker and shows "No Internet!" at the top right while this site can't be reached, or while a page is showing a kept copy. It checks with a small HEAD request on opening, when the phone says it is back online, when the page comes back to the front, and every two minutes while open (every 30 seconds while the badge shows).

Without internet the main page's clocks use the last difference found between the phone's clock and network time (kept on the phone as `sm.clock`), and the note under the India clock says when that check was made. That stays right as long as the phone's clock has not been changed since; a phone that has never checked online falls back to its own clock, with a warning. The family's page keeps running the ship's time from the last note it received.

## Sources

- IMD local weather report and forecast: <https://city.imd.gov.in/citywx/city_weather_test_try_warnings.php?id=42348> and `...?id=42242`
- IMD climatological table for Jaipur, 1991 to 2020: <https://city.imd.gov.in/citywx/extreme/climat.php?id=42348>
- Nagaur climate: Central Ground Water Board district report (2013) and the Nagaur district profile on the district court site

## Run the weather reader by hand

```
node scripts/fetch-imd.mjs
```
