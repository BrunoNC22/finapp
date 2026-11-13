import { afterAll, beforeAll } from 'vitest';
import { mcpAuditLogContract } from '../../../../test/contracts/mcp-audit-log.contract.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { MongoMcpAuditLog } from './mongo-mcp-audit-log.js';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await TestMongo.start();
});
afterAll(async () => {
  await mongo?.stop();
});

mcpAuditLogContract('MongoDB', async () => new MongoMcpAuditLog(mongo.freshDb()));
