// Optional shared backend on Supabase. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY everything stays in localStorage.
// Reports are written locally first, then pushed; anything that fails to push is queued and retried when back online.
import { KEYS, load, store } from './storage.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const enabled = !!(URL_ && KEY);
let client = null;
async function sb() {
  if (!enabled) return null;
  if (!client) { const { createClient } = await import('@supabase/supabase-js'); client = createClient(URL_, KEY); }
  return client;
}

export const ROLE_RANK = { anon: 0, citizen: 1, crew: 2, officer: 3, admin: 4 };
export const can = (role, need) => (ROLE_RANK[role] || 0) >= ROLE_RANK[need];

/* auth */
export async function signIn(email) {
  const s = await sb();
  const { error } = await s.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/app' } });
  if (error) throw error;
}
export async function signOut() { const s = await sb(); await s.auth.signOut(); }
// cb({user, role}) now and on every change. Returns unsubscribe.
export async function onAuth(cb) {
  const s = await sb();
  if (!s) return () => {};
  const emit = async (session) => {
    const user = session?.user || null;
    let role = user ? 'citizen' : 'anon';
    if (user) { const { data } = await s.from('profiles').select('role').eq('id', user.id).maybeSingle(); role = data?.role || 'citizen'; }
    cb({ user, role });
  };
  emit((await s.auth.getSession()).data.session);
  const { data } = s.auth.onAuthStateChange((_e, session) => emit(session));
  return () => data.subscription.unsubscribe();
}

/* row <-> report */
const toRow = (r) => ({ id: r.id, lat: r.lat, lng: r.lng, category: r.category, volume: r.volume, note: r.note || '', photo: r.photo || null,
  items: r.items || [], scene: r.scene || null, ai: r.ai || null, time: r.time, cleaned: !!r.cleaned, cleaned_at: r.cleanedAt || null,
  verified: !!r.verified, sightings: r.sightings || 1, demo: !!r.demo });
const fromRow = (x) => ({ id: x.id, lat: x.lat, lng: x.lng, category: x.category, volume: x.volume, note: x.note || '', photo: x.photo || null,
  items: x.items || [], scene: x.scene, ai: x.ai, time: Number(x.time), cleaned: x.cleaned, cleanedAt: x.cleaned_at ? Number(x.cleaned_at) : undefined,
  verified: x.verified, sightings: x.sightings, demo: x.demo, userId: x.user_id });
const ticketFromRow = (t) => ({ key: t.key, openedAt: Number(t.opened_at), assignee: t.assignee || '', due: t.due, closedAt: t.closed_at ? Number(t.closed_at) : null });
const ticketToRow = (t) => ({ key: t.key, opened_at: t.openedAt, assignee: t.assignee || '', due: t.due || null, closed_at: t.closedAt });

/* data */
export async function pullAll() {
  const s = await sb();
  const [r, t, w] = await Promise.all([s.from('reports').select('*').order('time'), s.from('tickets').select('*'), s.from('wards').select('geojson').maybeSingle()]);
  if (r.error) throw r.error;
  return { reports: r.data.map(fromRow), tickets: Object.fromEntries((t.data || []).map((x) => [x.key, ticketFromRow(x)])), wards: w.data?.geojson || null };
}

// Offline queue: ids of reports that still need pushing. ponytail: one retry pass per flush, no backoff.
const queue = () => new Set(load(KEYS.queue, []));
const setQueue = (q) => store(KEYS.queue, [...q]);
export async function pushReport(r) {
  const q = queue(); q.add(r.id); setQueue(q);
  return flush([r]);
}
export async function deleteReport(id) {
  const s = await sb(); const q = queue(); q.delete(id); setQueue(q);
  const { error } = await s.from('reports').delete().eq('id', id);
  if (error) throw error;
}
export async function flush(reports) {
  const s = await sb(); const q = queue();
  const pending = reports.filter((r) => q.has(r.id));
  if (!pending.length) return 0;
  const { error } = await s.from('reports').upsert(pending.map(toRow));
  if (error) throw error;
  pending.forEach((r) => q.delete(r.id)); setQueue(q);
  return pending.length;
}
export const pendingCount = () => queue().size;

export async function pushTicket(t) { const s = await sb(); const { error } = await s.from('tickets').upsert(ticketToRow(t)); if (error) throw error; }
export async function pushWards(geojson) {
  const s = await sb();
  const { error } = geojson ? await s.from('wards').upsert({ id: 1, geojson }) : await s.from('wards').delete().eq('id', 1);
  if (error) throw error;
}

// Live changes from other devices. cb({table, type, row}). Returns unsubscribe.
export async function subscribe(cb) {
  const s = await sb();
  const ch = s.channel('geotag')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (p) => cb({ table: 'reports', type: p.eventType, row: p.new?.id ? fromRow(p.new) : null, id: p.old?.id }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (p) => cb({ table: 'tickets', type: p.eventType, row: p.new?.key ? ticketFromRow(p.new) : null, id: p.old?.key }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wards' }, (p) => cb({ table: 'wards', type: p.eventType, row: p.new?.geojson || null }))
    .subscribe();
  return () => s.removeChannel(ch);
}
