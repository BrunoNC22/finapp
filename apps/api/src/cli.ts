import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AssistantData } from './modules/assistant/application/assistant-data.js';
import { monthlyAnalysisPack } from './modules/assistant/application/monthly-analysis.js';
import { AssistantModule } from './modules/assistant/assistant.module.js';
import { AuthService } from './modules/identity/application/use-cases/auth.js';
import { McpAccess } from './modules/identity/application/use-cases/mcp-access.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { AppConfig } from './shared/config/app-config.js';
import { ConfigModule } from './shared/config/config.module.js';
import { MongoModule } from './shared/infrastructure/mongo/mongo.module.js';

/**
 * Comandos de administração, rodados no servidor:
 *   node dist/cli.js setup-token          → código de uso único (15 min) para o primeiro acesso ou "esqueci a senha"
 *   node dist/cli.js mcp-token [rótulo]   → token de LEITURA para o Claude Code (MCP); mostrado uma única vez
 *   node dist/cli.js mcp-tokens           → lista os tokens MCP (rótulo, criação, último uso)
 *   node dist/cli.js mcp-revoke           → revoga todos os tokens MCP
 *   node dist/cli.js analise-mensal [AAAA-MM] → JSON do pacote da análise mensal (o mesmo da ferramenta MCP
 *                                          analise_mensal), para analisar sem conectar o MCP; sem mês: o último fechado
 */
@Module({ imports: [ConfigModule, MongoModule, IdentityModule] })
class CliModule {}

@Module({ imports: [ConfigModule, MongoModule, AssistantModule] })
class AnalysisCliModule {}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const commands = ['setup-token', 'mcp-token', 'mcp-tokens', 'mcp-revoke', 'analise-mensal'];
  if (!command || !commands.includes(command)) {
    console.error(`uso: node dist/cli.js ${commands.join(' | ')}`);
    process.exit(2);
  }
  if (command === 'analise-mensal') return analysis(args[0]);
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

/** Lê pelo mesmo caminho do MCP, sem servidor HTTP e sem disparar a sincronização automática. */
async function analysis(month: string | undefined): Promise<void> {
  if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    console.error('uso: node dist/cli.js analise-mensal [AAAA-MM]');
    process.exit(2);
  }
  process.env.SYNC_INTERVAL_HOURS = '0';
  AppConfig.fromEnv(process.env);
  const app = await NestFactory.createApplicationContext(AnalysisCliModule, { logger: false });
  try {
    await app.get(LedgerModule).ready;
    const pack = await monthlyAnalysisPack(app.get(AssistantData), month);
    // biome-ignore lint/suspicious/noConsole: saída do comando (JSON, para ser canalizado)
    console.log(JSON.stringify(pack, null, 1));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
