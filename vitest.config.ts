import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@config': path.resolve(__dirname, 'src/config'),
      '@common': path.resolve(__dirname, 'src/common'),
      '@tools': path.resolve(__dirname, 'src/tools'),
      '@resources': path.resolve(__dirname, 'src/resources'),
      '@prompts': path.resolve(__dirname, 'src/prompts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/__tests__/**'],
    },
  },
});
