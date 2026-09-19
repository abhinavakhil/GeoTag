import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CATEGORIES, LEVEL_COLOR } from '../lib/geotag.js';

const RADIUS = { small: 5, medium: 7, large: 10 };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function popupHtml(r) {
  const c = CATEGORIES[r.category] || CATEGORIES.nonbiodegradable;
  const items = (r.items || []).map((i) => esc(i.label)).join(', ');
  return `<div class="popup">${r.photo ? `<img src="${r.photo}" alt="Reported waste">` : ''}
    <b style="color:${c.color}">${c.label}</b> · ${r.volume} · ${ago(r.time)}${r.cleaned ? ' · <b style="color:#1f8a55">cleaned</b>' : ''}
    ${r.ai?.category ? `<div>AI: ${CATEGORIES[r.ai.category].label} ${Math.round(r.ai.confidence * 100)}%</div>` : ''}
    ${items ? `<div>Detected: ${items}</div>` : ''}${r.note ? `<div>${esc(r.note)}</div>` : ''}
    <div style="color:#5b6a61;font-size:12px;margin:4px 0 8px">${c.bin}</div>
    <button class="btn btn-sm ${r.cleaned ? 'btn-ghost' : 'btn-primary'}" data-act="toggle" data-id="${r.id}">${r.cleaned ? 'Reopen' : '✓ Mark cleaned'}</button>
    <button class="btn btn-sm btn-ghost" data-act="delete" data-id="${r.id}">Delete</button></div>`;
}

// Leaflet is imperative; React owns the data, this component syncs layers whenever it changes.
export default function WasteMap({ reports, hotspots, pin, focus, center, onPick, onMove, onToggle, onDelete }) {
  const el = useRef(null);
  const m = useRef(null);
  const cb = useRef({});
  cb.current = { onPick, onMove, onToggle, onDelete };

  useEffect(() => {
    const map = L.map(el.current, { zoomControl: false }).setView(center, 13);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const cells = L.layerGroup().addTo(map);
    const cats = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, L.layerGroup().addTo(map)]));
    L.control.layers(null, {
      'Waste index': cells,
      ...Object.fromEntries(Object.entries(CATEGORIES).map(([k, c]) => [`<span class="dot" style="background:${c.color}"></span> ${c.label}`, cats[k]])),
    }, { position: 'topright' }).addTo(map);
    map.on('click', (e) => cb.current.onPick(e.latlng.lat, e.latlng.lng));
    map.on('moveend', () => { const c = map.getCenter(); cb.current.onMove([c.lat, c.lng]); });
    const onClick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      map.closePopup();
      (b.dataset.act === 'toggle' ? cb.current.onToggle : cb.current.onDelete)(b.dataset.id);
    };
    const node = el.current;
    node.addEventListener('click', onClick);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(node);
    m.current = { map, cells, cats, pin: null };
    return () => { node.removeEventListener('click', onClick); ro.disconnect(); map.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const { cells, cats } = m.current;
    cells.clearLayers();
    Object.values(cats).forEach((l) => l.clearLayers());
    for (const h of hotspots) {
      L.rectangle(h.bounds, { color: LEVEL_COLOR[h.level], weight: 1, fillOpacity: 0.12 + h.index / 250 })
        .bindTooltip(`Waste index <b>${h.index}</b> · ${h.level} · ${h.count} open report(s)`, { sticky: true })
        .addTo(cells);
    }
    for (const r of reports) {
      const c = CATEGORIES[r.category] || CATEGORIES.nonbiodegradable;
      L.circleMarker([r.lat, r.lng], {
        radius: RADIUS[r.volume] || 7, color: '#fff', weight: 2, fillColor: r.cleaned ? '#9aa39e' : c.color,
        fillOpacity: r.cleaned ? 0.5 : 0.95, dashArray: r.cleaned ? '3' : null,
      }).bindPopup(() => popupHtml(r), { maxWidth: 240 }).addTo(cats[r.category] || cats.nonbiodegradable);
    }
  }, [reports, hotspots]);

  useEffect(() => {
    const s = m.current;
    if (!pin) { if (s.pin) { s.map.removeLayer(s.pin); s.pin = null; } return; }
    if (s.pin) s.pin.setLatLng([pin.lat, pin.lng]);
    else {
      s.pin = L.marker([pin.lat, pin.lng], { draggable: true, icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [13, 26] }) }).addTo(s.map)
        .on('dragend', (e) => { const p = e.target.getLatLng(); cb.current.onPick(p.lat, p.lng); });
    }
  }, [pin]);

  useEffect(() => {
    if (!focus) return;
    const { map } = m.current;
    if (focus.bounds?.length) map.fitBounds(L.latLngBounds(focus.bounds).pad(0.1));
    else if (focus.lat != null) map.flyTo([focus.lat, focus.lng], focus.zoom || 16);
  }, [focus]);

  return <div ref={el} className="map" role="application" aria-label="Waste map" />;
}
