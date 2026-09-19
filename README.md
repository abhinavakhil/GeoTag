# GeoTag

Geo-tags waste, sorts it with free on-device AI, scores every ~500 m block on a waste index, and alerts when an area gets worse.
React + Vite, no backend, no API keys.

```
npm install
npm run dev        # http://localhost:5173  (landing at /, app at /app)
npm test           # core logic tests
npm run build      # static site in dist/ (serve with SPA fallback so /app works)
```

- `src/pages/Landing.jsx`: landing page with the dotted India globe, sorter and index calculator
- `src/pages/MapApp.jsx`: live map, alerts and overview; `src/components/ReportForm.jsx` handles reporting and live scan
- `src/lib/geotag.js`: segregation rules, waste index, EXIF GPS, zero-shot scoring, k-NN (pure, tested)
- `src/lib/vision.js`: the three browser models, lazy-loaded

**AI (free, in the browser):**
- MobileCLIP-S1 zero-shot scores the 8 waste streams (43 MB fp16, cached after the first load).
- COCO-SSD draws a box around each detected item.
- MobileNet classifies the whole scene.
- A k-NN over image embeddings learns from every photo you label.

After editing `AI_PROMPTS`, run `npm run embed` to rebuild `src/data/ai-prompts.json`.

Data lives in `localStorage`, so each browser has its own map. Add a backend if reports need to be shared between devices.
