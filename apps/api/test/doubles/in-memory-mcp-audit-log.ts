import { type McpAuditEntry, McpAuditLog } from '../../src/modules/assistant/application/mcp-audit-log.js';

export class InMemoryMcpAuditLog extends McpAuditLog {
  readonly entries: McpAuditEntry[] = [];
  async record(entry: McpAuditEntry) {
    this.entries.push(structuredClone(entry));
  }
  async recent(limit: number) {
    return [...this.entries]
      .reverse()
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }
}
