// GeoTag core logic: waste segregation, waste index, EXIF GPS, zero-shot scoring, k-NN. Pure functions, tested in geotag.test.js.
export const CATEGORIES = {
  biodegradable: { label: 'Biodegradable', bin: 'Green bin', color: '#3f9b4f', severity: 0.8,
    tip: 'Compost it. Keep it free of plastic and foil.',
    keywords: ['food', 'leftover', 'peel', 'fruit', 'vegetable', 'banana', 'orange', 'lemon', 'apple', 'granny smith', 'fig', 'pineapple', 'strawberry', 'mango', 'coconut', 'mushroom', 'broccoli', 'cauliflower', 'cabbage', 'cucumber', 'zucchini', 'corn', 'acorn', 'leaf', 'leaves', 'grass', 'garden', 'flower', 'daisy', 'hay', 'wood', 'twig', 'branch', 'compost', 'bread', 'french loaf', 'bagel', 'pretzel', 'pizza', 'burrito', 'hotdog', 'cheeseburger', 'meat', 'egg', 'eggshell', 'rice', 'tea', 'tea bag', 'coffee', 'coffee grounds', 'espresso', 'organic', 'manure', 'bone', 'husk', 'carrot', 'sandwich', 'donut', 'cake', 'plant', 'potted plant', 'hot dog'] },
  plastic: { label: 'Plastic', bin: 'Blue bin (dry)', color: '#2f7fd8', severity: 1.5,
    tip: 'Rinse, flatten and send to recycling. Bags go to a collection point.',
    keywords: ['plastic', 'bottle', 'water bottle', 'pop bottle', 'water jug', 'pet', 'pvc', 'polythene', 'polybag', 'bag', 'plastic bag', 'packet', 'straw', 'cup', 'container', 'tupperware', 'bucket', 'lid', 'toothbrush', 'shower cap', 'soap dispenser', 'cling film', 'sachet', 'bowl', 'fork', 'spoon', 'cutlery'] },
  paper: { label: 'Paper & Cardboard', bin: 'Blue bin (dry)', color: '#b98a3e', severity: 1,
    tip: 'Keep it dry and clean. Flatten boxes.',
    keywords: ['paper', 'cardboard', 'carton', 'box', 'envelope', 'newspaper', 'magazine', 'book', 'comic book', 'menu', 'paper towel', 'toilet tissue', 'tissue', 'paper cup', 'paper plate', 'receipt', 'crate'] },
  glass: { label: 'Glass', bin: 'Glass bank', color: '#27a3a3', severity: 1.2,
    tip: 'Separate by colour if you can. Wrap broken glass before binning.',
    keywords: ['glass', 'beer bottle', 'wine bottle', 'beer glass', 'goblet', 'wine glass', 'jar', 'vase', 'mirror', 'windowpane'] },
  metal: { label: 'Metal', bin: 'Blue bin (dry)', color: '#7b8794', severity: 1,
    tip: 'Crush cans. Scrap metal dealers will often buy it.',
    keywords: ['metal', 'can', 'tin', 'tin can', 'beer can', 'soda can', 'aluminium', 'aluminum', 'foil', 'steel', 'iron', 'scrap', 'nail', 'screw', 'wire', 'scissors', 'knife', 'frying pan', 'wok', 'caldron', 'padlock', 'chain'] },
  ewaste: { label: 'E-waste', bin: 'E-waste drop-off', color: '#8a4fd8', severity: 2,
    tip: 'Take it to an authorised e-waste recycler. Never burn it.',
    keywords: ['e-waste', 'electronic', 'phone', 'cellular telephone', 'mobile', 'laptop', 'notebook computer', 'computer', 'desktop computer', 'hand-held computer', 'keyboard', 'computer keyboard', 'mouse', 'computer mouse', 'monitor', 'screen', 'television', 'tv', 'remote control', 'charger', 'cable', 'hard disc', 'printer', 'modem', 'router', 'calculator', 'ipod', 'joystick', 'circuit', 'digital watch', 'cell phone', 'remote', 'hair drier', 'hair dryer'] },
  hazardous: { label: 'Hazardous', bin: 'Red bin / special collection', color: '#d8433a', severity: 3,
    tip: 'Keep it apart from everything else and use a hazardous-waste collection point.',
    keywords: ['hazardous', 'battery', 'batteries', 'medicine', 'pill', 'pill bottle', 'syringe', 'needle', 'chemical', 'paint', 'pesticide', 'bleach', 'acid', 'oil', 'motor oil', 'aerosol', 'spray', 'lighter', 'bulb', 'cfl', 'tube light', 'thermometer', 'asbestos', 'mask', 'glove', 'bandage', 'medical'] },
  nonbiodegradable: { label: 'Non-biodegradable', bin: 'Black bin (reject)', color: '#3b3f46', severity: 1.5,
    tip: 'Goes to landfill. Cut down on these where you can.',
    keywords: ['non-biodegradable', 'styrofoam', 'thermocol', 'polystyrene', 'diaper', 'sanitary', 'pad', 'wrapper', 'chip packet', 'chips packet', 'multilayer', 'rubber', 'tyre', 'tire', 'shoe', 'running shoe', 'sandal', 'sock', 'cloth', 'textile', 'ceramic', 'cigarette', 'cigarette butt', 'rope', 'sponge', 'balloon', 'handbag', 'backpack', 'suitcase', 'umbrella', 'teddy bear', 'toy'] },
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RULES = Object.entries(CATEGORIES).flatMap(([cat, c]) =>
  c.keywords.map((kw) => ({ cat, kw, re: new RegExp(`\\b${esc(kw)}(e?s)?\\b`, 'i') })));

// Longest matching keyword wins ("beer bottle" beats "bottle", "tea bag" beats "bag").
// ponytail: keyword heuristic; swap for a trained waste model if accuracy matters.
export function classifyText(text) {
  let best = null;
  for (const r of RULES) if (r.re.test(text || '') && (!best || r.kw.length > best.kw.length)) best = r;
  return best ? { category: best.cat, keyword: best.kw } : null;
}

// predictions: [{className, probability}] from MobileNet, best first. Ignores low-confidence noise.
export function classifyPredictions(predictions, minProb = 0.1) {
  for (const p of predictions || []) {
    if (p.probability < minProb) continue;
    // Primary name first ("book jacket"), synonyms only as fallback ("…, dust wrapper").
    const hit = classifyText(p.className.split(',')[0]) || classifyText(p.className);
    if (hit) return { ...hit, label: p.className.split(',')[0], confidence: p.probability };
  }
  return null;
}

// dets: COCO-SSD output [{class, score, bbox:[x,y,w,h]}]. Dominant category = biggest score*area.
export function summarizeDetections(dets) {
  const items = [], weightBy = {};
  for (const d of dets || []) {
    const hit = classifyText(d.class);
    if (!hit) continue;
    items.push({ label: d.class, category: hit.category, score: d.score, bbox: d.bbox });
    weightBy[hit.category] = (weightBy[hit.category] || 0) + d.score * d.bbox[2] * d.bbox[3];
  }
  const cats = Object.keys(weightBy).sort((a, b) => weightBy[b] - weightBy[a]);
  return { items, category: cats[0] || null, categories: cats, mixed: cats.length > 1 };
}

// Zero-shot prompts for CLIP. Several phrasings per stream; their probabilities are averaged.
export const AI_PROMPTS = {
  plastic: ['plastic bottles and plastic bags', 'a pile of plastic waste', 'plastic packaging litter'],
  biodegradable: ['food waste and fruit peels', 'organic garden waste like leaves and branches', 'rotting vegetables and food scraps'],
  paper: ['cardboard boxes and paper waste', 'stacks of old newspapers and paper'],
  glass: ['glass bottles and broken glass', 'empty glass jars and wine bottles'],
  metal: ['metal cans and scrap metal', 'crushed aluminium drink cans', 'rusty iron scrap'],
  ewaste: ['electronic waste like old phones, cables and circuit boards', 'discarded computers and monitors', 'a pile of old electronic devices and computer parts'],
  hazardous: ['used batteries', 'medical waste like syringes and medicine', 'chemical drums and paint containers'],
  nonbiodegradable: ['mixed garbage with styrofoam, rubber and wrappers', 'a landfill of mixed trash', 'old tyres and rubber waste'],
  none: ['a clean street with no garbage', 'a person or an animal'],
};
export const AI_LABELS = Object.values(AI_PROMPTS).flat();

// out: [{label, score}] from a zero-shot pipeline over AI_LABELS.
export function aggregateZeroShot(out) {
  const scores = {};
  for (const { label, score } of out || []) {
    const cat = Object.keys(AI_PROMPTS).find((k) => AI_PROMPTS[k].includes(label));
    if (cat) scores[cat] = (scores[cat] || 0) + score / AI_PROMPTS[cat].length; // mean, so more prompts != more weight
  }
  const ranked = Object.entries(scores).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]);
  const noWaste = (scores.none || 0) > (ranked[0] ? ranked[0][1] : 0);
  const wasteTotal = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  return {
    category: ranked.length && !noWaste ? ranked[0][0] : null,
    confidence: ranked.length ? ranked[0][1] / wasteTotal : 0, // share among waste streams
    noWaste,
    top: ranked.slice(0, 3).map(([category, v]) => ({ category, share: v / wasteTotal })),
  };
}

