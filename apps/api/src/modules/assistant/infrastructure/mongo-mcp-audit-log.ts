import type { Collection, Db } from 'mongodb';
import { type McpAuditEntry, McpAuditLog } from '../application/mcp-audit-log.js';

export const ASSISTANT_COLLECTIONS = { audit: 'mcp_audit' } as const;

export class MongoMcpAuditLog extends McpAuditLog {
  private readonly collection: Collection<McpAuditEntry>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<McpAuditEntry>(ASSISTANT_COLLECTIONS.audit);
  }
  async record(entry: McpAuditEntry): Promise<void> {
    await this.collection.insertOne({ ...entry });
  }
  async recent(limit: number): Promise<McpAuditEntry[]> {
    const docs = await this.collection
      .find({}, { projection: { _id: 0 } })
      .sort({ at: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return docs.map(({ at, token, tool, args, outcome, error }) => ({
      at,
      token,
      tool,
      args,
      outcome,
      ...(error !== undefined ? { error } : {}),
    }));
  }
}
