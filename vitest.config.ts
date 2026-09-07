import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': `${srcDir}/shared`,
      '@client': `${srcDir}/client`,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/frontend/setup.ts'],
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
});