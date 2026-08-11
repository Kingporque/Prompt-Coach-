import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // Chrome Web Store requires ES2020-compatible output; keep it modern but safe.
    target: 'es2020',
    // Extension pages don't need the modulepreload hints Vite injects into HTML —
    // Chromium flags them in MV3 and the entry <script type="module"> handles loading.
    modulePreload: false,
    rollupOptions: {
      // Keeps generated chunk names stable-ish and readable in dist/.
      output: { chunkFileNames: 'assets/chunk-[hash].js' },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
})
