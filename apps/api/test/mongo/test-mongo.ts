import { randomUUID } from 'node:crypto';
import { type Db, MongoClient } from 'mongodb';
import { inject } from 'vitest';

/**
 * Acesso ao MongoDB descartável da execução de testes (iniciado em global-setup.ts).
 * Cada `freshDb()` devolve um banco novo e vazio, então os testes não interferem entre si.
 */
export class TestMongo {
  private constructor(readonly client: MongoClient) {}

  static async start(): Promise<TestMongo> {
    const client = new MongoClient(inject('mongoUrl'));
    await client.connect();
    return new TestMongo(client);
  }

  get url(): string {
    return inject('mongoUrl');
  }

  freshDb(): Db {
    return this.client.db(`test_${randomUUID().slice(0, 8)}`);
  }

  async stop(): Promise<void> {
    await this.client.close();
  }
}
