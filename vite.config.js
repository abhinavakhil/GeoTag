import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@huggingface/transformers'] }, // ships its own wasm; pre-bundling breaks it
});
