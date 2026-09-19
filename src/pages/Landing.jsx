import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CATEGORIES, LEVEL_COLOR, classifyText, hotspots } from '../lib/geotag.js';
import { KEYS, load } from '../lib/storage.js';
import Globe from '../components/Globe.jsx';
import '../landing.css';

const EXAMPLES = {
  biodegradable: 'Food scraps, peels, leaves, tea bags', plastic: 'Bottles, bags, cups, sachets', paper: 'Cartons, newspaper, boxes',
  glass: 'Beer & wine bottles, jars', metal: 'Cans, foil, scrap, wire', ewaste: 'Phones, chargers, cables, laptops',
  hazardous: 'Batteries, medicine, syringes, paint', nonbiodegradable: 'Thermocol, diapers, chip packets, rubber',
};

// Fade sections in as they scroll into view. Content stays visible without JS or with reduced motion (see landing.css).
function useReveal() {
  useEffect(() => {
    document.documentElement.classList.add('js');
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Counts up from 0 the first time it scrolls into view. Shows the final value with reduced motion.
function Count({ to, dp = 0, suffix = '' }) {
  const ref = useRef(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1400;
      const tick = (t) => { const k = Math.min(1, (t - t0) / dur); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [to]);
  return <b ref={ref}>{v.toFixed(dp)}{suffix}</b>;
}

export default function Landing() {
  useReveal();
  return (
    <div className="landing">
      <nav className="nav">
        <div className="wrap">
          <Link className="logo" to="/"><span className="logo-mark" /><span>Geo<b>Tag</b></span></Link>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#ai">AI-first</a>
            <a href="#sort">Segregation</a>
            <a href="#index">Waste index</a>
          </div>
          <Link className="btn btn-primary btn-sm" to="/app">Open live map</Link>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap hero-copy">
          <span className="pill"><i />AI-first waste mapping · free, on-device</span>
          <h1>Every pile of waste,<br /><em className="accent">on the map.</em></h1>
          <p className="lead">GeoTag is AI-first. Snap a photo and AI identifies the waste, sorts it into 8 streams and names the right bin, all on your phone. GeoTag also pins the location
            and scores every block on a live waste index, so crews get to the worst places first.</p>
          <div className="cta-row">
            <Link className="btn btn-primary btn-lg" to="/app">Report waste now</Link>
            <a className="btn btn-ghost btn-lg" href="#how">See how it works</a>
          </div>
        </div>
        <div className="wrap strip">
          <div><span>Waste streams</span><b>8</b></div>
          <div><span>Index resolution</span><b>~500 m</b></div>
          <div><span>On-device AI cost</span><b><i className="live" />₹0</b></div>
        </div>
        <div className="globe-wrap">
          <Globe />
          <p className="globe-note">Illustrative feed. Your own reports appear on the live map.</p>
        </div>
      </header>

      <div className="ticker" aria-hidden="true">
        <b><i className="live" />Sorting into</b>
        <div className="ticker-track">
          {[0, 1].map((n) => Object.entries(CATEGORIES).map(([k, c]) => (
            <span key={k + n}><i style={{ background: c.color }} />{c.label}<em>{c.bin}</em></span>
          )))}
        </div>
      </div>

      <Stats />

      <section id="problem" className="wrap">
        <div className="head center reveal">
          <h2>Waste is growing <em className="accent">faster than we track it</em></h2>
        </div>
        <div className="facts reveal">
          <div style={{ '--i': 0 }}><Count to={2.01} dp={2} suffix=" bn" /><p>tonnes of municipal solid waste generated worldwide each year.</p></div>
          <div style={{ '--i': 1 }}><Count to={33} suffix="%" /><p>of it is not managed in an environmentally safe way.</p></div>
          <div style={{ '--i': 2 }}><Count to={3.4} dp={2} suffix=" bn" /><p>tonnes a year expected by 2050 if nothing changes.</p></div>
        </div>
        <p className="source">Source: World Bank, <i>What a Waste 2.0</i> (2018).</p>
      </section>

      <section id="how" className="tint">
        <div className="wrap">
          <div className="head center reveal">
            <h2>From photo to cleanup in <em className="accent">four steps</em></h2>
            <p>No hardware and no special setup. Any phone with a camera can do it.</p>
          </div>
          <div className="steps reveal">
            {[
              ['Tag', 'Take a photo or use the live scanner. The location comes from GPS, from the photo itself, or from a pin you drop.'],
              ['Segregate', 'AI does the sorting. It puts the waste into one of 8 streams, names the right bin and flags mixed waste.'],
              ['Map', 'Reports are grouped into ~500 m cells. Each cell is scored by volume, how harmful the waste is and how recent it is.'],
              ['Alert', 'When a cell gets worse, you get an alert so crews can go to the worst places first.'],
            ].map(([t, d], i) => (
              <div className="step" key={t} style={{ '--i': i }}><span className="n">0{i + 1}</span><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai" className="wrap">
        <div className="ai-grid">
          <div className="reveal">
            <div className="kicker">AI-first, by design</div>
            <h2 className="h2">Three models. <em className="accent">Zero cost.</em> No photos uploaded.</h2>
            <p className="muted">Every photo goes through three open models that run inside your browser. There's no API key, no server
              and no bill. Each photo you label also teaches GeoTag what waste looks like in your area.</p>
            <ul className="ticks">
              <li>Works on any modern phone or laptop</li>
              <li>About 45 MB downloaded once, then cached</li>
              <li>Photos never leave your device</li>
            </ul>
          </div>
          <div className="pipe reveal">
            <div className="pipe-card" style={{ '--i': 0 }}><span className="ico">🧠</span><div><b>MobileCLIP zero-shot</b><small>Reads the whole scene and scores all 8 waste streams</small></div><em>on device</em></div>
            <div className="pipe-card" style={{ '--i': 1 }}><span className="ico">🎯</span><div><b>COCO-SSD detection</b><small>Draws a box around every bottle, can and phone</small></div><em>on device</em></div>
            <div className="pipe-card" style={{ '--i': 2 }}><span className="ico">🧬</span><div><b>Your k-NN memory</b><small>Learns from every photo you label</small></div><em>learns</em></div>
            <div className="pipe-card out" style={{ '--i': 3 }}><span className="ico">♻️</span><div><b>Plastic · Blue bin</b><small>Rinse, flatten, recycle. Mixed waste is flagged.</small></div></div>
          </div>
        </div>
      </section>

      <Sorter />
      <IndexCalculator />

      <section id="features" className="wrap">
        <div className="head center reveal"><h2>Built for streets, <em className="accent">not spreadsheets</em></h2></div>
        <div className="bento reveal">
          <div className="tile wide dark" style={{ '--i': 0 }}><span className="ico">📍</span><h3>Geo-tagging</h3><p>Uses your phone's GPS, reads the location stored in a photo, or lets you drag a pin. Every report lands exactly where the waste is.</p></div>
          <div className="tile wide mint" style={{ '--i': 1 }}><span className="ico">🎥</span><h3>Live camera scan</h3><p>Point your camera at a pile and see labelled boxes appear in real time. Tap to capture and file the report.</p></div>
          <div className="tile" style={{ '--i': 2 }}><span className="ico">🌡️</span><h3>Waste-index heatmap</h3><p>Every block gets a 0–100 score. Hazardous waste and large dumps count more.</p></div>
          <div className="tile" style={{ '--i': 3 }}><span className="ico">🔔</span><h3>Escalation alerts</h3><p>You're notified the moment an area turns high or critical. Improvements never trigger alerts.</p></div>
          <div className="tile" style={{ '--i': 4 }}><span className="ico">🧹</span><h3>Close the loop</h3><p>Mark spots as cleaned, watch the index fall, and export a CSV for your ward office.</p></div>
        </div>
      </section>

      <section className="tint">
        <div className="wrap">
          <div className="head center reveal"><h2>One map, <em className="accent">three kinds of heroes</em></h2></div>
          <div className="who reveal">
            <div style={{ '--i': 0 }}><h3>Citizens</h3><p>Report a dump in 10 seconds and learn which bin things go in.</p></div>
            <div style={{ '--i': 1 }}><h3>Municipalities</h3><p>Send trucks where the index is highest, not where they went yesterday.</p></div>
            <div style={{ '--i': 2 }}><h3>NGOs & RWAs</h3><p>Plan cleanup drives around real hotspots and show the drop in the index afterwards.</p></div>
          </div>
        </div>
      </section>

      <section className="wrap faq-wrap">
        <div className="head center reveal"><h2>Questions, <em className="accent">answered</em></h2></div>
        <div className="faq reveal">
          {[
            ['Is the AI really free?', 'Yes. The models are open source and run in your browser. You download about 45 MB the first time. After that, sorting a photo takes under a second and costs nothing.'],
            ['Where do my photos go?', 'Nowhere. Photos are analysed and stored on your device. Reports are saved in this browser, and you can export them as CSV whenever you like.'],
            ['How accurate is the sorting?', 'Sorting clear photos into the 8 streams works well. Messy mixed piles are harder, so you always confirm or change the category before saving. Your corrections train your own memory and improve future suggestions.'],
            ['How is the waste index calculated?', 'Each open report adds its volume × how harmful the waste is (hazardous counts most) × how recent it is (weight halves every 7 days). Scores run from 0 to 100 per ~500 m block.'],
          ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 0 }}>
        <div className="cta reveal">
          <h2>Your street, <em className="accent">mapped by tonight.</em></h2>
          <p>Open the live map, load the demo data or tag your first pile. It works in any modern browser.</p>
          <Link className="btn btn-primary btn-lg" to="/app">Open GeoTag</Link>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <Link className="logo" to="/" style={{ fontSize: 17 }}><span className="logo-mark" style={{ width: 24, height: 24 }} /><span>Geo<b>Tag</b></span></Link>
          <span>Map data © OpenStreetMap contributors · AI by TensorFlow.js & Transformers.js</span>
        </div>
      </footer>
    </div>
  );
}

function Stats() {
  const [n, setN] = useState({ reports: 0, hot: 0, clean: 0 });
  useEffect(() => {
    const rs = load(KEYS.reports, []);
    setN({ reports: rs.length, hot: hotspots(rs).filter((h) => h.index >= 40).length, clean: rs.filter((r) => r.cleaned).length });
  }, []);
  if (!n.reports) return null; // only show real numbers from this browser's map
  return (
    <div className="mystats wrap">
      <span>On your map</span>
      <div><b>{n.reports}</b> reports</div><div><b>{n.hot}</b> areas on alert</div><div><b>{n.clean}</b> cleaned</div>
      <Link to="/app">Open →</Link>
    </div>
  );
}

function Sorter() {
  const [q, setQ] = useState('');
  const hit = q.trim() ? classifyText(q) : null;
  const c = hit && CATEGORIES[hit.category];
  return (
    <section id="sort" className="tint">
      <div className="wrap">
        <div className="head center reveal">
          <h2>Which bin? <em className="accent">Ask the sorter.</em></h2>
          <p>Type any item. In the app, the same engine works together with the camera.</p>
        </div>
        <div className="sorter reveal">
          <div className="try">
            <label htmlFor="try-in" className="lbl">Waste item</label>
            <input id="try-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. chip packet, old phone, banana peel" autoComplete="off" />
            <div className="try-result" aria-live="polite">
              {!q.trim() ? <span className="muted">Type an item to see its category.</span>
                : c ? <><div className="tag" style={{ color: c.color }}>{c.label}</div><div>{c.bin}. {c.tip}</div></>
                  : <><div className="tag">Hmm, not sure yet</div><span className="muted">Try a more common name, or snap a photo in the app.</span></>}
            </div>
            <div className="chips">
              {['plastic bottle', 'banana peel', 'old charger', 'batteries', 'thermocol', 'pizza box'].map((t) => <button key={t} onClick={() => setQ(t)}>{t}</button>)}
            </div>
          </div>
          <div className="cats">
            {Object.entries(CATEGORIES).map(([k, cat], i) => (
              <div key={k} className={'cat' + (hit?.category === k ? ' hit' : '')} style={{ '--c': cat.color, '--i': i }}>
                <span className="bin">{cat.bin}</span><h3>{cat.label}</h3><p>{EXAMPLES[k]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IndexCalculator() {
  const [cat, setCat] = useState('plastic');
  const [vol, setVol] = useState('medium');
  const [count, setCount] = useState(3);
  const [age, setAge] = useState(2);
  const h = useMemo(() => {
    const now = Date.now();
    const rs = Array.from({ length: count }, () => ({ lat: 28.6139, lng: 77.209, category: cat, volume: vol, time: now - age * 86400000 }));
    return hotspots(rs, now)[0];
  }, [cat, vol, count, age]);
  const LABEL = { low: 'Low · routine collection', moderate: 'Moderate · watch list', high: 'High · alert sent', critical: 'Critical · send a crew now' };
  return (
    <section id="index" className="wrap">
      <div className="head center reveal">
        <h2>One number per block, <em className="accent">and it means something</em></h2>
        <p>Try it yourself. This is the same formula the live map uses.</p>
      </div>
      <div className="calc reveal">
        <div className="calc-in">
          <div><label htmlFor="c-cat" className="lbl">Waste type</label>
            <select id="c-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
              {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select></div>
          <div><span className="lbl">Size of each pile</span>
            <div className="vol">{['small', 'medium', 'large'].map((v) => (
              <label key={v}><input type="radio" name="c-vol" checked={vol === v} onChange={() => setVol(v)} />{v[0].toUpperCase() + v.slice(1)}</label>))}</div></div>
          <div><label htmlFor="c-n" className="lbl">Open reports in the block <output>{count}</output></label>
            <input id="c-n" type="range" min="1" max="10" value={count} onChange={(e) => setCount(+e.target.value)} /></div>
          <div><label htmlFor="c-age" className="lbl">Days since reported <output>{age}</output></label>
            <input id="c-age" type="range" min="0" max="30" value={age} onChange={(e) => setAge(+e.target.value)} /></div>
        </div>
        <div className="calc-out">
          <span className="lbl">Waste index</span>
          <div className="big" style={{ color: LEVEL_COLOR[h.level] }}>{h.index}</div>
          <div className="lvl">{LABEL[h.level]}</div>
          <div className="gauge"><i style={{ left: `${h.index}%` }} /></div>
          <p>volume × how harmful × how recent, summed over the block. Weight halves every 7 days.</p>
        </div>
      </div>
    </section>
  );
}
