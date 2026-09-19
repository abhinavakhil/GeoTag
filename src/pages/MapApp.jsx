import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CATEGORIES, LEVEL_COLOR, cellOf, hotspots } from '../lib/geotag.js';
import { findDuplicate, recurringCells, snapshot, indexAgo, impact, syncTickets, isOverdue, wardOf, buildReport } from '../lib/ops.js';
import { KEYS, load, store, saveReports, loadMemory, saveMemory } from '../lib/storage.js';
import { aiClassify, toCanvas } from '../lib/vision.js';
import WasteMap from '../components/WasteMap.jsx';
import ReportForm from '../components/ReportForm.jsx';
import { downloadMd } from './Report.jsx';
import * as sync from '../lib/sync.js';

const RANK = { high: 1, critical: 2 };
const DEFAULT_CENTER = [28.6139, 77.209];
let greeted = false; // StrictMode runs mount effects twice in dev; greet once

export default function MapApp() {
  const [tab, setTab] = useState('report');
  const [reports, setReports] = useState(() => load(KEYS.reports, []));
  const [memory, setMemory] = useState(loadMemory);
  const [places, setPlaces] = useState(() => load(KEYS.places, {}));
  const [tickets, setTickets] = useState(() => load(KEYS.tickets, {}));
  const [wards, setWards] = useState(() => load(KEYS.wards, null));
  const [history, setHistory] = useState(() => load(KEYS.history, {}));
  const [location, setLocation] = useState(null); // {lat, lng, source}
  const [focus, setFocus] = useState(null); // {lat, lng, zoom} or {bounds}
  const [toasts, setToasts] = useState([]);
  const [verify, setVerify] = useState(null); // report being marked cleaned, awaiting an "after" photo
  const [notifyOn, setNotifyOn] = useState(() => window.Notification?.permission === 'granted');
  const [auth, setAuth] = useState({ user: null, role: sync.enabled ? 'anon' : 'admin' }); // local-only mode: everything allowed
  const [signin, setSignin] = useState(false);
  const [pending, setPending] = useState(sync.pendingCount);
  const mapCenter = useRef(DEFAULT_CENTER);
  const reportsRef = useRef(reports); reportsRef.current = reports;
  const role = auth.role, officer = sync.can(role, 'officer'), admin = sync.can(role, 'admin');

  const toast = (msg, bad = false) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  };

  useEffect(() => { if (!saveReports(reports)) toast('Storage is full. Export to CSV and clear old data.', true); }, [reports]);
  useEffect(() => { store(KEYS.places, places); }, [places]);
  useEffect(() => { store(KEYS.tickets, tickets); }, [tickets]);
  useEffect(() => { store(KEYS.wards, wards); }, [wards]);
  useEffect(() => { store(KEYS.history, history); }, [history]);

  // Shared backend (optional). Sign-in state, first pull, live changes, and re-push of anything queued offline.
  useEffect(() => {
    if (!sync.enabled) return;
    let unsubAuth, unsubLive;
    sync.onAuth(async (a) => {
      setAuth(a);
      if (!a.user) { unsubLive?.(); unsubLive = null; return; }
      try {
        const remote = await sync.pullAll();
        setReports((local) => { const byId = Object.fromEntries(local.map((r) => [r.id, r])); for (const r of remote.reports) byId[r.id] = { ...byId[r.id], ...r }; return Object.values(byId).sort((x, y) => x.time - y.time); });
        setTickets((t) => ({ ...t, ...remote.tickets }));
        if (remote.wards) setWards(remote.wards);
        const n = await sync.flush(reportsRef.current); setPending(sync.pendingCount());
        if (n) toast(`☁️ Synced ${n} report${n > 1 ? 's' : ''} saved while offline.`);
        unsubLive = await sync.subscribe(({ table, type, row, id }) => {
          if (table === 'reports') setReports((rs) => type === 'DELETE' ? rs.filter((r) => r.id !== id) : rs.some((r) => r.id === row.id) ? rs.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [...rs, row]);
          if (table === 'tickets') setTickets((t) => type === 'DELETE' ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== id)) : { ...t, [row.key]: row });
          if (table === 'wards') setWards(type === 'DELETE' ? null : row);
        });
      } catch (e) { toast(`Could not reach the server: ${e.message}. Working locally.`, true); }
    }).then((u) => { unsubAuth = u; });
    const online = () => sync.flush(reportsRef.current).then((n) => { setPending(sync.pendingCount()); if (n) toast(`☁️ Back online, synced ${n} report${n > 1 ? 's' : ''}.`); }).catch(() => {});
    window.addEventListener('online', online);
    return () => { unsubAuth?.(); unsubLive?.(); window.removeEventListener('online', online); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Local first, then push. Failures stay in the queue and go out when the network is back.
  const push = (r) => { if (!sync.enabled || !auth.user) return; sync.pushReport(r).catch(() => {}).finally(() => setPending(sync.pendingCount())); };
  const pushTicket = (t) => { if (sync.enabled && auth.user && officer) sync.pushTicket(t).catch((e) => toast(`Ticket not saved: ${e.message}`, true)); };

  const hs = useMemo(() => hotspots(reports), [reports]);
  const hot = useMemo(() => hs.filter((h) => h.index >= 40), [hs]);
  const recurring = useMemo(() => recurringCells(reports), [reports]);
  const placeName = (h) => places[h.key] || `Area ${h.lat.toFixed(3)}, ${h.lng.toFixed(3)}`;

  // One index snapshot per day, so alerts can show a 7-day trend. Tickets follow the alert list.
  useEffect(() => { setHistory((h) => snapshot(h, hs)); setTickets((t) => syncTickets(t, hot)); }, [hs, hot]);

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
    if (embedding) setMemory(saveMemory([...memory, { c: r.category, m: embedding.m, v: embedding.v }]));
    const dup = findDuplicate(reports, r);
    if (dup) {
      // Same pile seen again: count the sighting and keep the newest photo, don't inflate the index.
      const merged = { ...dup, sightings: (dup.sightings || 1) + 1, photo: r.photo || dup.photo, note: dup.note || r.note };
      setReports((rs) => rs.map((x) => (x.id === dup.id ? merged : x)));
      push(merged);
      toast(`🔁 Same pile already reported ${Math.round((r.time - dup.time) / 3600000) || '<1'} h ago. Counted as another sighting.`);
    } else {
      const next = [...reports, r];
      setReports(next);
      push(r);
      const cell = hotspots(next).find((h) => h.key === cellOf(r.lat, r.lng).key);
      toast(`✅ Tagged as ${CATEGORIES[r.category].label}. Area index is now ${cell.index} (${cell.level}).`);
    }
    setLocation(null);
  }

  function toggleCleaned(id) {
    const r = reports.find((x) => x.id === id);
    if (!r) return;
    if (r.cleaned) { toast('Report reopened'); const u = { ...r, cleaned: false, cleanedAt: undefined, verified: false }; setReports((rs) => rs.map((x) => (x.id === id ? u : x))); push(u); }
    else setVerify(r); // ask for an "after" photo first
  }
  function finishClean(id, verified) {
    setVerify(null);
    const u = { ...reports.find((x) => x.id === id), cleaned: true, cleanedAt: Date.now(), verified };
    setReports((rs) => rs.map((x) => (x.id === id ? u : x)));
    push(u);
    toast(verified ? '🧹✓ Cleanup verified by AI. Thank you!' : '🧹 Marked as cleaned. Thank you!');
  }
  const deleteReport = (id) => { setReports((rs) => rs.filter((r) => r.id !== id)); if (sync.enabled && auth.user) sync.deleteReport(id).catch((e) => toast(`Not deleted on the server: ${e.message}`, true)); };

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
      const s = k.spread || 0.002, category = pick(k.cats), time = now - Math.random() * 10 * 86400000, cleaned = Math.random() < 0.12;
      return { id: Math.random().toString(36).slice(2, 10), lat: lat + k.d[0] + (Math.random() - 0.5) * s, lng: lng + k.d[1] + (Math.random() - 0.5) * s,
        category, volume: pick(k.vol), note: NOTES[category], photo: null, items: [], time, cleaned, cleanedAt: cleaned ? time + Math.random() * 3 * 86400000 : undefined, demo: true };
    }));
    const next = [...reports, ...demo];
    setReports(next);
    demo.forEach(push);
    setFocus({ bounds: next.map((r) => [r.lat, r.lng]) });
    toast(`Loaded ${demo.length} demo reports around the map centre.`);
  }

  function exportCsv() {
    if (!reports.length) return toast('Nothing to export yet.', true);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['id', 'time', 'lat', 'lng', 'ward', 'category', 'volume', 'status', 'verified', 'sightings', 'ai_category', 'detected_items', 'note'], ...reports.map((r) =>
      [r.id, new Date(r.time).toISOString(), r.lat.toFixed(6), r.lng.toFixed(6), wards ? wardOf(r.lat, r.lng, wards) || '' : '', r.category, r.volume,
        r.cleaned ? 'cleaned' : 'open', r.verified ? 'yes' : '', r.sightings || 1, r.ai?.category || '', (r.items || []).map((i) => i.label).join('; '), r.note])];
    download(rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv', `geotag-reports-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  const exportMd = () => reports.length ? downloadMd(buildReport({ reports, places, wards, tickets, history })) : toast('Nothing to export yet.', true);

  async function importWards(file) {
    if (!file) return;
    try {
      const gj = JSON.parse(await file.text());
      const features = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : null;
      if (!features?.length) throw new Error('not a GeoJSON FeatureCollection');
      const gjw = { type: 'FeatureCollection', features: features.filter((f) => /Polygon/.test(f.geometry?.type)) };
      setWards(gjw);
      if (sync.enabled && auth.user) sync.pushWards(gjw).catch((e) => toast(`Wards not shared: ${e.message}`, true));
      toast(`🗺️ Loaded ${features.length} ward boundaries.`);
    } catch (e) { toast(`Could not read that file: ${e.message}`, true); }
  }

  function wipe() {
    if (!confirm('Delete all reports, tickets, wards and learned examples stored in this browser?')) return;
    setReports([]); setMemory(saveMemory([])); setTickets({}); setWards(null); setHistory({}); store(KEYS.alerted, {});
  }

  async function enableNotifications() {
    if (!window.Notification) return toast('Notifications are not supported here.', true);
    const p = await Notification.requestPermission();
    setNotifyOn(p === 'granted');
    toast(p === 'granted' ? '🔔 You’ll be notified when an area crosses the threshold.' : 'Notifications blocked. In-app alerts still work.', p !== 'granted');
  }

  const im = useMemo(() => impact(reports), [reports]);
  const open = reports.filter((r) => !r.cleaned);
  const withItems = reports.filter((r) => r.items?.length);
  const mixedPct = withItems.length ? Math.round(100 * withItems.filter((r) => new Set(r.items.map((i) => i.category)).size > 1).length / withItems.length) + '%' : '–';
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, open.filter((r) => r.category === k).length]));
  const maxCount = Math.max(1, ...Object.values(counts));
  const byWard = useMemo(() => {
    if (!wards) return null;
    const m = {};
    for (const r of open) { const w = wardOf(r.lat, r.lng, wards) || 'Outside wards'; m[w] = (m[w] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [open, wards]); // eslint-disable-line react-hooks/exhaustive-deps
  const overdue = hot.filter((h) => isOverdue(tickets[h.key])).length;

  return (
    <>
      <nav className="nav">
        <div className="wrap" style={{ maxWidth: 'none' }}>
          <Link className="logo" to="/"><span className="logo-mark" /><span>Geo<b>Tag</b></span></Link>
          <div style={{ display: 'flex', gap: 8 }}>
            {sync.enabled && (auth.user
              ? <span className="who"><b>{auth.user.email}</b><em className={'role ' + role}>{role}</em>{pending > 0 && <em className="role queued" title="Reports waiting to sync">{pending} queued</em>}<button className="btn btn-ghost btn-sm" onClick={() => sync.signOut()}>Sign out</button></span>
              : <button className="btn btn-green btn-sm" onClick={() => setSignin(true)}>Sign in</button>)}
            <button className="btn btn-ghost btn-sm" onClick={loadDemo}>Demo data</button>
            <details className="menu">
              <summary className="btn btn-ghost btn-sm">Export ▾</summary>
              <div>
                <button onClick={exportCsv}><b>CSV</b><small>Raw rows for spreadsheets</small></button>
                <button onClick={exportMd}><b>Markdown</b><small>Formatted report, tables included</small></button>
                <Link to="/report"><b>PDF / print</b><small>Laid-out report page, save as PDF</small></Link>
              </div>
            </details>
          </div>
        </div>
      </nav>

      <main className="app">
        <aside className="side">
          <div className="tabs" role="tablist">
            {[['report', 'Report'], ['alerts', 'Alerts'], ['overview', 'Overview']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}{k === 'alerts' && hot.length > 0 && <span className={'count' + (overdue ? ' late' : '')}>{hot.length}</span>}
              </button>
            ))}
          </div>

          {tab === 'report' && <div className="tab-panel" key="report">
            <ReportForm location={location} memory={memory} toast={toast} onSubmit={addReport}
              onLocation={(loc, fly) => { setLocation(loc); if (fly) setFocus({ lat: loc.lat, lng: loc.lng, zoom: 16 }); }} />
          </div>}

          {tab === 'alerts' && <section className="panel tab-panel" key="alerts" style={{ paddingBottom: 10 }}>
            <h2>Alerts {!notifyOn && <button className="btn btn-ghost btn-sm" onClick={enableNotifications}>🔔 Enable</button>}</h2>
            {overdue > 0 && <p className="late-note">⏰ {overdue} ticket{overdue > 1 ? 's' : ''} past due</p>}
            {hot.length ? hot.map((h, i) => {
              const t = tickets[h.key] || {}, ago = indexAgo(history, h.key, 7), trend = ago == null ? null : h.index - ago;
              return (
                <div key={h.key} className="alert-card" style={{ '--i': i }}>
                  <button className="alert-item" onClick={() => setFocus({ lat: h.lat, lng: h.lng, zoom: 17 })}>
                    <span className="badge" style={{ background: LEVEL_COLOR[h.level] }}>{h.index}</span>
                    <span><b>{placeName(h)}</b>
                      <small>{h.level.toUpperCase()} · {h.count} open · mostly {CATEGORIES[h.top].label}
                        {trend != null && trend !== 0 && <em className={'trend ' + (trend > 0 ? 'up' : 'down')}>{trend > 0 ? '▲' : '▼'} {Math.abs(trend)} / 7d</em>}
                        {recurring.has(h.key) && <em className="tag-rec">recurring site</em>}
                        {wards && <em className="tag-ward">{wardOf(h.lat, h.lng, wards) || 'outside wards'}</em>}
                      </small></span>
                    <span className="chev">›</span>
                  </button>
                  <div className={'ticket' + (isOverdue(t) ? ' late' : '')}>
                    <input placeholder={officer ? 'Assign to (crew / officer)' : t.assignee ? '' : 'Unassigned'} value={t.assignee || ''} disabled={!officer} onChange={(e) => setTickets((x) => ({ ...x, [h.key]: { ...t, assignee: e.target.value } }))} onBlur={() => pushTicket(tickets[h.key])} aria-label="Assignee" />
                    <input type="date" value={t.due || ''} disabled={!officer} onChange={(e) => { const nt = { ...t, due: e.target.value || null }; setTickets((x) => ({ ...x, [h.key]: nt })); pushTicket(nt); }} aria-label="Due date" />
                    {isOverdue(t) && <span className="late-tag">overdue</span>}
                  </div>
                </div>
              );
            }) : <div className="empty-card"><b>All clear</b><p>No block is above the alert threshold (index 40). Tag waste or load demo data to see alerts here.</p></div>}
          </section>}

          {tab === 'overview' && <section className="panel tab-panel" key="overview">
            <h2>Overview</h2>
            <div className="kpis">
              <div><b>{open.length}</b><span>open reports</span></div>
              <div><b>{im.cleaned}</b><span>cleaned{im.verified ? ` · ${im.verified} ✓` : ''}</span></div>
              <div><b>{mixedPct}</b><span>mixed waste</span></div>
            </div>
            <div className="kpis">
              <div><b>{im.kgOpen >= 1000 ? (im.kgOpen / 1000).toFixed(1) + ' t' : im.kgOpen + ' kg'}</b><span>est. on the ground</span></div>
              <div><b>{im.kgCleared >= 1000 ? (im.kgCleared / 1000).toFixed(1) + ' t' : im.kgCleared + ' kg'}</b><span>est. cleared</span></div>
              <div><b>{im.avgDaysToClean == null ? '–' : im.avgDaysToClean.toFixed(1) + ' d'}</b><span>avg. time to clean</span></div>
            </div>
            {(im.hazardousOpen > 0 || recurring.size > 0) && <p className="empty" style={{ fontSize: 12, marginBottom: 12 }}>
              {im.hazardousOpen > 0 && <>☣️ {im.hazardousOpen} hazardous / e-waste report{im.hazardousOpen > 1 ? 's' : ''} open. </>}
              {recurring.size > 0 && <>🔁 {recurring.size} recurring dumping site{recurring.size > 1 ? 's' : ''}: consider a bin or scheduled pickup.</>}
            </p>}
            {Object.entries(CATEGORIES).map(([k, c], i) => (
              <div className="bar" key={k} style={{ '--i': i }}><span>{c.label}</span><i style={{ width: `${Math.max(2, (counts[k] / maxCount) * 100)}%`, background: c.color }} /><span>{counts[k]}</span></div>
            ))}

            <h3 className="sub">Wards</h3>
            {byWard ? <>
              {byWard.slice(0, 8).map(([w, n], i) => <div className="bar" key={w} style={{ '--i': i }}><span title={w}>{w}</span><i style={{ width: `${Math.max(2, (n / (byWard[0][1] || 1)) * 100)}%`, background: 'var(--green)' }} /><span>{n}</span></div>)}
              {admin && <button className="btn btn-ghost btn-sm" onClick={() => { setWards(null); if (sync.enabled && auth.user) sync.pushWards(null).catch(() => {}); }}>Remove wards</button>}
            </> : admin ? <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>🗺️ Import ward boundaries (GeoJSON)
              <input type="file" accept=".geojson,.json,application/geo+json,application/json" hidden onChange={(e) => importWards(e.target.files[0])} /></label>
              : <p className="empty" style={{ fontSize: 12 }}>No ward boundaries yet. An admin can import them.</p>}

            <p className="empty" style={{ fontSize: 12, marginTop: 14 }}>
              {memory.length ? `🧬 Vision memory: ${memory.length} labelled photo(s). Suggestions improve as you tag more.` : '🧬 Vision memory is empty. Tagged photos teach GeoTag your local waste.'}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={wipe} style={{ marginTop: 10 }}>Clear all data</button>
          </section>}
        </aside>

        <div className="mapbox">
          <WasteMap reports={reports} hotspots={hs} pin={location} focus={focus} center={DEFAULT_CENTER} wards={wards} recurring={recurring}
            onPick={(lat, lng) => setLocation({ lat, lng, source: 'map pin' })}
            onMove={(c) => { mapCenter.current = c; }}
            onToggle={toggleCleaned} onDelete={deleteReport} />
          <div className="legend">
            <b style={{ display: 'block', marginBottom: 4 }}>Waste index</b>
            {Object.entries(LEVEL_COLOR).map(([l, c]) => <div key={l}><span style={{ background: c }} />{l[0].toUpperCase() + l.slice(1)}</div>)}
          </div>
        </div>
      </main>

      {verify && <VerifyCleanup report={verify} onDone={(ok) => finishClean(verify.id, ok)} onCancel={() => setVerify(null)} />}
      {signin && <SignIn onClose={() => setSignin(false)} toast={toast} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast' + (t.bad ? ' bad' : '')}>{t.msg}</div>)}
      </div>
    </>
  );
}

// Passwordless sign-in: Supabase emails a magic link that lands back on /app.
function SignIn({ onClose, toast }) {
  const dlg = useRef(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { dlg.current.showModal(); }, []);
  async function go(e) {
    e.preventDefault(); setBusy(true);
    try { await sync.signIn(email.trim()); setSent(true); } catch (err) { toast(err.message, true); } finally { setBusy(false); }
  }
  return (
    <dialog ref={dlg} className="verify" onClose={onClose}>
      <h2>Sign in to GeoTag</h2>
      {sent ? <p className="muted">📬 Check <b>{email}</b> for a sign-in link. Open it on this device and you're in.</p> : <form onSubmit={go}>
        <p className="muted">Reports you file are shared with everyone on this map. Crews and officers get extra tools after an admin sets their role.</p>
        <input className="email" type="email" required autoFocus placeholder="you@city.gov.in" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <div className="verify-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => dlg.current.close()}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button></div>
      </form>}
      {sent && <div className="verify-actions"><button className="btn btn-primary btn-sm" onClick={() => dlg.current.close()}>Done</button></div>}
    </dialog>
  );
}

function download(text, type, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}

// Before/after check: the same zero-shot model that found the waste confirms the "after" photo is clean.
function VerifyCleanup({ report, onDone, onCancel }) {
  const dlg = useRef(null);
  const [status, setStatus] = useState(null);
  const [after, setAfter] = useState(null);
  const [result, setResult] = useState(null); // {ok, top}
  useEffect(() => { dlg.current.showModal(); }, []);

  async function onFile(file) {
    if (!file) return;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return setStatus('That image could not be read.');
    const url = toCanvas(bmp, bmp.width, bmp.height).toDataURL('image/jpeg', 0.6);
    setAfter(url); setResult(null); setStatus('🤖 Checking the photo…');
    try {
      const ai = await aiClassify(url, (f) => setStatus(`🤖 Downloading the free AI model… ${Math.round(f * 100)}%`));
      setStatus(null);
      setResult({ ok: ai.noWaste || ai.confidence < 0.45, top: ai.top[0] });
    } catch (e) { setStatus(`⚠️ AI unavailable (${e.message}). You can still mark it cleaned.`); }
  }

  return (
    <dialog ref={dlg} className="verify" onClose={onCancel}>
      <h2>Confirm cleanup</h2>
      <p className="muted">Add an “after” photo and GeoTag will verify that the {CATEGORIES[report.category].label.toLowerCase()} is gone. Verified cleanups count in reports.</p>
      <div className="verify-pics">
        <div>{report.photo ? <img src={report.photo} alt="Before" /> : <div className="ph">No before photo</div>}<span>Before</span></div>
        <label className="drop">
          <input type="file" accept="image/*" aria-label="Upload the after photo" onChange={(e) => onFile(e.target.files[0])} />
          {after ? <img src={after} alt="After" /> : <span>📷 <b>Add after photo</b></span>}
        </label>
      </div>
      {status && <div className="ai">{status}</div>}
      {result && <div className={'ai ' + (result.ok ? 'ok' : 'warn')}>{result.ok ? '✅ Looks clean. Verified.' : `⚠️ Still looks like ${CATEGORIES[result.top.category].label.toLowerCase()} (${Math.round(result.top.share * 100)}%). Mark anyway?`}</div>}
      <div className="verify-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => dlg.current.close()}>Cancel</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onDone(false)}>Mark cleaned without photo</button>
        {result?.ok && <button className="btn btn-green btn-sm" onClick={() => onDone(true)}>✓ Verified clean</button>}
        {result && !result.ok && <button className="btn btn-primary btn-sm" onClick={() => onDone(false)}>Mark cleaned anyway</button>}
      </div>
    </dialog>
  );
}
