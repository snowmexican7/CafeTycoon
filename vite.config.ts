/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  base: '/CafeTycoon/',
  worker: { format: 'es' },
  // The package version, shown on the title screen and as window.cafetycoon.version (live-site checks).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // CI runners are ~2x slower than a dev laptop; whole-week sim tests also set 30 s explicitly.
  test: { include: ['src/**/*.test.ts'], testTimeout: 15_000 },
});
