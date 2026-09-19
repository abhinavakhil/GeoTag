import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, classifyText, classifyPredictions, summarizeDetections, readExifGps, knn, decideCategory } from '../lib/geotag.js';
import { loadDetector, embedMobile, aiClassify, toCanvas, drawBoxes } from '../lib/vision.js';

const pct = (x) => Math.round(x * 100) + '%';
const EMPTY = { dets: null, sum: null, scene: null, ai: null, mobileEmb: null, aiStatus: null, tfStatus: null };

export default function ReportForm({ location, memory, toast, onLocation, onSubmit }) {
  const [photo, setPhoto] = useState(null); // jpeg data URL of the analysed (downscaled) image
  const [st, setSt] = useState(EMPTY); // analysis state, filled in as each model finishes
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('');
  const [picked, setPicked] = useState(false); // user chose a category by hand; never override it
  const [volume, setVolume] = useState('medium');
  const [locating, setLocating] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [over, setOver] = useState(false);
  const preview = useRef(null);
  const runId = useRef(0);
  const fileInput = useRef(null);

  // Combine every signal into one suggestion. Pure data in, suggestion out; recomputed on each update.
  const emb = st.ai ? { m: 'clip', v: st.ai.embedding } : st.mobileEmb ? { m: 'mobilenet', v: st.mobileEmb } : null;
  const pool = emb ? memory.filter((x) => x.m === emb.m) : [];
  const learned = pool.length >= 3 ? knn(pool, emb.v) : null;
  const text = classifyText(note);
  const decision = decideCategory({ learned, learnedMinSim: emb?.m === 'clip' ? 0.75 : 0.6, ai: st.ai, sum: st.sum, scene: st.scene, text });

  useEffect(() => { if (!picked && (photo || text)) setCategory(decision.category || ''); }, [decision.category, picked, photo, text]);

  async function analyze(canvas) {
    const id = ++runId.current;
    const url = canvas.toDataURL('image/jpeg', 0.6);
    setPhoto(url);
    const update = (patch) => { if (id === runId.current) setSt((s) => ({ ...s, ...patch })); }; // a newer photo wins
    setSt({ ...EMPTY, aiStatus: '🤖 Loading the free AI model (about 43 MB, only the first time)…', tfStatus: '🧠 Loading the object detector…' });
    const pv = preview.current; // always mounted (just hidden), so draw now; boxes are added on top later
    pv.width = canvas.width; pv.height = canvas.height;
    pv.getContext('2d').drawImage(canvas, 0, 0);

    loadDetector().then(async ({ det, cls }) => {
      update({ tfStatus: '🔎 Detecting objects…' });
      const [dets, preds, mobileEmb] = await Promise.all([det.detect(canvas, 20, 0.3), cls.classify(canvas, 5), embedMobile(cls, canvas)]);
      if (id === runId.current) drawBoxes(preview.current.getContext('2d'), dets, canvas.width / 480);
      update({ dets, sum: summarizeDetections(dets), scene: classifyPredictions(preds), mobileEmb, tfStatus: null });
    }).catch((e) => { console.error(e); update({ tfStatus: `⚠️ Object detector unavailable (${e.message}).` }); });

    aiClassify(url, (f) => update({ aiStatus: `🤖 Downloading the free AI model… ${pct(f)}` }))
      .then((ai) => update({ ai, aiStatus: null }))
      .catch((e) => { console.error(e); update({ aiStatus: `⚠️ AI model unavailable (${e.message}).` }); });
  }

  async function onFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose an image file.', true);
    const gps = readExifGps(await file.arrayBuffer());
    if (gps) { onLocation({ ...gps, source: 'from photo' }, true); toast('📍 Location read from the photo'); }
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return toast('That image could not be read.', true);
    analyze(toCanvas(bmp, bmp.width, bmp.height));
  }

  function clearPhoto() {
    runId.current++;
    setPhoto(null); setSt(EMPTY);
    if (fileInput.current) fileInput.current.value = '';
  }

  function locate() {
    if (!navigator.geolocation) return toast('Geolocation is not available in this browser.', true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => {
      setLocating(false);
      onLocation({ lat: p.coords.latitude, lng: p.coords.longitude, source: `GPS ±${Math.round(p.coords.accuracy)} m` }, true);
    }, (err) => {
      setLocating(false);
      toast(`Could not get your location: ${err.message}. Tap the map instead.`, true);
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  function submit(e) {
    e.preventDefault();
    if (!location) return toast('Set a location: use GPS or tap the map.', true);
    if (!category) return toast('Pick a category, or add a photo so GeoTag can detect it.', true);
    const sum = st.sum || { items: [] };
    onSubmit({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      lat: location.lat, lng: location.lng, category, volume, note: note.trim().slice(0, 500), photo,
      items: sum.items.map((i) => ({ label: i.label, category: i.category })),
      scene: st.scene && { label: st.scene.label, category: st.scene.category, confidence: st.scene.confidence },
      ai: st.ai && { category: st.ai.category, confidence: st.ai.confidence },
      time: Date.now(), cleaned: false,
    }, emb);
    clearPhoto(); setNote(''); setCategory(''); setPicked(false); setVolume('medium');
  }

  // Analysis read-out
  const lines = [];
  if (st.aiStatus) lines.push(st.aiStatus);
  else if (st.ai?.noWaste) lines.push('🤖 AI: this doesn’t look like waste. Check the photo before tagging.');
  else if (st.ai) lines.push(`🤖 AI: ${st.ai.top.map((t) => `${CATEGORIES[t.category].label} ${pct(t.share)}`).join(' · ')}`);
  if (st.tfStatus) lines.push(st.tfStatus);
  else if (st.dets) {
    const counts = {};
    for (const i of st.sum.items) counts[i.label] = (counts[i.label] || 0) + 1;
    lines.push(st.sum.items.length
      ? `🎯 Detected ${Object.entries(counts).map(([l, n]) => `${n}× ${l}`).join(', ')}`
      : `🎯 No individual items found${st.dets.length ? ` (saw ${[...new Set(st.dets.map((d) => d.class))].join(', ')})` : ''}`);
    if (st.scene) lines.push(`🖼️ Scene: ${st.scene.label} ${pct(st.scene.confidence)} → ${CATEGORIES[st.scene.category].label}`);
  }
  if (photo && learned) lines.push(`🧬 Your ${pool.length} past photos suggest ${CATEGORIES[learned.category].label} (${pct(learned.confidence)}${decision.trusted ? '' : ', low confidence'})`);
  if (st.sum?.mixed) lines.push(`⚠️ Mixed waste: ${st.sum.categories.map((c) => CATEGORIES[c].label).join(' + ')}. Separate these before disposal.`);
  const final = decision.category && CATEGORIES[decision.category];
  if (photo && final) lines.push(`♻️ ${final.label}, ${final.bin}. ${final.tip}`);
  else if (photo && !st.aiStatus && !st.tfStatus) lines.push('❓ Could not tell the category. Pick one below and GeoTag will learn it for next time.');
  if (!photo && text && !picked) lines.push(`✍️ Sounds like ${CATEGORIES[text.category].label} (matched “${text.keyword}”).`);

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Report waste <small>Takes about 10 seconds</small></h2>

      <div className="field">
        <span className="label">Photo</span>
        <label className={'drop' + (over ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
          <input ref={fileInput} type="file" accept="image/*" aria-label="Upload a photo of the waste" onChange={(e) => onFile(e.target.files[0])} />
          <canvas ref={preview} hidden={!photo} />
          {!photo && <span>📷 <b>Drop a photo</b> or tap to take one<br /><small>Free AI runs on your device. Photos never leave it.</small></span>}
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCamOpen(true)}>🎥 Live scan</button>
          {photo && <button type="button" className="btn btn-ghost btn-sm" onClick={clearPhoto}>Remove photo</button>}
        </div>
        {lines.length > 0 && <div className="ai" aria-live="polite">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>}
      </div>

      <div className="field">
        <label htmlFor="note">What’s there? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional, also used for sorting)</span></label>
        <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. plastic bottles and food waste near the bus stop" />
      </div>

      <div className="field">
        <span className="label" id="cat-label">Category</span>
        <div className="seg" role="radiogroup" aria-labelledby="cat-label">
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <label key={k}><input type="radio" name="category" value={k} checked={category === k} onChange={() => { setCategory(k); setPicked(true); }} />
              <span className="dot" style={{ background: c.color }} />{c.label}</label>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label" id="vol-label">How much?</span>
        <div className="seg three" role="radiogroup" aria-labelledby="vol-label">
          {[['small', '🛍️ Small', 'a bag'], ['medium', '🗑️ Medium', 'a pile'], ['large', '🚛 Large', 'a dump']].map(([v, l, s]) => (
            <label key={v}><input type="radio" name="volume" value={v} checked={volume === v} onChange={() => setVolume(v)} />{l}<small>{s}</small></label>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Location</span>
        <div className="loc">
          <button type="button" className="btn btn-ghost btn-sm" onClick={locate}>{locating ? 'Locating…' : '📍 Use my location'}</button>
          <span>{location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} · ${location.source}` : 'or tap the map'}</span>
        </div>
      </div>

      <div className="submit"><button className="btn btn-primary">Tag this waste</button></div>
      {camOpen && <LiveScan onClose={() => setCamOpen(false)} onCapture={(c) => { setCamOpen(false); analyze(c); }} />}
    </form>
  );
}

function LiveScan({ onClose, onCapture }) {
  const dlg = useRef(null), video = useRef(null), overlay = useRef(null);
  const [status, setStatus] = useState('Starting camera…');

  useEffect(() => {
    let stream = null, alive = true;
    dlg.current.showModal();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive) return;
        const v = video.current;
        v.srcObject = stream; await v.play();
        setStatus('Loading the object detector…');
        const { det } = await loadDetector();
        const ctx = overlay.current.getContext('2d');
        while (alive) {
          if (v.videoWidth) {
            const dets = await det.detect(v, 20, 0.35);
            if (!alive) break;
            overlay.current.width = v.videoWidth; overlay.current.height = v.videoHeight;
            drawBoxes(ctx, dets, v.videoWidth / 640);
            const s = summarizeDetections(dets);
            setStatus(s.items.length ? `${s.items.length} waste item(s) · mostly ${CATEGORIES[s.category].label}${s.mixed ? ' · mixed' : ''}` : 'Point the camera at the waste…');
          }
          await new Promise(requestAnimationFrame);
        }
      } catch (e) {
        setStatus('Camera error: ' + e.message);
      }
    })();
    return () => { alive = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const capture = () => {
    const v = video.current;
    if (v.videoWidth) onCapture(toCanvas(v, v.videoWidth, v.videoHeight));
  };

  return (
    <dialog ref={dlg} className="cam" onClose={onClose}>
      <div style={{ position: 'relative' }}>
        <video ref={video} playsInline muted style={{ width: '100%', display: 'block' }} />
        <canvas ref={overlay} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div className="cam-status">{status}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: 12, background: 'var(--ink)' }}>
        <button type="button" className="btn btn-green" onClick={capture}>Capture & analyse</button>
        <button type="button" className="btn btn-ghost" onClick={() => dlg.current.close()}>Close</button>
      </div>
    </dialog>
  );
}
