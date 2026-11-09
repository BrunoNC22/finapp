import type {
  AccountDto,
  AnalysisReminderDto,
  CareerProfileDto,
  CategoryDto,
  ConnectionsHealthDto,
  CreateIncomeSourceCommand,
  CreateOpportunityCommand,
  GoalCommand,
  GoalDto,
  GoalPlanDto,
  IncomeOverviewDto,
  IncomeSourceDto,
  InstallmentPurchaseDto,
  MonthlyReportDto,
  OpportunityDto,
  RecordAnalysisCommand,
  RequiredIncomeDto,
  SyncRunDto,
  TransactionDto,
  TransactionPageDto,
  UpdateIncomeSourceCommand,
  UpdateOpportunityCommand,
} from '@finapp/contracts';

/** Porta usada pelas telas de dados (o teste usa um dublê manual, FakeFinanceApi). */
export interface FinanceApi {
  accounts(): Promise<AccountDto[]>;
  categories(): Promise<CategoryDto[]>;
  monthlyReport(month: string): Promise<MonthlyReportDto>;
  transactions(search: TransactionSearch): Promise<TransactionPageDto>;
  categorize(transactionId: string, categoryId: string): Promise<TransactionDto>;
  classify(transactionId: string, classification: TransactionDto['classification']): Promise<TransactionDto>;
  installments(): Promise<InstallmentPurchaseDto[]>;
  /** `full`: revisita 12 meses (aplica regras melhoradas aos meses antigos). */
  syncNow(options?: { full?: boolean }): Promise<SyncRunDto>;
  syncRuns(limit: number): Promise<SyncRunDto[]>;
  dismissRecurring(key: string): Promise<void>;

  // Planejamento: renda
  incomeSources(): Promise<IncomeSourceDto[]>;
  createIncomeSource(command: CreateIncomeSourceCommand): Promise<IncomeSourceDto>;
  updateIncomeSource(id: string, command: UpdateIncomeSourceCommand): Promise<IncomeSourceDto>;
  deleteIncomeSource(id: string): Promise<void>;
  incomeOverview(month: string, months?: number): Promise<IncomeOverviewDto>;

  // Planejamento: metas
  goals(): Promise<GoalDto[]>;
  createGoal(command: GoalCommand): Promise<GoalDto>;
  replaceGoal(id: string, command: GoalCommand): Promise<GoalDto>;
  deleteGoal(id: string): Promise<void>;
  reorderGoals(ids: string[]): Promise<void>;
  goalPlan(query: PlanQuery): Promise<GoalPlanDto>;
  requiredIncome(query: PlanQuery & { deadline?: string }): Promise<RequiredIncomeDto>;

  // Carreira
  /** null enquanto o perfil não foi preenchido. */
  careerProfile(): Promise<CareerProfileDto | null>;
  saveCareerProfile(profile: CareerProfileDto): Promise<CareerProfileDto>;
  opportunities(): Promise<OpportunityDto[]>;
  createOpportunity(command: CreateOpportunityCommand): Promise<OpportunityDto>;
  updateOpportunity(id: string, command: UpdateOpportunityCommand): Promise<OpportunityDto>;
  deleteOpportunity(id: string): Promise<void>;

  /** Conexões do Open Finance e a validade de cada autorização. */
  connections(): Promise<ConnectionsHealthDto>;

  // Rotina mensal
  analysisReminder(): Promise<AnalysisReminderDto>;
  recordAnalysis(month: string, outcome: RecordAnalysisCommand['outcome']): Promise<AnalysisReminderDto>;
}

export interface PlanQuery {
  readonly months?: number;
  /** Sem informar, a API usa o saldo disponível hoje nas contas. */
  readonly startingSavingsCents?: number;
  readonly minSlackPercent?: number;
}

/** O que a API recebe em GET /transactions (antes de virar query string). */
export interface TransactionSearch {
  readonly from?: string;
  readonly to?: string;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly classification?: TransactionDto['classification'];
  readonly paymentMethod?: TransactionDto['paymentMethod'];
  readonly q?: string;
  readonly uncategorized?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

/** Query string de GET /transactions. */
export function searchToQueryString(search: TransactionSearch): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
