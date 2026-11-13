import { describe, expect, it } from 'vitest';
import type { McpAuditLog } from '../../src/modules/assistant/application/mcp-audit-log.js';

/** Comportamento que todo McpAuditLog precisa ter (memória e Mongo). */
export function mcpAuditLogContract(name: string, make: () => Promise<McpAuditLog>) {
  describe(`McpAuditLog (${name})`, () => {
    it('returns the latest calls first, limited, with args and errors as recorded', async () => {
      const log = await make();
      const at = (minute: number) => new Date(`2026-11-13T12:0${minute}:00Z`);
      await log.record({ at: at(1), token: 'agente', tool: 'criar_meta', args: { name: 'Bike' }, outcome: 'ok' });
      await log.record({
        at: at(2),
        token: 'agente',
        tool: 'excluir_meta',
        args: { id: 'x' },
        outcome: 'erro',
        error: 'meta não encontrada',
      });
      await log.record({ at: at(3), token: 'outro', tool: 'sincronizar_agora', args: {}, outcome: 'ok' });

      expect(await log.recent(2)).toEqual([
        { at: at(3), token: 'outro', tool: 'sincronizar_agora', args: {}, outcome: 'ok' },
        {
          at: at(2),
          token: 'agente',
          tool: 'excluir_meta',
          args: { id: 'x' },
          outcome: 'erro',
          error: 'meta não encontrada',
        },
      ]);
    });
  });
}
