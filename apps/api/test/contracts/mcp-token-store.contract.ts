import { describe, expect, it } from 'vitest';
import type { McpTokenStore } from '../../src/modules/identity/application/ports/identity-ports.js';

/** Comportamento que todo McpTokenStore precisa ter (memória e Mongo). */
export function mcpTokenStoreContract(name: string, make: () => Promise<McpTokenStore>) {
  describe(`McpTokenStore (${name})`, () => {
    const created = new Date('2026-11-13T12:00:00Z');
    const used = new Date('2026-11-13T13:00:00Z');

    it('keeps label and scope, and records the last use', async () => {
      const store = await make();
      await store.add('hash-leitura', 'desktop', created, 'leitura');
      await store.add('hash-escrita', 'agente', created, 'escrita');

      expect(await store.use('hash-escrita', used)).toEqual({ label: 'agente', scope: 'escrita' });
      expect(await store.use('nao-existe', used)).toBeUndefined();
      expect(await store.list()).toEqual([
        { label: 'desktop', scope: 'leitura', createdAt: created },
        { label: 'agente', scope: 'escrita', createdAt: created, lastUsedAt: used },
      ]);
    });

    it('revokes every token at once', async () => {
      const store = await make();
      await store.add('a', 'a', created, 'leitura');
      await store.add('b', 'b', created, 'escrita');
      expect(await store.revokeAll()).toBe(2);
      expect(await store.use('b', used)).toBeUndefined();
    });
  });
}
