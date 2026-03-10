import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Load environment variables from .env
loadEnv('', process.cwd());

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    },
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000
  }
});
