# Samay aur Mausam

A small web app: clocks for India, Abu Dhabi and China, a Hindu panchang for Jaipur, and India Meteorological Department (IMD) weather for Jaipur and Nagaur.

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
- `js/panchang-hi.js` holds the words: month and tithi names in Hindi and in Rajasthani (चैत, बैसाख, जेठ, आसाढ़, सावण, भादवा, आसोज, काती, मिगसर, पोह, माह, फागण; सुदी and बदी), and what each day is and why it is kept.
- `js/panchang-ui.js` draws the panel under the India clock, with a symbol for each deity.
- `js/astronomy.browser.min.js` is [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 by Don Cross (MIT licence, notice inside the file). It gives the positions of the Sun and Moon.

To check the calculation against published dates:

```
node scripts/check-panchang.cjs
```

It compares 462 dates and times: Ekadashi tithi times and fast days for 2026 and 2027, Pradosh days for 2027, festival days from 2018 to 2033 for New Delhi, and Drik Panchang's 2027 list for one far-away city. All but one agree; that one sits four minutes from its boundary. Tithi times agree with the Swiss Ephemeris to within a few seconds and come out about a minute later than the times Drik Panchang prints.

## Sources

- IMD local weather report and forecast: <https://city.imd.gov.in/citywx/city_weather_test_try_warnings.php?id=42348> and `...?id=42242`
- IMD climatological table for Jaipur, 1991 to 2020: <https://city.imd.gov.in/citywx/extreme/climat.php?id=42348>
- Nagaur climate: Central Ground Water Board district report (2013) and the Nagaur district profile on the district court site

## Run the weather reader by hand

```
node scripts/fetch-imd.mjs
```
