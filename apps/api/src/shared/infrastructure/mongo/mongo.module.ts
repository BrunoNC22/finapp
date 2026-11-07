import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Db, MongoClient } from 'mongodb';
import { AppConfig } from '../../config/app-config.js';

/**
 * Conexão única com o MongoDB, compartilhada pelos módulos.
 * O driver conecta sob demanda: se o banco estiver fora no boot, a API sobe e o /health mostra "degraded".
 */
@Global()
@Module({
  providers: [
    {
      provide: MongoClient,
      useFactory: (config: AppConfig) =>
        new MongoClient(config.mongo.url, { appName: 'finapp-api', serverSelectionTimeoutMS: 3000 }),
      inject: [AppConfig],
    },
    {
      provide: Db,
      useFactory: (client: MongoClient, config: AppConfig) => client.db(config.mongo.dbName),
      inject: [MongoClient, AppConfig],
    },
  ],
  exports: [MongoClient, Db],
})
export class MongoModule implements OnApplicationShutdown {
  constructor(@Inject(MongoClient) private readonly client: MongoClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
