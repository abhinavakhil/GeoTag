// Run: npm test
import assert from 'assert';
import { createRequire } from 'module';
import * as G from './geotag.js';
import * as O from './ops.js';
const require = createRequire(import.meta.url);

const cat = (t) => (G.classifyText(t) || {}).category;
assert.equal(cat('empty plastic bottles'), 'plastic');
assert.equal(cat('broken beer bottle'), 'glass');
assert.equal(cat('banana peels and leftover food'), 'biodegradable');
assert.equal(cat('used tea bag'), 'biodegradable');
assert.equal(cat('chip packet'), 'nonbiodegradable');
assert.equal(cat('paper cup'), 'paper');
assert.equal(cat('old laptop and charger'), 'ewaste');
assert.equal(cat('dead AA batteries'), 'hazardous');
assert.equal(cat('soda cans'), 'metal');
assert.equal(cat('candle'), undefined); // "can" must not match inside words
assert.equal(G.classifyText('xyz'), null);

const p = G.classifyPredictions([
  { className: 'jigsaw puzzle', probability: 0.5 },
  { className: 'notebook, notebook computer', probability: 0.3 },
]);
assert.equal(p.category, 'ewaste');
assert.equal(p.label, 'notebook');

const now = Date.now();
const r = (o) => ({ lat: 28.6139, lng: 77.209, category: 'plastic', volume: 'medium', time: now, ...o });
assert.equal(G.hotspots([]).length, 0);
assert.equal(G.hotspots([r()])[0].level, 'moderate'); // 3*1.5*5 = 22.5
assert.equal(G.hotspots([r(), r()])[0].level, 'high');
assert.equal(G.hotspots([r({ volume: 'large' }), r({ volume: 'large' })])[0].index, 100);
assert.equal(G.hotspots([r({ cleaned: true })]).length, 0);
assert.ok(G.hotspots([r({ time: now - 14 * 86400000 })])[0].index < G.hotspots([r()])[0].index); // decay
const hs = G.hotspots([r(), r({ lat: 28.7, volume: 'large', category: 'hazardous' })]);
assert.equal(hs.length, 2);
assert.equal(hs[0].top, 'hazardous'); // worst first

assert.equal(G.classifyPredictions([{ className: 'book jacket, dust cover, dust jacket, dust wrapper', probability: 0.3 }]).category, 'paper');

// CLIP zero-shot aggregation
const zs = G.aggregateZeroShot([
  { label: 'plastic bottles and plastic bags', score: 0.4 }, { label: 'a pile of plastic waste', score: 0.2 },
  { label: 'food waste and fruit peels', score: 0.3 }, { label: 'a clean street with no garbage', score: 0.1 },
]);
assert.equal(zs.category, 'plastic');
assert.ok(Math.abs(zs.confidence - 0.6 / 0.9) < 1e-9);
assert.equal(zs.top[1].category, 'biodegradable');
assert.ok(!zs.noWaste);
const clean = G.aggregateZeroShot([{ label: 'a clean street with no garbage', score: 0.7 }, { label: 'a pile of plastic waste', score: 0.3 }]);
assert.ok(clean.noWaste && clean.category === null);
assert.ok(G.AI_LABELS.length >= 10);
const P = require('../data/ai-prompts.json');
assert.deepEqual(P.labels, G.AI_LABELS, 'ai-prompts.json is stale: run tools/embed-prompts.mjs');
const glassPrompt = P.embeds[P.labels.indexOf('glass bottles and broken glass')];
assert.equal(G.scoreZeroShot(glassPrompt, P).category, 'glass'); // a prompt's own embedding scores as its stream

// low-confidence scene predictions are ignored
assert.equal(G.classifyPredictions([{ className: 'Weimaraner', probability: 0.16 }, { className: 'water bottle', probability: 0.04 }]), null);

// k-NN over embeddings
const ex = [{ v: [1, 0, 0], c: 'plastic' }, { v: [0.9, 0.1, 0], c: 'plastic' }, { v: [0, 1, 0], c: 'glass' }, { v: [0, 0.9, 0.2], c: 'glass' }];
assert.equal(G.knn(ex, [0.95, 0.05, 0], 3).category, 'plastic');
assert.equal(G.knn(ex, [0.1, 1, 0], 3).category, 'glass');
assert.ok(G.knn(ex, [1, 0, 0], 2).confidence > 0.99);
assert.equal(G.knn([], [1]), null);

// COCO-SSD detections -> dominant category
const s = G.summarizeDetections([
  { class: 'bottle', score: 0.9, bbox: [0, 0, 100, 200] },
  { class: 'banana', score: 0.8, bbox: [0, 0, 50, 50] },
  { class: 'person', score: 0.99, bbox: [0, 0, 300, 600] }, // not waste, ignored
]);
assert.equal(s.category, 'plastic');
assert.equal(s.items.length, 2);
assert.ok(s.mixed);
assert.equal(G.summarizeDetections([]).category, null);

