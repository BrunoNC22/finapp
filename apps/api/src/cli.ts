import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService } from './modules/identity/application/use-cases/auth.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { AppConfig } from './shared/config/app-config.js';
import { ConfigModule } from './shared/config/config.module.js';
import { MongoModule } from './shared/infrastructure/mongo/mongo.module.js';

/**
 * Comandos de administração, rodados no servidor:
 *   node dist/cli.js setup-token   → código de uso único (15 min) para o primeiro acesso ou "esqueci a senha"
 */
@Module({ imports: [ConfigModule, MongoModule, IdentityModule] })
class CliModule {}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'setup-token') {
    console.error('uso: node dist/cli.js setup-token');
    process.exit(2);
  }
  AppConfig.fromEnv(process.env);
  const app = await NestFactory.createApplicationContext(CliModule, { logger: false });
  const { token, expiresAt } = await app.get(AuthService).issueSetupToken();
  await app.close();
  console.error(`Código de acesso (uso único, válido até ${expiresAt.toLocaleTimeString('pt-BR')}):`);
  // biome-ignore lint/suspicious/noConsole: saída do comando de administração (só o código, para poder ser copiado/canalizado)
  console.log(token);
}

main().catch((error: unknown) => {
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
