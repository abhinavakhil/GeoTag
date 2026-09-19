import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../lib/geotag.js';

// Illustrative feed for the hero (the landing page says so under the globe).
const FEED = [
  ['Plastic tagged in Pune', 18.52, 73.86, 'plastic'],
  ['E-waste sorted in Bengaluru', 12.97, 77.59, 'ewaste'],
  ['Hotspot alert in Delhi', 28.61, 77.21, 'hazardous'],
  ['Area cleaned in Kochi', 9.93, 76.27, 'biodegradable'],
  ['Glass sorted in Kolkata', 22.57, 88.36, 'glass'],
  ['Cardboard tagged in Jaipur', 26.91, 75.79, 'paper'],
  ['Scrap metal in Hyderabad', 17.39, 78.49, 'metal'],
  ['Thermocol tagged in Ahmedabad', 23.02, 72.57, 'nonbiodegradable'],
  ['Batteries flagged in Lucknow', 26.85, 80.95, 'hazardous'],
  ['Food waste in Guwahati', 26.14, 91.74, 'biodegradable'],
  ['Plastic tagged in Chennai', 13.08, 80.27, 'plastic'],
];
const RAD = Math.PI / 180;

// Dotted orthographic globe centred on India, drawn on a canvas; land dots are precomputed (src/data/dots.json).
export default function Globe() {
  const box = useRef(null), canvas = useRef(null), pill = useRef(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // static globe: keep one pill still
    const t = setInterval(() => setActive((a) => (a + 1) % FEED.length), 2400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let dots = null, raf = 0, alive = true;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = canvas.current, ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = box.current.clientWidth; H = box.current.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box.current);
    resize();

    function frame(now) {
      if (!alive) return;
      const lam0 = (80 + (reduce ? 0 : Math.sin(now / 9000) * 7)) * RAD, phi0 = 6 * RAD;
      // Size the globe so India sits in the lower-middle of the box, like a horizon.
      const R = Math.max(H * 0.78, W * 0.44), cx = W / 2, cy = H * 0.54 + 0.29 * R;
      const sp0 = Math.sin(phi0), cp0 = Math.cos(phi0);
      const proj = (lat, lng) => {
        const p = lat * RAD, l = lng * RAD - lam0, cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l);
        const z = sp0 * sp + cp0 * cp * cl;
        return [cx + R * cp * Math.sin(l), cy - R * (cp0 * sp - sp0 * cp * cl), z];
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.5, R * 0.1, cx, cy, R);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e3f5e9');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(31,138,85,.18)'; ctx.lineWidth = 1; ctx.stroke();

      // graticule
      ctx.strokeStyle = 'rgba(31,138,85,.10)';
      for (let lat = -60; lat <= 75; lat += 15) line((t) => [lat, t], -180, 180);
      for (let lng = -180; lng < 180; lng += 15) line((t) => [t, lng], -80, 80);
      function line(f, a, b) {
        ctx.beginPath(); let on = false;
        for (let t = a; t <= b; t += 2) {
          const [x, y, z] = proj(...f(t));
          if (z > 0) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false;
        }
        ctx.stroke();
      }

      if (dots) {
        for (let i = 0; i < dots.length; i += 3) {
          const [x, y, z] = proj(dots[i] / 10, dots[i + 1] / 10);
          if (z <= 0 || y < -4 || y > H + 4) continue;
          const india = dots[i + 2] === 1, s = (india ? 2.3 : 1.2) + 1.2 * z;
          ctx.fillStyle = india ? `rgba(17,26,20,${0.6 + 0.4 * z})` : `rgba(50,92,68,${0.18 + 0.4 * z})`;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }

      // pulsing report dots + the active pill
      FEED.forEach(([, lat, lng, cat], i) => {
        const [x, y, z] = proj(lat, lng);
        if (z <= 0) return;
        const c = CATEGORIES[cat].color, phase = ((now / 1600) + i * 0.37) % 1;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
        if (!reduce) {
          ctx.globalAlpha = 1 - phase;
          ctx.strokeStyle = c; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, 3.5 + phase * 16, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (i === activeRef.current && pill.current) pill.current.style.transform = `translate(${x}px, ${y}px)`;
      });

      if (!reduce || !dots) raf = requestAnimationFrame(frame);
    }
    import('../data/dots.json').then((m) => { dots = m.default; if (reduce) raf = requestAnimationFrame(frame); });
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const [text, , , cat] = FEED[active];
  return (
    <div className="globe" ref={box} aria-hidden="true">
      <canvas ref={canvas} />
      <div className="globe-pill" ref={pill}>
        <span key={active}><i style={{ background: CATEGORIES[cat].color }} />{text}</span>
      </div>
    </div>
  );
}
