# GeoTag

**Every pile of waste, on the map.**

GeoTag is an AI-first waste mapping app. Snap a photo of a dump and free, on-device AI sorts it into one of 8 waste streams, names the right bin, pins the location, and scores every ~500 m block on a live waste index. When a block gets worse, you get an alert so cleanup crews reach the worst places first.

No backend. No API keys. No photos uploaded. Everything runs in the browser.

🏆 GeoTag started as a hackathon project by team **sudoNinjas** at **hackpcbt (February 2020)**, where it won a category prize. See the original submission on [Devfolio](https://devfolio.co/projects/geotag-1). This repo is the rebuilt, fully client-side version.

---

## Features

- **Geo-tagging**: location comes from GPS, from the EXIF data inside the photo, or from a pin you drop on the map.
- **AI segregation**: three open models run in your browser and agree on a category. You can always override.
- **Live camera scan**: point the camera at a pile and watch labelled boxes appear in real time. Tap to capture and file the report.
- **Waste index heatmap**: every block gets a 0–100 score from volume × harm × recency. Hazardous waste and large dumps count more.
- **Escalation alerts**: in-app and browser notifications the moment a block turns high or critical. Improvements never trigger alerts.
- **Close the loop**: mark spots as cleaned, watch the index fall, export a CSV for your ward office.
- **Self-learning**: a k-NN over image embeddings learns from every photo you label, so suggestions improve for your local waste.

## The 8 waste streams

| Stream | Bin |
|---|---|
| Biodegradable | Green bin |
| Plastic | Blue bin (dry) |
| Paper & Cardboard | Blue bin (dry) |
| Glass | Glass bank |
| Metal | Blue bin (dry) |
| E-waste | E-waste drop-off |
| Hazardous | Red bin / special collection |
| Non-biodegradable | Black bin (reject) |

Mixed piles are flagged so they can be separated before disposal.

## How the AI works

| Model | Job | Size |
|---|---|---|
| MobileCLIP-S1 (Transformers.js) | Zero-shot scoring of the whole scene against the 8 streams | 43 MB fp16, cached after first load |
| COCO-SSD (TensorFlow.js) | Draws a box around each detected item | ~6 MB |
| MobileNet (TensorFlow.js) | Classifies the overall scene and produces embeddings | ~4 MB |
| k-NN memory | Learns from the photos you label, stored locally | 0 |

All signals are combined by a small decision function in `src/lib/geotag.js`. Text you type in the note field is also used for sorting.

## Waste index

```
index(block) = Σ over open reports  volume × harm × recency
```

- **volume**: small / medium / large
- **harm**: hazardous and e-waste weigh most, biodegradable least
- **recency**: weight halves every 7 days

Scores are clamped to 0–100 per ~500 m grid cell. Levels: low, moderate, high (alert), critical (alert).

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173  (landing at /, app at /app)
npm test           # core logic tests
npm run build      # static site in dist/ (serve with SPA fallback so /app works)
```

Open the app, tap **Demo data** to see sample reports around the map centre, or tag your first pile.

## Project layout

```
src/
  pages/Landing.jsx        landing page: globe, sorter, index calculator
  pages/MapApp.jsx         live map, tabbed sidebar (Report / Alerts / Overview)
  components/ReportForm.jsx  photo upload, live scan, category and location
  components/WasteMap.jsx  Leaflet map, heat cells, pins
  components/Globe.jsx     dotted globe with an illustrative report feed
  lib/geotag.js            segregation rules, waste index, EXIF GPS, k-NN (pure, tested)
  lib/vision.js            the three browser models, lazy-loaded
  lib/storage.js           localStorage helpers
  data/ai-prompts.json     pre-embedded text prompts for zero-shot scoring
tools/embed-prompts.mjs    regenerates ai-prompts.json after editing AI_PROMPTS
```

After editing `AI_PROMPTS`, run `npm run embed` to rebuild `src/data/ai-prompts.json`.

## Tech stack

React 19, Vite, React Router, Leaflet, TensorFlow.js, Transformers.js. Map tiles © OpenStreetMap contributors.

## Data and privacy

Photos are analysed and stored on your device. Reports live in `localStorage`, so each browser has its own map. Add a backend if reports need to be shared between devices.

## Origins

The 2020 hackathon version was built with Node.js, AngularJS, MongoDB, Android Studio, TensorFlow, Google Maps API and Azure Custom Vision, with image recognition used to verify cleanups. This rebuild keeps the idea and moves all of the AI into the browser so it costs nothing to run.

Team sudoNinjas: Aman Kumar Soni, Shubham Patel, Abhinav Akhil, Abhishek Kumar, Kommi Narasimha Naidu.
