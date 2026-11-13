import { expect, it } from 'vitest';
import { mcpAuditLogContract } from '../../../../test/contracts/mcp-audit-log.contract.js';
import { InMemoryMcpAuditLog } from '../../../../test/doubles/in-memory-mcp-audit-log.js';
import { auditableArgs, MAX_AUDITED_ARGS_CHARS } from './mcp-audit-log.js';

mcpAuditLogContract('memória', async () => new InMemoryMcpAuditLog());

it('keeps small args as they are and truncates big ones', () => {
  expect(auditableArgs({ id: 'x' })).toEqual({ id: 'x' });
  const big = auditableArgs({ resumeMarkdown: 'a'.repeat(10_000) });
  expect(String(big.truncado)).toHaveLength(MAX_AUDITED_ARGS_CHARS);
});
