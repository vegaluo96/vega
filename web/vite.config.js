import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// 开发时把 /api 与 /health 代理到本地 vega daemon；生产同源由 Caddy/daemon 托管静态产物。
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/health': 'http://127.0.0.1:8787',
    },
  },
});