// vec: L2-normalised CLIP image embedding; prompts: ai-prompts.json {labels, embeds}.
export function scoreZeroShot(vec, prompts) {
  const logits = prompts.embeds.map((e) => 100 * e.reduce((s, x, i) => s + x * vec[i], 0));
  const m = Math.max(...logits), ex = logits.map((l) => Math.exp(l - m)), z = ex.reduce((a, b) => a + b, 0);
  return aggregateZeroShot(prompts.labels.map((label, i) => ({ label, score: ex[i] / z })));
}

// Weighted k-nearest-neighbours over image embeddings the user has already labelled.
// examples: [{v: number[]|Float32Array, c: category}]. Returns {category, confidence, k} or null.
// ponytail: linear scan, fine for a few hundred examples; use an ANN index beyond ~10k.
export function knn(examples, vec, k = 5) {
  if (!examples.length) return null;
  const norm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0)) || 1;
  const nv = norm(vec);
  const top = examples.map((e) => {
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * e.v[i];
    return { c: e.c, sim: dot / (nv * norm(e.v)) };
  }).sort((a, b) => b.sim - a.sim).slice(0, k);
  const votes = {};
  for (const t of top) votes[t.c] = (votes[t.c] || 0) + Math.max(0, t.sim);
  const total = Object.values(votes).reduce((s, x) => s + x, 0) || 1;
  const [category, w] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return { category, confidence: w / total, k: top.length, similarity: top[0].sim };
}

