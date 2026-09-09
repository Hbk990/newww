import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['tests/money.test.ts', 'tests/vpic.test.ts', 'tests/atomic.test.ts'],
  environment: 'node', fileParallelism: false,
} });
