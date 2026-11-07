import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Testes não podem depender de ordem nem de estado compartilhado.
    sequence: { shuffle: true },
    restoreMocks: true,
  },
});
