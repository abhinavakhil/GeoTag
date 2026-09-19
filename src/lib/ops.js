// Operations logic on top of geotag.js: duplicates, wards, trends, impact, tickets, reports. Pure, tested in geotag.test.js.
import { CATEGORIES, cellOf, hotspots } from './geotag.js';

const DAY = 86400000;

// Metres between two points (equirectangular, fine under a few km).
export function distanceM(a, b) {
  const R = 6371000, x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * Math.PI / 180, y = (b.lat - a.lat) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * R;
}

// An open report of the same category within 30 m and 24 h is the same pile seen again, not a new one.
export function findDuplicate(reports, r, { metres = 30, hours = 24 } = {}) {
  return reports.find((x) => !x.cleaned && x.category === r.category && Math.abs(x.time - r.time) < hours * 3600000 && distanceM(x, r) <= metres) || null;
}

// Ray casting over a GeoJSON Polygon / MultiPolygon in [lng, lat] order.
export function pointInPolygon(lat, lng, geom) {
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const polys = geom?.type === 'MultiPolygon' ? geom.coordinates : geom?.type === 'Polygon' ? [geom.coordinates] : [];
  return polys.some((p) => inRing(p[0]) && !p.slice(1).some(inRing));
}

export const wardName = (f) => f.properties?.name || f.properties?.NAME || f.properties?.ward || f.properties?.WARD || f.properties?.id || 'Unnamed ward';
// wards: GeoJSON FeatureCollection. Name of the ward containing the point, or null.
export function wardOf(lat, lng, wards) {
  const f = (wards?.features || []).find((f) => pointInPolygon(lat, lng, f.geometry));
  return f ? wardName(f) : null;
}

// A cell cleaned at least twice that is dirty again is a recurring dumping site.
export function recurringCells(reports) {
  const cells = {};
  for (const r of reports) {
    const c = (cells[cellOf(r.lat, r.lng).key] ||= { cleaned: 0, lastClean: 0, reopened: 0 });
    if (r.cleaned) { c.cleaned++; c.lastClean = Math.max(c.lastClean, r.cleanedAt || 0); }
  }
  for (const r of reports) if (!r.cleaned) { const c = cells[cellOf(r.lat, r.lng).key]; if (c.cleaned && r.time > c.lastClean) c.reopened++; }
  return new Set(Object.entries(cells).filter(([, c]) => c.cleaned >= 2 && c.reopened > 0).map(([k]) => k));
}

// Daily snapshot of every cell's index, last 90 days kept. history: {YYYY-MM-DD: {cellKey: index}}
export function snapshot(history, hs, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const next = { ...history, [day]: Object.fromEntries(hs.map((h) => [h.key, h.index])) };
  for (const d of Object.keys(next).sort().slice(0, -90)) delete next[d];
  return next;
}
// Index of a cell `days` ago (nearest earlier snapshot), or null when there is no history that old.
export function indexAgo(history, key, days, now = Date.now()) {
  const target = new Date(now - days * DAY).toISOString().slice(0, 10);
  const day = Object.keys(history).filter((d) => d <= target).sort().pop();
  return day ? history[day][key] ?? 0 : null;
}

// Rough mass per report for impact figures. ponytail: fixed kg per size; calibrate per city if it matters.
export const KG = { small: 5, medium: 25, large: 150 };
export function impact(reports, now = Date.now()) {
  const cleaned = reports.filter((r) => r.cleaned), open = reports.filter((r) => !r.cleaned);
  const times = cleaned.filter((r) => r.cleanedAt).map((r) => (r.cleanedAt - r.time) / DAY);
  return {
    open: open.length, cleaned: cleaned.length,
    kgCleared: cleaned.reduce((s, r) => s + (KG[r.volume] || KG.medium), 0),
    kgOpen: open.reduce((s, r) => s + (KG[r.volume] || KG.medium), 0),
    hazardousOpen: open.filter((r) => r.category === 'hazardous' || r.category === 'ewaste').length,
    avgDaysToClean: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    verified: cleaned.filter((r) => r.verified).length,
    last7: reports.filter((r) => now - r.time < 7 * DAY).length,
  };
}

// Tickets: one per alerted cell. Existing tickets keep assignee/due; cells that drop below the threshold close.
export function syncTickets(tickets, hot, now = Date.now()) {
  const next = { ...tickets };
  for (const h of hot) if (!next[h.key] || next[h.key].closedAt) next[h.key] = { key: h.key, openedAt: now, assignee: '', due: null, closedAt: null };
  for (const t of Object.values(next)) if (!t.closedAt && !hot.some((h) => h.key === t.key)) next[t.key] = { ...t, closedAt: now };
  return next;
}
export const isOverdue = (t, now = Date.now()) => !!t && !t.closedAt && !!t.due && new Date(t.due).getTime() < now;

