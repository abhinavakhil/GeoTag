// Browser-only vision: every model runs on the device, is lazy-loaded and cached after the first download.
import { CATEGORIES, classifyText, scoreZeroShot } from './geotag.js';
import prompts from '../data/ai-prompts.json';

/* Object detector (COCO-SSD) + ImageNet scene classifier (MobileNet) via TensorFlow.js. */
let detectorPromise = null;
export function loadDetector() {
  return detectorPromise ||= (async () => {
    await import('@tensorflow/tfjs');
    const [cocoSsd, mobilenet] = await Promise.all([import('@tensorflow-models/coco-ssd'), import('@tensorflow-models/mobilenet')]);
    const [det, cls] = await Promise.all([cocoSsd.load({ base: 'lite_mobilenet_v2' }), mobilenet.load({ version: 2, alpha: 1 })]);
    return { det, cls };
  })().catch((e) => { detectorPromise = null; throw e; });
}

export async function embedMobile(cls, canvas) {
  const t = cls.infer(canvas, true);
  const v = await t.data();
  t.dispose();
  return v;
}

/* Free AI: MobileCLIP-S1 zero-shot. Text prompts are pre-embedded (npm run embed), so only the ~43 MB vision model downloads. */
const AI_MODEL = 'Xenova/mobileclip_s1';
let aiPromise = null;
let onAiProgress = () => {};
export function loadAi() {
  return aiPromise ||= (async () => {
    const T = await import('@huggingface/transformers');
    const files = {};
    const progress_callback = (p) => {
      if (p.status !== 'progress' || !(p.total > 1e6)) return; // only the weights, not tiny config files
      files[p.file] = p;
      const all = Object.values(files);
      onAiProgress(all.reduce((s, f) => s + f.loaded, 0) / all.reduce((s, f) => s + f.total, 0));
    };
    const [processor, vision] = await Promise.all([
      T.AutoProcessor.from_pretrained(AI_MODEL),
      T.CLIPVisionModelWithProjection.from_pretrained(AI_MODEL, { dtype: 'fp16', progress_callback }), // q8 breaks MobileCLIP accuracy
    ]);
    return { T, processor, vision };
  })().catch((e) => { aiPromise = null; throw e; });
}

export async function aiClassify(dataUrl, onProgress = () => {}) {
  onAiProgress = onProgress;
  const { T, processor, vision } = await loadAi();
  const { image_embeds } = await vision(await processor(await T.RawImage.fromURL(dataUrl)));
  const v = Float32Array.from(image_embeds.normalize().tolist()[0]);
  return { ...scoreZeroShot(v, prompts), embedding: v };
}

/* Canvas helpers */
// Downscale any image source to max 480 px; the same pixels are analysed, previewed and stored.
export function toCanvas(src, w, h) {
  const k = Math.min(1, 480 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function drawBoxes(ctx, dets, scale = 1) {
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.font = `600 ${Math.round(14 * scale)}px Figtree, sans-serif`;
  for (const d of dets) {
    const hit = classifyText(d.class);
    const color = hit ? CATEGORIES[hit.category].color : 'rgba(255,255,255,.55)';
    const [x, y, w, h] = d.bbox;
    ctx.strokeStyle = color; ctx.strokeRect(x, y, w, h);
    const text = `${d.class} ${Math.round(d.score * 100)}%${hit ? ' · ' + CATEGORIES[hit.category].label : ''}`;
    const tw = ctx.measureText(text).width + 10, th = 20 * scale;
    ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - th), tw, th);
    ctx.fillStyle = '#fff'; ctx.fillText(text, x + 5, Math.max(0, y - th) + th * 0.72);
  }
}
