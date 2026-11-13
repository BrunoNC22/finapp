import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Db } from 'mongodb';
import { AssistantData } from './modules/assistant/application/assistant-data.js';
import { McpAuditLog } from './modules/assistant/application/mcp-audit-log.js';
import { monthlyAnalysisPack } from './modules/assistant/application/monthly-analysis.js';
import { AssistantModule } from './modules/assistant/assistant.module.js';
import { MongoMcpAuditLog } from './modules/assistant/infrastructure/mongo-mcp-audit-log.js';
import { AuthService } from './modules/identity/application/use-cases/auth.js';
import { McpAccess } from './modules/identity/application/use-cases/mcp-access.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { RecordMonthlyAnalysis } from './modules/routine/application/monthly-analysis-routine.js';
import { RoutineModule } from './modules/routine/routine.module.js';
import { AppConfig } from './shared/config/app-config.js';
import { ConfigModule } from './shared/config/config.module.js';
import { MongoModule } from './shared/infrastructure/mongo/mongo.module.js';

/**
 * Comandos de administração, rodados no servidor:
 *   node dist/cli.js setup-token          → código de uso único (15 min) para o primeiro acesso ou "esqueci a senha"
 *   node dist/cli.js mcp-token [--escrita] [rótulo] → token para o Claude Code (MCP), mostrado uma única vez;
 *                                          de LEITURA, ou de ESCRITA com --escrita (pode alterar dados; ADR 0014)
 *   node dist/cli.js mcp-tokens           → lista os tokens MCP (rótulo, escopo, criação, último uso)
 *   node dist/cli.js mcp-revoke           → revoga todos os tokens MCP
 *   node dist/cli.js mcp-auditoria [N]    → as N últimas alterações feitas pelo MCP (padrão 20)
 *   node dist/cli.js analise-mensal [AAAA-MM] → JSON do pacote da análise mensal (o mesmo da ferramenta MCP
 *                                          analise_mensal), para analisar sem conectar o MCP; sem mês: o último fechado
 *   node dist/cli.js analise-feita [AAAA-MM]  → marca a análise do mês como feita (tira o lembrete do app)
 */
@Module({ imports: [ConfigModule, MongoModule, IdentityModule] })
class CliModule {}

@Module({ imports: [ConfigModule, MongoModule, AssistantModule] })
class AnalysisCliModule {}

@Module({ imports: [ConfigModule, MongoModule, RoutineModule] })
class RoutineCliModule {}

@Module({
  imports: [ConfigModule, MongoModule],
  providers: [{ provide: McpAuditLog, useFactory: (db: Db) => new MongoMcpAuditLog(db), inject: [Db] }],
})
class AuditCliModule {}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const commands = [
    'setup-token',
    'mcp-token',
    'mcp-tokens',
    'mcp-revoke',
    'mcp-auditoria',
    'analise-mensal',
    'analise-feita',
  ];
  if (!command || !commands.includes(command)) {
    console.error(`uso: node dist/cli.js ${commands.join(' | ')}`);
    process.exit(2);
  }
  if (command === 'analise-mensal') return analysis(args[0]);
  if (command === 'analise-feita') return markDone(args[0]);
  if (command === 'mcp-auditoria') return auditTrail(args[0]);
  AppConfig.fromEnv(process.env);
  const app = await NestFactory.createApplicationContext(CliModule, { logger: false });
  try {
    if (command === 'setup-token') {
      const { token, expiresAt } = await app.get(AuthService).issueSetupToken();
      console.error(`Código de acesso (uso único, válido até ${expiresAt.toLocaleTimeString('pt-BR')}):`);
      // biome-ignore lint/suspicious/noConsole: saída do comando de administração (só o código, para poder ser copiado/canalizado)
      console.log(token);
    } else if (command === 'mcp-token') {
      const write = args.includes('--escrita');
      const label = args.filter((a) => a !== '--escrita').join(' ');
      const token = await app.get(McpAccess).issue(label, write ? 'escrita' : 'leitura');
      console.error(
        write
          ? 'Token de ESCRITA para o MCP: o assistente poderá alterar dados (guarde agora: não será mostrado de novo):'
          : 'Token de leitura para o MCP (guarde agora: não será mostrado de novo):',
      );
      // biome-ignore lint/suspicious/noConsole: saída do comando de administração (só o token, para poder ser canalizado)
      console.log(token);
    } else if (command === 'mcp-tokens') {
      for (const t of await app.get(McpAccess).list()) {
        console.error(
          `${t.label} · ${t.scope} · criado ${t.createdAt.toISOString()} · último uso ${t.lastUsedAt?.toISOString() ?? 'nunca'}`,
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

/** O que o assistente alterou pelo MCP: data, token, ferramenta, resultado e argumentos. */
async function auditTrail(limit: string | undefined): Promise<void> {
  const parsed = Number.parseInt(limit ?? '20', 10);
  AppConfig.fromEnv(process.env);
  const app = await NestFactory.createApplicationContext(AuditCliModule, { logger: false });
  try {
    const entries = await app
      .get(McpAuditLog)
      .recent(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 20);
    if (entries.length === 0) console.error('Nenhuma alteração feita pelo MCP.');
    for (const e of entries.reverse()) {
      const status = e.outcome === 'ok' ? 'ok' : `ERRO: ${e.error ?? ''}`;
      console.error(`${e.at.toISOString()} · ${e.token} · ${e.tool} · ${status} · ${JSON.stringify(e.args)}`);
    }
  } finally {
    await app.close();
  }
}

/** Chamado pela skill ao registrar a análise: o lembrete some do Painel. */
async function markDone(month: string | undefined): Promise<void> {
  AppConfig.fromEnv(process.env);
  const app = await NestFactory.createApplicationContext(RoutineCliModule, { logger: false });
  try {
    const record = await app.get(RecordMonthlyAnalysis).execute({
      ...(month ? { month } : {}),
      outcome: 'feita',
      via: 'skill',
    });
    console.error(`Análise de ${record.month} registrada como feita.`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falha:', error instanceof Error ? error.message : error);
  process.exit(1);
});
