import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService } from './modules/identity/application/use-cases/auth.js';
import { McpAccess } from './modules/identity/application/use-cases/mcp-access.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { AppConfig } from './shared/config/app-config.js';
import { ConfigModule } from './shared/config/config.module.js';
import { MongoModule } from './shared/infrastructure/mongo/mongo.module.js';

/**
 * Comandos de administração, rodados no servidor:
 *   node dist/cli.js setup-token          → código de uso único (15 min) para o primeiro acesso ou "esqueci a senha"
 *   node dist/cli.js mcp-token [rótulo]   → token de LEITURA para o Claude Code (MCP); mostrado uma única vez
 *   node dist/cli.js mcp-tokens           → lista os tokens MCP (rótulo, criação, último uso)
 *   node dist/cli.js mcp-revoke           → revoga todos os tokens MCP
 */
@Module({ imports: [ConfigModule, MongoModule, IdentityModule] })
class CliModule {}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const commands = ['setup-token', 'mcp-token', 'mcp-tokens', 'mcp-revoke'];
  if (!command || !commands.includes(command)) {
    console.error(`uso: node dist/cli.js ${commands.join(' | ')}`);
    process.exit(2);
  }
  AppConfig.fromEnv(process.env);
  const app = await NestFactory.createApplicationContext(CliModule, { logger: false });
  try {
    if (command === 'setup-token') {
      const { token, expiresAt } = await app.get(AuthService).issueSetupToken();
      console.error(`Código de acesso (uso único, válido até ${expiresAt.toLocaleTimeString('pt-BR')}):`);
      // biome-ignore lint/suspicious/noConsole: saída do comando de administração (só o código, para poder ser copiado/canalizado)
      console.log(token);
    } else if (command === 'mcp-token') {
      const token = await app.get(McpAccess).issue(args.join(' '));
      console.error('Token de leitura para o MCP (guarde agora: não será mostrado de novo):');
      // biome-ignore lint/suspicious/noConsole: saída do comando de administração (só o token, para poder ser canalizado)
      console.log(token);
    } else if (command === 'mcp-tokens') {
      for (const t of await app.get(McpAccess).list()) {
        console.error(
          `${t.label} · criado ${t.createdAt.toISOString()} · último uso ${t.lastUsedAt?.toISOString() ?? 'nunca'}`,
        );
      }
    } else {
      console.error(`${await app.get(McpAccess).revokeAll()} token(s) MCP revogado(s).`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
