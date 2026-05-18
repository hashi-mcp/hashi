import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  // Keep these as runtime deps — they're installed in this example's node_modules.
  external: ['@hashi-mcp/core', '@hashi-mcp/server', 'obs-websocket-js'],
  banner: { js: '#!/usr/bin/env node' },
})
