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
      '@examples': path.resolve(__dirname, 'src/examples'),
      '@db': path.resolve(__dirname, 'src/db'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@jobs': path.resolve(__dirname, 'src/jobs'),
      '@providers': path.resolve(__dirname, 'src/providers'),
    },
  },
  test: {
    environment: 'node',
    env: { LOG_LEVEL: 'silent' },
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/__tests__/**'],
    },
  },
});
