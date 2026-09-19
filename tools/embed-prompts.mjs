// Precomputes MobileCLIP text embeddings for AI_PROMPTS in src/lib/geotag.js -> src/data/ai-prompts.json,
// so the browser only downloads the small vision half of the model.
// Re-run after editing AI_PROMPTS:  npm run embed
import { writeFileSync } from 'fs';

import * as T from '@huggingface/transformers';
const G = await import('../src/lib/geotag.js');
const MODEL = 'Xenova/mobileclip_s1';

const tokenizer = await T.AutoTokenizer.from_pretrained(MODEL);
const textModel = await T.CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'fp32' });
const inputs = tokenizer(G.AI_LABELS.map((l) => `a photo of ${l}`), { padding: 'max_length', truncation: true });
const { text_embeds } = await textModel(inputs);
const embeds = text_embeds.normalize().tolist().map((v) => v.map((x) => +x.toFixed(5)));

writeFileSync(new URL('../src/data/ai-prompts.json', import.meta.url), JSON.stringify({ model: MODEL, labels: G.AI_LABELS, embeds }));
console.log(`wrote ${embeds.length} prompt embeddings (${embeds[0].length}-d) for ${MODEL}`);