// Minimal little-endian JPEG+EXIF with GPS 28°36'50" N, 77°12'32.4" E
function jpegWithGps() {
  const b = Buffer.alloc(200); let o = 0;
  const w16 = (x) => { b.writeUInt16LE(x, o); o += 2; }, w32 = (x) => { b.writeUInt32LE(x, o); o += 4; };
  b.writeUInt16BE(0xFFD8, 0); b.writeUInt16BE(0xFFE1, 2); b.writeUInt16BE(190, 4); b.write('Exif\0\0', 6, 'latin1');
  const T = 12; o = T;
  b.write('II', o, 'latin1'); o += 2; w16(42); w32(8);
  w16(1); w16(0x8825); w16(4); w32(1); w32(26); w32(0);   // IFD0 @8: one entry -> GPS IFD @26
  w16(4);                                                  // GPS IFD @26: four entries
  w16(1); w16(2); w32(2); b.write('N', o, 'latin1'); o += 4;
  w16(2); w16(5); w32(3); w32(80);
  w16(3); w16(2); w32(2); b.write('E', o, 'latin1'); o += 4;
  w16(4); w16(5); w32(3); w32(104);
  w32(0);
  o = T + 80; [28, 1, 36, 1, 50, 1, 77, 1, 12, 1, 324, 10].forEach(w32);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}
const gps = G.readExifGps(jpegWithGps());
assert.ok(Math.abs(gps.lat - 28.61389) < 1e-4 && Math.abs(gps.lng - 77.209) < 1e-4, JSON.stringify(gps));
assert.equal(G.readExifGps(new ArrayBuffer(10)), null);

// category decision priority
const d = (o) => G.decideCategory(o).category;
assert.equal(d({}), null);
assert.equal(d({ text: { category: 'paper' }, scene: { category: 'glass' } }), 'glass');
assert.equal(d({ sum: { category: 'metal' }, ai: { category: 'plastic', confidence: 0.8 } }), 'plastic');
assert.equal(d({ sum: { category: 'metal' }, ai: { category: 'plastic', confidence: 0.2 } }), 'metal'); // unsure AI loses
assert.equal(d({ ai: { category: 'plastic', confidence: 0.9, noWaste: true } }), null);
assert.equal(d({ learned: { category: 'hazardous', confidence: 0.9, similarity: 0.9 }, ai: { category: 'plastic', confidence: 0.9 } }), 'hazardous');
assert.equal(d({ learned: { category: 'hazardous', confidence: 0.9, similarity: 0.7 }, learnedMinSim: 0.75, ai: { category: 'plastic', confidence: 0.9 } }), 'plastic');

// ops: duplicates, wards, trends, impact, tickets, report
const base = { lat: 28.6139, lng: 77.209, category: 'plastic', volume: 'medium', time: now };
assert.ok(O.findDuplicate([base], { ...base, lat: 28.614 })); // ~11 m
assert.equal(O.findDuplicate([base], { ...base, lat: 28.62 }), null); // ~680 m
assert.equal(O.findDuplicate([base], { ...base, category: 'glass' }), null);
assert.equal(O.findDuplicate([{ ...base, cleaned: true }], base), null);
const sq = { type: 'Polygon', coordinates: [[[77.2, 28.6], [77.22, 28.6], [77.22, 28.62], [77.2, 28.62], [77.2, 28.6]]] };
assert.ok(O.pointInPolygon(28.61, 77.21, sq));
assert.ok(!O.pointInPolygon(28.63, 77.21, sq));
const wards = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Ward 1' }, geometry: sq }] };
assert.equal(O.wardOf(28.61, 77.21, wards), 'Ward 1');
assert.equal(O.wardOf(28.7, 77.21, wards), null);
const D = 86400000;
const rec = O.recurringCells([{ ...base, cleaned: true, cleanedAt: now - 5 * D, time: now - 6 * D },
  { ...base, cleaned: true, cleanedAt: now - 3 * D, time: now - 4 * D }, { ...base, time: now - D }]);
assert.ok(rec.has(G.cellOf(base.lat, base.lng).key));
assert.equal(O.recurringCells([base]).size, 0);
const hist = O.snapshot({}, G.hotspots([{ ...base, time: now - 8 * D }], now - 8 * D), now - 8 * D);
assert.equal(O.indexAgo(hist, G.cellOf(base.lat, base.lng).key, 7, now), 23);
assert.equal(O.indexAgo({}, 'x', 7, now), null);
const im = O.impact([base, { ...base, cleaned: true, cleanedAt: now, time: now - 2 * D, volume: 'large', verified: true }], now);
assert.equal(im.kgCleared, 150); assert.equal(im.kgOpen, 25); assert.equal(im.avgDaysToClean, 2); assert.equal(im.verified, 1);
const tk = O.syncTickets({}, [{ key: 'a' }], now);
assert.equal(tk.a.closedAt, null);
assert.ok(O.syncTickets(tk, [], now + 1).a.closedAt);
assert.ok(O.isOverdue({ due: '2000-01-01' }, now));
assert.ok(!O.isOverdue({ due: '2000-01-01', closedAt: 1 }, now));
const md = O.toMarkdown(O.buildReport({ reports: [base, base, base], wards, now }));
assert.ok(md.includes('# GeoTag waste report') && md.includes('Ward 1') && md.includes('| open |'));

console.log('all tests passed');
