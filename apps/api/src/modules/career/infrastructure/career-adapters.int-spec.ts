import { afterAll, beforeAll } from 'vitest';
import { careerRepositoriesContract } from '../../../../test/contracts/career-repositories.contract.js';
import { TestMongo } from '../../../../test/mongo/test-mongo.js';
import { MongoCareerProfileRepository, MongoOpportunityRepository } from './career-adapters.js';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await TestMongo.start();
});
afterAll(async () => {
  await mongo?.stop();
});

careerRepositoriesContract('MongoDB', async () => {
  const db = mongo.freshDb();
  return { profiles: new MongoCareerProfileRepository(db), opportunities: new MongoOpportunityRepository(db) };
});
