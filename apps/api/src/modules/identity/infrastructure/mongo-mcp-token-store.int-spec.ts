import { afterAll, beforeAll, expect, it } from 'vitest';
import { mcpTokenStoreContract } from '../../../../test/contracts/mcp-token-store.contract.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { MongoMcpTokenStore } from './identity-adapters.js';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await TestMongo.start();
});
afterAll(async () => {
  await mongo?.stop();
});

mcpTokenStoreContract('MongoDB', async () => new MongoMcpTokenStore(mongo.freshDb()));

it('treats tokens saved before scopes existed as read-only', async () => {
  const db = mongo.freshDb();
  await db.collection('mcp_tokens').insertOne({ _id: 'antigo' as never, label: 'antigo', createdAt: new Date() });
  expect(await new MongoMcpTokenStore(db).use('antigo', new Date())).toEqual({ label: 'antigo', scope: 'leitura' });
});