// GPS lat/lng from a JPEG's EXIF block, or null. buf: ArrayBuffer.
export function readExifGps(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off), len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return gpsFromTiff(v, off + 10);
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) return null;
      off += 2 + len;
    }
  } catch (e) { /* corrupt or truncated EXIF */ }
  return null;
}
function gpsFromTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
  const tags = (ifd) => {
    const out = {};
    for (let n = u16(ifd), e = ifd + 2; n--; e += 12) out[u16(e)] = e;
    return out;
  };
  const gpsPtr = tags(u32(4))[0x8825];
  if (gpsPtr === undefined) return null;
  const g = tags(u32(gpsPtr + 8));
  if (!(1 in g && 2 in g && 3 in g && 4 in g)) return null;
  const dms = (e) => {
    const o = u32(e + 8), r = (k) => u32(o + k * 8) / (u32(o + k * 8 + 4) || 1);
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  const ref = (e) => String.fromCharCode(v.getUint8(t + e + 8));
  const lat = dms(g[2]) * (ref(g[1]) === 'S' ? -1 : 1);
  const lng = dms(g[4]) * (ref(g[3]) === 'W' ? -1 : 1);
  return lat || lng ? { lat, lng } : null;
}

export const LEVEL_COLOR = { low: '#8fbf6a', moderate: '#e8c53a', high: '#e8863a', critical: '#d8433a' };
export const VOLUME = { small: 1, medium: 3, large: 8 };
const CELL = 0.005; // ~500 m grid
const DAY = 86400000;

export function cellOf(lat, lng) {
  const i = Math.floor(lat / CELL), j = Math.floor(lng / CELL);
  return { key: `${i}:${j}`, bounds: [[i * CELL, j * CELL], [(i + 1) * CELL, (j + 1) * CELL]],
    lat: (i + 0.5) * CELL, lng: (j + 0.5) * CELL };
}

// Recent, big, harmful reports weigh the most. Weight halves every 7 days.
export function weight(r, now) {
  const sev = (CATEGORIES[r.category] || CATEGORIES.nonbiodegradable).severity;
  return (VOLUME[r.volume] || 1) * sev * Math.pow(0.5, Math.max(0, now - r.time) / (7 * DAY));
}

export function level(index) {
  return index >= 70 ? 'critical' : index >= 40 ? 'high' : index >= 15 ? 'moderate' : 'low';
}

// Waste index 0-100 for each grid cell with open (not cleaned) reports, worst first.
export function hotspots(reports, now = Date.now()) {
  const cells = {};
  for (const r of reports) {
    if (r.cleaned) continue;
    const c = cellOf(r.lat, r.lng);
    const h = (cells[c.key] ||= { ...c, score: 0, count: 0, cats: {} });
    h.score += weight(r, now);
    h.count++;
    h.cats[r.category] = (h.cats[r.category] || 0) + 1;
  }
  return Object.values(cells).map((h) => {
    const index = Math.min(100, Math.round(h.score * 5));
    const top = Object.entries(h.cats).sort((a, b) => b[1] - a[1])[0][0];
    return { ...h, index, level: level(index), top };
  }).sort((a, b) => b.index - a.index);
}

// Picks one category from every signal. Your own past labels win, then the AI, then detected objects,
// then the ImageNet scene, then the typed description.
export function decideCategory({ learned, learnedMinSim = 0.6, ai, sum, scene, text }) {
  const trusted = learned && learned.confidence >= 0.6 && learned.similarity >= learnedMinSim ? learned : null;
  const aiOk = ai && !ai.noWaste && ai.confidence >= 0.35 ? ai : null;
  const category = trusted?.category || aiOk?.category || sum?.category || scene?.category || text?.category || null;
  return { category, trusted: !!trusted };
}