// Everything the PDF page and the Markdown export need, in one plain object.
export function buildReport({ reports, places = {}, wards = null, tickets = {}, history = {}, now = Date.now() }) {
  const hs = hotspots(reports, now), hot = hs.filter((h) => h.index >= 40), rec = recurringCells(reports);
  const open = reports.filter((r) => !r.cleaned);
  const byCat = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, open.filter((r) => r.category === k).length]));
  const byWard = {};
  if (wards) for (const r of reports) {
    const b = (byWard[wardOf(r.lat, r.lng, wards) || 'Outside wards'] ||= { open: 0, cleaned: 0 });
    b[r.cleaned ? 'cleaned' : 'open']++;
  }
  return {
    generated: now, impact: impact(reports, now), byCat, byWard,
    alerts: hot.map((h) => {
      const ago = indexAgo(history, h.key, 7, now);
      return { ...h, name: places[h.key] || `Area ${h.lat.toFixed(3)}, ${h.lng.toFixed(3)}`, recurring: rec.has(h.key), trend: ago == null ? null : h.index - ago, ticket: tickets[h.key] || null };
    }),
    reports: [...reports].sort((a, b) => b.time - a.time).map((r) => ({ ...r, photo: undefined, ward: wards ? wardOf(r.lat, r.lng, wards) : null })),
  };
}

const fmt = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
export function toMarkdown(rep) {
  const i = rep.impact, hasWards = Object.keys(rep.byWard).length > 0;
  const L = ['# GeoTag waste report', '', `Generated ${fmt(rep.generated)} UTC · ${rep.reports.length} reports · index per ~500 m block, alerts at 40+`, '',
    '## Summary', '', '| Metric | Value |', '|---|---|',
    `| Open reports | ${i.open} |`, `| Cleaned | ${i.cleaned}${i.verified ? ` (${i.verified} AI-verified)` : ''} |`,
    `| Est. waste on the ground | ${i.kgOpen} kg |`, `| Est. waste cleared | ${i.kgCleared} kg |`, `| Hazardous / e-waste open | ${i.hazardousOpen} |`,
    `| Avg. days to clean | ${i.avgDaysToClean == null ? '-' : i.avgDaysToClean.toFixed(1)} |`, `| Reports in last 7 days | ${i.last7} |`, '',
    `## Alerts (${rep.alerts.length})`, '', '| Index | Level | Area | Open | Mostly | 7-day trend | Assigned | Due |', '|---|---|---|---|---|---|---|---|',
    ...rep.alerts.map((a) => `| ${a.index} | ${a.level}${a.recurring ? ' (recurring)' : ''} | ${a.name} | ${a.count} | ${CATEGORIES[a.top].label} | ${a.trend == null ? '-' : (a.trend > 0 ? '+' : '') + a.trend} | ${a.ticket?.assignee || '-'} | ${a.ticket?.due || '-'} |`),
    '', '## Open reports by stream', '', '| Stream | Open |', '|---|---|', ...Object.entries(rep.byCat).map(([k, n]) => `| ${CATEGORIES[k].label} | ${n} |`)];
  if (hasWards) L.push('', '## By ward', '', '| Ward | Open | Cleaned |', '|---|---|---|',
    ...Object.entries(rep.byWard).sort((a, b) => b[1].open - a[1].open).map(([w, b]) => `| ${w} | ${b.open} | ${b.cleaned} |`));
  L.push('', '## Reports', '', `| Time (UTC) | Status | Stream | Size | Location |${hasWards ? ' Ward |' : ''} Note |`, `|---|---|---|---|---|${hasWards ? '---|' : ''}---|`,
    ...rep.reports.map((r) => `| ${fmt(r.time)} | ${r.cleaned ? (r.verified ? 'cleaned (verified)' : 'cleaned') : 'open'} | ${CATEGORIES[r.category]?.label || r.category} | ${r.volume} | [${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}](https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}) |${hasWards ? ` ${r.ward || '-'} |` : ''} ${(r.note || '').replace(/\|/g, '/')} |`));
  L.push('', '---', 'Waste index = sum of volume x harm x recency over open reports in a block; weight halves every 7 days. Made with GeoTag.');
  return L.join('\n');
}
