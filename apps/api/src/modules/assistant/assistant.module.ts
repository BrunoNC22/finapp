import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Db } from 'mongodb';
import { CareerProfileRepository, OpportunityRepository } from '../career/application/career.js';
import { CareerModule } from '../career/career.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AccountRepository } from '../ledger/application/ports/account-repository.js';
import { CategoryRepository } from '../ledger/application/ports/category-repository.js';
import { TransactionQueries } from '../ledger/application/ports/transaction-queries.js';
import { GetConnectionsHealth } from '../ledger/application/use-cases/connections.js';
import { GetInstallmentPurchases } from '../ledger/application/use-cases/ledger-commands.js';
import { GetMonthlyReport } from '../ledger/application/use-cases/monthly-report.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { GoalRepository } from '../planning/application/ports/goal-ports.js';
import { IncomeSourceRepository } from '../planning/application/ports/income-ports.js';
import { GetGoalPlan, GetRequiredIncome } from '../planning/application/use-cases/goals.js';
import { GetIncomeOverview } from '../planning/application/use-cases/income.js';
import { PlanningModule } from '../planning/planning.module.js';
import { AssistantData } from './application/assistant-data.js';
import { McpAuditLog } from './application/mcp-audit-log.js';
import { FinanceAssistantData } from './infrastructure/finance-assistant-data.js';
import { MongoMcpAuditLog } from './infrastructure/mongo-mcp-audit-log.js';
import { McpController } from './presentation/mcp.controller.js';

/**
 * Assistente: servidor MCP para o Claude Code (ADR 0013 e 0014). Leitura pela porta AssistantData; escrita pelas
 * ferramentas que cada módulo declara (@ProvidesMcpTools), só para token de escrita e com auditoria.
 */
@Module({
  imports: [DiscoveryModule, IdentityModule, LedgerModule, PlanningModule, CareerModule],
  controllers: [McpController],
  providers: [
    { provide: McpAuditLog, useFactory: (db: Db) => new MongoMcpAuditLog(db), inject: [Db] },
    {
      provide: AssistantData,
      useFactory: (
        report: GetMonthlyReport,
        categories: CategoryRepository,
        accounts: AccountRepository,
        transactions: TransactionQueries,
        installments: GetInstallmentPurchases,
        incomeOverview: GetIncomeOverview,
        incomeSources: IncomeSourceRepository,
        goals: GoalRepository,
        plan: GetGoalPlan,
        requiredIncome: GetRequiredIncome,
        profiles: CareerProfileRepository,
        opportunitiesRepo: OpportunityRepository,
        connectionsHealth: GetConnectionsHealth,
      ) =>
        new FinanceAssistantData({
          report,
          categories,
          accounts,
          transactions,
          installments,
          incomeOverview,
          incomeSources,
          goals,
          plan,
          requiredIncome,
          profiles,
          opportunitiesRepo,
          connectionsHealth,
        }),
      inject: [
        GetMonthlyReport,
        CategoryRepository,
        AccountRepository,
        TransactionQueries,
        GetInstallmentPurchases,
        GetIncomeOverview,
        IncomeSourceRepository,
        GoalRepository,
        GetGoalPlan,
        GetRequiredIncome,
        CareerProfileRepository,
        OpportunityRepository,
        GetConnectionsHealth,
      ],
    },
  ],
  exports: [McpAuditLog],
})
export class AssistantModule {}
