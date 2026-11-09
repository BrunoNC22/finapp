import { afterAll, beforeAll } from 'vitest';
import { analysisLogContract } from '../../../../test/contracts/analysis-log.contract.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { MongoAnalysisLog } from './mongo-analysis-log.js';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await TestMongo.start();
});
afterAll(async () => {
  await mongo?.stop();
});

analysisLogContract('MongoDB', async () => new MongoAnalysisLog(mongo.freshDb()));
