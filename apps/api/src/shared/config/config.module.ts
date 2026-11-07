import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config.js';

/** Disponibiliza a configuração validada para toda a aplicação. Falha no boot se o ambiente for inválido. */
@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => AppConfig.fromEnv(process.env) }],
  exports: [AppConfig],
})
export class ConfigModule {}
