import { useMemo } from 'react';
import { Link } from 'react-router';
import { CATEGORIES, LEVEL_COLOR } from '../lib/geotag.js';
import { buildReport, toMarkdown } from '../lib/ops.js';
import { KEYS, load } from '../lib/storage.js';

// Print-styled report. "Save as PDF" is the browser's print dialog, so no PDF library is needed.
export default function Report() {
  const rep = useMemo(() => buildReport({ reports: load(KEYS.reports, []), places: load(KEYS.places, {}), wards: load(KEYS.wards, null),
    tickets: load(KEYS.tickets, {}), history: load(KEYS.history, {}) }), []);
  const i = rep.impact, wards = Object.entries(rep.byWard).sort((a, b) => b[1].open - a[1].open);
  const maxCat = Math.max(1, ...Object.values(rep.byCat));
  const d = (t) => new Date(t).toLocaleString();

  return (
    <div className="report">
      <div className="report-bar no-print">
        <Link className="btn btn-ghost btn-sm" to="/app">← Back to map</Link>
        <span>Use “Save as PDF” in the print dialog.</span>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadMd(rep)}>Download Markdown</button>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
      </div>

      <header className="report-head">
        <div className="logo"><span className="logo-mark" /><span>Geo<b>Tag</b></span></div>
        <div><h1>Waste report</h1><p className="muted">Generated {d(rep.generated)} · {rep.reports.length} reports · index per ~500 m block, alerts at 40+</p></div>
      </header>

      <section>
        <h2>Summary</h2>
        <div className="report-kpis">
          <div><b>{i.open}</b><span>open reports</span></div>
          <div><b>{i.cleaned}</b><span>cleaned{i.verified ? ` · ${i.verified} AI-verified` : ''}</span></div>
          <div><b>{i.kgOpen.toLocaleString()} kg</b><span>est. on the ground</span></div>
          <div><b>{i.kgCleared.toLocaleString()} kg</b><span>est. cleared</span></div>
          <div><b>{i.hazardousOpen}</b><span>hazardous / e-waste open</span></div>
          <div><b>{i.avgDaysToClean == null ? '–' : i.avgDaysToClean.toFixed(1)}</b><span>avg. days to clean</span></div>
        </div>
      </section>

      <section>
        <h2>Alerts <small>({rep.alerts.length})</small></h2>
        {rep.alerts.length ? (
          <table>
            <thead><tr><th>Index</th><th>Level</th><th>Area</th><th>Open</th><th>Mostly</th><th>7-day trend</th><th>Assigned</th><th>Due</th></tr></thead>
            <tbody>{rep.alerts.map((a) => (
              <tr key={a.key}>
                <td><span className="badge" style={{ background: LEVEL_COLOR[a.level] }}>{a.index}</span></td>
                <td>{a.level}{a.recurring && <em className="tag-rec">recurring</em>}</td>
                <td>{a.name}</td><td>{a.count}</td><td>{CATEGORIES[a.top].label}</td>
                <td>{a.trend == null ? '–' : <span style={{ color: a.trend > 0 ? 'var(--red)' : 'var(--green)' }}>{a.trend > 0 ? '▲ +' : a.trend < 0 ? '▼ ' : ''}{a.trend}</span>}</td>
                <td>{a.ticket?.assignee || '–'}</td><td>{a.ticket?.due || '–'}</td>
              </tr>))}
            </tbody>
          </table>
        ) : <p className="muted">No block is above the alert threshold.</p>}
      </section>

      <section className="report-two">
        <div>
          <h2>Open reports by stream</h2>
          {Object.entries(rep.byCat).map(([k, n]) => (
            <div className="bar" key={k}><span>{CATEGORIES[k].label}</span><i style={{ width: `${Math.max(2, (n / maxCat) * 100)}%`, background: CATEGORIES[k].color }} /><span>{n}</span></div>
          ))}
        </div>
        {wards.length > 0 && (
          <div>
            <h2>By ward</h2>
            <table><thead><tr><th>Ward</th><th>Open</th><th>Cleaned</th></tr></thead>
              <tbody>{wards.map(([w, b]) => <tr key={w}><td>{w}</td><td>{b.open}</td><td>{b.cleaned}</td></tr>)}</tbody></table>
          </div>
        )}
      </section>

      <section>
        <h2>All reports</h2>
        <table className="small">
          <thead><tr><th>Time</th><th>Status</th><th>Stream</th><th>Size</th><th>Location</th>{wards.length > 0 && <th>Ward</th>}<th>Note</th></tr></thead>
          <tbody>{rep.reports.map((r) => (
            <tr key={r.id}>
              <td>{d(r.time)}</td>
              <td>{r.cleaned ? <span style={{ color: 'var(--green)' }}>cleaned{r.verified ? ' ✓' : ''}</span> : 'open'}</td>
              <td><span className="dot" style={{ background: CATEGORIES[r.category]?.color }} /> {CATEGORIES[r.category]?.label || r.category}</td>
              <td>{r.volume}{r.sightings > 1 ? ` · seen ${r.sightings}×` : ''}</td>
              <td><a href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`}>{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</a></td>
              {wards.length > 0 && <td>{r.ward || '–'}</td>}
              <td>{r.note}</td>
            </tr>))}
          </tbody>
        </table>
      </section>

      <footer className="muted">Waste index = Σ volume × harm × recency over open reports in a block; weight halves every 7 days. Map data © OpenStreetMap contributors. Made with GeoTag.</footer>
    </div>
  );
}

export function downloadMd(rep) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toMarkdown(rep)], { type: 'text/markdown' }));
  a.download = `geotag-report-${new Date(rep.generated).toISOString().slice(0, 10)}.md`;
  a.click();
}
