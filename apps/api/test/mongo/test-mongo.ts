import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { type Db, MongoClient } from 'mongodb';

/**
 * MongoDB descartável para testes de integração (Testcontainers).
 * NUNCA aponta para o banco do cofre: cada arquivo de teste sobe o próprio container,
 * e cada teste pode pedir um banco novo e vazio.
 */
export class TestMongo {
  private counter = 0;

  private constructor(
    private readonly container: StartedMongoDBContainer,
    readonly client: MongoClient,
  ) {}

  static async start(): Promise<TestMongo> {
    const container = await new MongoDBContainer('mongo:8.0').start();
    const client = new MongoClient(`${container.getConnectionString()}?directConnection=true`);
    await client.connect();
    return new TestMongo(container, client);
  }

  /** Banco novo e vazio. */
  freshDb(): Db {
    return this.client.db(`test_${process.pid}_${++this.counter}`);
  }

  get url(): string {
    return `${this.container.getConnectionString()}?directConnection=true`;
  }

  async stop(): Promise<void> {
    await this.client.close();
    await this.container.stop();
  }
}
