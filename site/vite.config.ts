import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fumadocsMdx } from 'fumadocs-mdx/vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    fumadocsMdx(),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    // The docs render the real components from the repo root, so they cannot drift from the package.
    // One copy of React, or the components' hooks run against a different React than the page.
    dedupe: ['react', 'react-dom', 'zod'],
    alias: [
      { find: /^orlune\/styles\.css$/, replacement: at('../src/styles.css') },
      { find: /^orlune\/openui$/, replacement: at('../src/openui/index.ts') },
      { find: /^orlune\/verify$/, replacement: at('../src/verify/index.ts') },
      { find: /^orlune$/, replacement: at('../src/index.ts') },
      { find: /^@demo\//, replacement: at('../demo') + '/' },
      { find: 'tslib', replacement: 'tslib/tslib.es6.js' },
    ],
  },
  ssr: {
    noExternal: ['fumadocs-core', 'fumadocs-ui', 'fumadocs-mdx'],
  },
});
