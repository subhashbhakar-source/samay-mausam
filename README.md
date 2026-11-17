# Samay aur Mausam

A small web app: clocks for India, Abu Dhabi and China, and India Meteorological Department (IMD) weather for Jaipur and Nagaur.

## How it stays up to date

- `index.html` is the whole app. The clocks run on the viewer's own device clock with fixed offsets: IST is GMT+5:30, Abu Dhabi GMT+4, China GMT+8.
- `.github/workflows/refresh.yml` runs twice an hour. It runs `scripts/fetch-imd.mjs`, which reads IMD's local weather report pages for Jaipur (station 42348) and Nagaur (station 42242) and writes `data/weather.json`.
- The page loads `data/weather.json` and checks it again every 10 minutes while it is open.

Nothing else is needed: no server, no keys, no accounts.

## Sources

- IMD local weather report and forecast: <https://city.imd.gov.in/citywx/city_weather_test_try_warnings.php?id=42348> and `...?id=42242`
- IMD climatological table for Jaipur, 1991 to 2020: <https://city.imd.gov.in/citywx/extreme/climat.php?id=42348>
- Nagaur climate: Central Ground Water Board district report (2013) and the Nagaur district profile on the district court site

## Run the reader by hand

```
node scripts/fetch-imd.mjs
```
