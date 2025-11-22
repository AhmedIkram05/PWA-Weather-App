# PWA Weather App

This is a simple Progressive Web App that fetches current, hourly and daily forecasts using OpenWeather One Call API 3.0.

NOTE: For this classroom/demo version the OpenWeather API key is embedded directly in `app.js`. This is NOT recommended for public repositories. See the notes below.

## Files

- `index.html` — main UI
- `style.css` — basic styles
- `app.js` — client logic (contains inline API key)
- `manifest.json` — PWA manifest
- `service-worker.js` — simple offline caching

## How to run locally

1. Serve the folder with a static HTTP server (service workers require http(s)). Examples:

Python 3:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

## Security note

- The file `app.js` contains the API key in the constant `OWM_KEY` for simplicity. Do NOT commit your real key to a public repo. If you plan to publish this, remove the key and use a serverless proxy or environment variables.

## API usage limits

- This client implements a per-device counter stored in `localStorage` to avoid accidental high usage. It is not a replacement for server-side rate-limiting. Keep your OpenWeather account limits in mind.
