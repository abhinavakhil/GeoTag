// localStorage persistence. Every read/write is guarded: private mode or a full quota must never crash the app.
// ponytail: one browser = one map. Swap for a backend when reports need to be shared between devices.
export const KEYS = { reports: 'geotag.reports', alerted: 'geotag.alerted', places: 'geotag.places', memory: 'geotag.memory',
  tickets: 'geotag.tickets', wards: 'geotag.wards', history: 'geotag.history', queue: 'geotag.queue' };

export const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
export const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// On a full quota, drop the oldest photos rather than losing reports. Returns false if it still doesn't fit.
export function saveReports(reports) {
  const copy = reports.map((r) => ({ ...r }));
  while (!store(KEYS.reports, copy)) {
    const withPhoto = copy.find((r) => r.photo);
    if (!withPhoto) return false;
    delete withPhoto.photo;
  }
  return true;
}

/* k-NN memory of labelled image embeddings. m = model that produced the vector; different models are never compared. */
const MEMORY_MAX = 150; // ponytail: ~1 MB of localStorage; move to IndexedDB if more is needed
const f32ToB64 = (f) => btoa(String.fromCharCode(...new Uint8Array(f.buffer)));
const b64ToF32 = (s) => new Float32Array(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);

export const loadMemory = () => load(KEYS.memory, []).map((x) => ({ c: x.c, m: x.m || 'mobilenet', v: b64ToF32(x.v) }));

export function saveMemory(memory) {
  let kept = memory.slice(-MEMORY_MAX);
  const persist = () => store(KEYS.memory, kept.map((x) => ({ c: x.c, m: x.m, v: f32ToB64(x.v) })));
  if (!persist()) { kept = kept.slice(-30); persist(); }
  return kept;
}
