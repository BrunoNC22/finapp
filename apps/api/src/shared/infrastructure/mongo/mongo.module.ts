import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Db, MongoClient } from 'mongodb';
import { AppConfig } from '../../config/app-config.js';
import { MongoConnection } from './mongo-connection.js';

/**
 * Conexão única com o MongoDB, compartilhada pelos módulos.
 * Se o banco estiver fora no boot, a API sobe, o /health mostra "degraded" e a conexão é tentada de novo a cada 5 s
 * até o banco voltar (veja MongoConnection).
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
export class MongoModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('MongoDB');
  private readonly connection: MongoConnection;
  private warned = false;

  constructor(@Inject(MongoClient) private readonly client: MongoClient) {
    this.connection = new MongoConnection(client, {
      retryMs: 5_000,
      onRetry: (error) => {
        // Avisa uma vez por queda, não a cada tentativa.
        if (!this.warned) this.logger.warn(`banco indisponível; tentando conectar a cada 5 s (${error.message})`);
        this.warned = true;
      },
      onConnected: () => {
        if (this.warned) this.logger.log('conectado ao banco');
        this.warned = false;
      },
    });
  }

  onApplicationBootstrap(): void {
    this.connection.start();
  }

  async onApplicationShutdown(): Promise<void> {
    this.connection.stop();
    await this.client.close();
  }
}
