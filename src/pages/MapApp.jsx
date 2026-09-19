import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CATEGORIES, LEVEL_COLOR, cellOf, hotspots } from '../lib/geotag.js';
import { KEYS, load, store, saveReports, loadMemory, saveMemory } from '../lib/storage.js';
import WasteMap from '../components/WasteMap.jsx';
import ReportForm from '../components/ReportForm.jsx';

const RANK = { high: 1, critical: 2 };
const DEFAULT_CENTER = [28.6139, 77.209];
let greeted = false; // StrictMode runs mount effects twice in dev; greet once

export default function MapApp() {
  const [tab, setTab] = useState('report');
  const [reports, setReports] = useState(() => load(KEYS.reports, []));
  const [memory, setMemory] = useState(loadMemory);
  const [places, setPlaces] = useState(() => load(KEYS.places, {}));
  const [location, setLocation] = useState(null); // {lat, lng, source}
  const [focus, setFocus] = useState(null); // {lat, lng, zoom} or {bounds}
  const [toasts, setToasts] = useState([]);
  const [notifyOn, setNotifyOn] = useState(() => window.Notification?.permission === 'granted');
  const mapCenter = useRef(DEFAULT_CENTER);

  const toast = (msg, bad = false) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  };

  useEffect(() => { if (!saveReports(reports)) toast('Storage is full. Export to CSV and clear old data.', true); }, [reports]);
  useEffect(() => { store(KEYS.places, places); }, [places]);

  const hs = useMemo(() => hotspots(reports), [reports]);
  const hot = useMemo(() => hs.filter((h) => h.index >= 40), [hs]);
  const placeName = (h) => places[h.key] || `Area ${h.lat.toFixed(3)}, ${h.lng.toFixed(3)}`;

  // Alerts fire only when an area escalates (-> high -> critical), never when it improves.
  useEffect(() => {
    const before = load(KEYS.alerted, {});
    const fresh = hot.filter((h) => RANK[h.level] > (RANK[before[h.key]] || 0));
    store(KEYS.alerted, Object.fromEntries(hot.map((h) => [h.key, h.level])));
    for (const h of fresh.slice(0, 3)) {
      const msg = `${h.level === 'critical' ? '🚨' : '⚠️'} ${placeName(h)} is ${h.level.toUpperCase()} (index ${h.index})`;
      toast(msg, true);
      if (window.Notification?.permission === 'granted') new Notification('GeoTag alert', { body: msg });
    }
  }, [hot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Area names from OpenStreetMap Nominatim, one request per 1.1 s (their usage policy), cached in localStorage.
  useEffect(() => {
    const h = hot.find((x) => !places[x.key]);
    if (!h) return;
    const t = setTimeout(async () => {
      let name = `Area ${h.lat.toFixed(3)}, ${h.lng.toFixed(3)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${h.lat}&lon=${h.lng}`);
        const a = (await res.json()).address || {};
        name = [...new Set([a.road || a.neighbourhood || a.suburb, a.suburb || a.city_district || a.city].filter(Boolean))].join(', ') || name;
      } catch { /* offline: keep coordinates */ }
      setPlaces((p) => ({ ...p, [h.key]: name }));
    }, 1100);
    return () => clearTimeout(t);
  }, [hot, places]);

  // Fit the map to existing reports on first load; otherwise centre on the user if location was already allowed.
  useEffect(() => {
    if (reports.length) setFocus({ bounds: reports.map((r) => [r.lat, r.lng]) });
    else {
      if (!greeted) toast('👋 Tap “Demo data” to see sample reports, or tag your first pile.');
      greeted = true;
      navigator.permissions?.query({ name: 'geolocation' }).then((p) => {
        if (p.state === 'granted') navigator.geolocation.getCurrentPosition((pos) => setFocus({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 14 }));
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function addReport(r, embedding) {
    const next = [...reports, r];
    setReports(next);
    if (embedding) setMemory(saveMemory([...memory, { c: r.category, m: embedding.m, v: embedding.v }]));
    const cell = hotspots(next).find((h) => h.key === cellOf(r.lat, r.lng).key);
    toast(`✅ Tagged as ${CATEGORIES[r.category].label}. Area index is now ${cell.index} (${cell.level}).`);
    setLocation(null);
  }

  function toggleCleaned(id) {
    const r = reports.find((x) => x.id === id);
    if (!r) return;
    toast(r.cleaned ? 'Report reopened' : '🧹 Marked as cleaned. Thank you!');
    setReports((rs) => rs.map((x) => (x.id === id ? { ...x, cleaned: !x.cleaned, cleanedAt: x.cleaned ? undefined : Date.now() } : x)));
  }
  const deleteReport = (id) => setReports((rs) => rs.filter((r) => r.id !== id));

  function loadDemo() {
    const [lat, lng] = mapCenter.current, now = Date.now();
    const clusters = [
      { d: [0.004, -0.006], n: 14, cats: ['plastic', 'plastic', 'nonbiodegradable', 'biodegradable', 'paper'], vol: ['medium', 'large'] },
      { d: [-0.007, 0.008], n: 8, cats: ['hazardous', 'ewaste', 'plastic'], vol: ['small', 'medium'] },
      { d: [0.011, 0.012], n: 9, cats: ['biodegradable', 'biodegradable', 'plastic', 'glass'], vol: ['small', 'medium', 'large'] },
      { d: [0, 0], n: 16, spread: 0.03, cats: Object.keys(CATEGORIES), vol: ['small', 'small', 'medium'] },
    ];
    const NOTES = { plastic: 'plastic bottles and bags', nonbiodegradable: 'thermocol and chip packets', biodegradable: 'vegetable waste from the market',
      paper: 'cardboard boxes', hazardous: 'used batteries and medicine strips', ewaste: 'old chargers and cables', glass: 'broken beer bottles', metal: 'soda cans and scrap' };
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const demo = clusters.flatMap((k) => Array.from({ length: k.n }, () => {
      const s = k.spread || 0.002, category = pick(k.cats);
      return { id: Math.random().toString(36).slice(2, 10), lat: lat + k.d[0] + (Math.random() - 0.5) * s, lng: lng + k.d[1] + (Math.random() - 0.5) * s,
        category, volume: pick(k.vol), note: NOTES[category], photo: null, items: [], time: now - Math.random() * 10 * 86400000,
        cleaned: Math.random() < 0.12, demo: true };
    }));
    const next = [...reports, ...demo];
    setReports(next);
    setFocus({ bounds: next.map((r) => [r.lat, r.lng]) });
    toast(`Loaded ${demo.length} demo reports around the map centre.`);
  }

  function exportCsv() {
    if (!reports.length) return toast('Nothing to export yet.', true);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['id', 'time', 'lat', 'lng', 'category', 'volume', 'status', 'ai_category', 'detected_items', 'note'], ...reports.map((r) =>
      [r.id, new Date(r.time).toISOString(), r.lat.toFixed(6), r.lng.toFixed(6), r.category, r.volume, r.cleaned ? 'cleaned' : 'open',
        r.ai?.category || '', (r.items || []).map((i) => i.label).join('; '), r.note])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `geotag-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function wipe() {
    if (!confirm('Delete all reports and learned examples stored in this browser?')) return;
    setReports([]); setMemory(saveMemory([])); store(KEYS.alerted, {});
  }

  async function enableNotifications() {
    if (!window.Notification) return toast('Notifications are not supported here.', true);
    const p = await Notification.requestPermission();
    setNotifyOn(p === 'granted');
    toast(p === 'granted' ? '🔔 You’ll be notified when an area crosses the threshold.' : 'Notifications blocked. In-app alerts still work.', p !== 'granted');
  }

  const open = reports.filter((r) => !r.cleaned);
  const withItems = reports.filter((r) => r.items?.length);
  const mixedPct = withItems.length ? Math.round(100 * withItems.filter((r) => new Set(r.items.map((i) => i.category)).size > 1).length / withItems.length) + '%' : '–';
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, open.filter((r) => r.category === k).length]));
  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <>
      <nav className="nav">
        <div className="wrap" style={{ maxWidth: 'none' }}>
          <Link className="logo" to="/"><span className="logo-mark" /><span>Geo<b>Tag</b></span></Link>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={loadDemo}>Demo data</button>
            <button className="btn btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
      </nav>

      <main className="app">
        <aside className="side">
          <div className="tabs" role="tablist">
            {[['report', 'Report'], ['alerts', 'Alerts'], ['overview', 'Overview']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}{k === 'alerts' && hot.length > 0 && <span className="count">{hot.length}</span>}
              </button>
            ))}
          </div>

          {tab === 'report' && <div className="tab-panel" key="report">
            <ReportForm location={location} memory={memory} toast={toast} onSubmit={addReport}
              onLocation={(loc, fly) => { setLocation(loc); if (fly) setFocus({ lat: loc.lat, lng: loc.lng, zoom: 16 }); }} />
          </div>}

          {tab === 'alerts' && <section className="panel tab-panel" key="alerts" style={{ paddingBottom: 10 }}>
            <h2>Alerts {!notifyOn && <button className="btn btn-ghost btn-sm" onClick={enableNotifications}>🔔 Enable</button>}</h2>
            {hot.length ? hot.map((h, i) => (
              <button key={h.key} className="alert-item" style={{ '--i': i }} onClick={() => setFocus({ lat: h.lat, lng: h.lng, zoom: 17 })}>
                <span className="badge" style={{ background: LEVEL_COLOR[h.level] }}>{h.index}</span>
                <span><b>{placeName(h)}</b><small>{h.level.toUpperCase()} · {h.count} open · mostly {CATEGORIES[h.top].label}</small></span>
                <span className="chev">›</span>
              </button>
            )) : <div className="empty-card"><b>All clear</b><p>No block is above the alert threshold (index 40). Tag waste or load demo data to see alerts here.</p></div>}
          </section>}

          {tab === 'overview' && <section className="panel tab-panel" key="overview">
            <h2>Overview</h2>
            <div className="kpis">
              <div><b>{open.length}</b><span>open reports</span></div>
              <div><b>{reports.length - open.length}</b><span>cleaned</span></div>
              <div><b>{mixedPct}</b><span>mixed waste</span></div>
            </div>
            {Object.entries(CATEGORIES).map(([k, c], i) => (
              <div className="bar" key={k} style={{ '--i': i }}><span>{c.label}</span><i style={{ width: `${Math.max(2, (counts[k] / maxCount) * 100)}%`, background: c.color }} /><span>{counts[k]}</span></div>
            ))}
            <p className="empty" style={{ fontSize: 12, marginTop: 10 }}>
              {memory.length ? `🧬 Vision memory: ${memory.length} labelled photo(s). Suggestions improve as you tag more.` : '🧬 Vision memory is empty. Tagged photos teach GeoTag your local waste.'}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={wipe} style={{ marginTop: 10 }}>Clear all data</button>
          </section>}
        </aside>

        <div className="mapbox">
          <WasteMap reports={reports} hotspots={hs} pin={location} focus={focus} center={DEFAULT_CENTER}
            onPick={(lat, lng) => setLocation({ lat, lng, source: 'map pin' })}
            onMove={(c) => { mapCenter.current = c; }}
            onToggle={toggleCleaned} onDelete={deleteReport} />
          <div className="legend">
            <b style={{ display: 'block', marginBottom: 4 }}>Waste index</b>
            {Object.entries(LEVEL_COLOR).map(([l, c]) => <div key={l}><span style={{ background: c }} />{l[0].toUpperCase() + l.slice(1)}</div>)}
          </div>
        </div>
      </main>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast' + (t.bad ? ' bad' : '')}>{t.msg}</div>)}
      </div>
    </>
  );
}
