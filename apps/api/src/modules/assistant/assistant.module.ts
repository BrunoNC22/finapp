import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AccountRepository } from '../ledger/application/ports/account-repository.js';
import { CategoryRepository } from '../ledger/application/ports/category-repository.js';
import { TransactionQueries } from '../ledger/application/ports/transaction-queries.js';
import { GetInstallmentPurchases } from '../ledger/application/use-cases/ledger-commands.js';
import { GetMonthlyReport } from '../ledger/application/use-cases/monthly-report.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { GoalRepository } from '../planning/application/ports/goal-ports.js';
import { IncomeSourceRepository } from '../planning/application/ports/income-ports.js';
import { GetGoalPlan, GetRequiredIncome } from '../planning/application/use-cases/goals.js';
import { GetIncomeOverview } from '../planning/application/use-cases/income.js';
import { PlanningModule } from '../planning/planning.module.js';
import { AssistantData } from './application/assistant-data.js';
import { FinanceAssistantData } from './infrastructure/finance-assistant-data.js';
import { McpController } from './presentation/mcp.controller.js';

/** Assistente: servidor MCP somente leitura para o Claude Code (ADR 0013). */
@Module({
  imports: [IdentityModule, LedgerModule, PlanningModule],
  controllers: [McpController],
  providers: [
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
      ],
    },
  ],
})
export class AssistantModule {}
