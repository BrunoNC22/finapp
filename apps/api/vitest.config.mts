import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC no lugar do transformador padrão: emite os metadados de decorators de que o NestJS
  // depende para injeção de dependência (ADR 0006).
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts', 'test/**/*.spec.ts'],
    environment: 'node',
    // Testes não podem depender de ordem nem de estado compartilhado.
    sequence: { shuffle: true },
    restoreMocks: true,
  },
});
