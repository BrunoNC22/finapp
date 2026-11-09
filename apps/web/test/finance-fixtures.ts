import type {
  AccountDto,
  AnalysisReminderDto,
  CareerProfileDto,
  CategoryDto,
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
import { ApiError } from '../src/lib/api/api-client';
import type { FinanceApi, PlanQuery, TransactionSearch } from '../src/lib/api/finance-api';

// Dados FICTÍCIOS para os testes das telas.
export const brl = (cents: number) => ({ cents, currency: 'BRL' as const });

export function aTransaction(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: 't1',
    accountId: 'conta-corrente',
    occurredOn: '2026-10-05',
    amount: brl(-4590),
    description: 'Restaurante Exemplo',
    paymentMethod: 'card_purchase',
    status: 'posted',
    classification: 'expense',
    classificationSource: 'default',
    ...overrides,
  };
}

export const ACCOUNTS: AccountDto[] = [
  {
    id: 'conta-corrente',
    displayName: 'Banco Exemplo · Conta corrente',
    institutionName: 'Banco Exemplo',
    kind: 'checking',
    holderType: 'individual',
    balance: brl(123456),
    lastSyncedAt: '2026-11-07T09:00:00.000Z',
  },
  {
    id: 'cartao',
    displayName: 'Banco Exemplo · Cartão',
    institutionName: 'Banco Exemplo',
    kind: 'credit_card',
    holderType: 'individual',
    balance: brl(-75000),
    creditLimit: brl(300000),
    lastSyncedAt: '2026-11-07T09:00:00.000Z',
  },
];

const category = (id: string, name: string, kind: CategoryDto['kind'], parentId?: string): CategoryDto => ({
  id,
  name,
  kind,
  archived: false,
  ...(parentId ? { parentId } : {}),
});

export const CATEGORIES: CategoryDto[] = [
  category('alimentacao', 'Alimentação', 'expense'),
  category('alimentacao.delivery', 'Delivery', 'expense', 'alimentacao'),
  category('alimentacao.mercado', 'Mercado', 'expense', 'alimentacao'),
  category('moradia', 'Moradia', 'expense'),
  category('moradia.aluguel', 'Aluguel e condomínio', 'expense', 'moradia'),
  category('renda', 'Renda', 'income'),
  category('renda.servicos', 'Serviços e freelas', 'income', 'renda'),
];

export function aReport(month = '2026-10'): MonthlyReportDto {
  const delivery = aTransaction({
    id: 'd1',
    description: 'Delivery Exemplo',
    amount: brl(-8990),
    category: { id: 'alimentacao.delivery', source: 'provider' },
  });
  return {
    month,
    cashFlow: [
      { month: '2026-09', income: brl(240000), spending: brl(200000), net: brl(40000) },
      { month, income: brl(250000), spending: brl(180000), net: brl(70000) },
    ],
    categories: [
      {
        categoryId: 'moradia.aluguel',
        groupId: 'moradia',
        spent: brl(90000),
        count: 1,
        previousAverage: brl(90000),
        changePercent: 0,
      },
      {
        categoryId: 'alimentacao.delivery',
        groupId: 'alimentacao',
        spent: brl(42000),
        count: 6,
        previousAverage: brl(30000),
        changePercent: 40,
      },
      {
        categoryId: 'alimentacao.mercado',
        groupId: 'alimentacao',
        spent: brl(38000),
        count: 4,
        previousAverage: brl(40000),
        changePercent: -5,
      },
      { categoryId: null, groupId: null, spent: brl(10000), count: 2, previousAverage: brl(0), changePercent: null },
    ],
    byAccount: [{ accountId: 'cartao', spent: brl(120000), count: 10 }],
    byPaymentMethod: [{ paymentMethod: 'card_purchase', spent: brl(120000), count: 10 }],
    topExpenses: [
      aTransaction({
        id: 'a1',
        description: 'Aluguel Exemplo',
        amount: brl(-90000),
        paymentMethod: 'pix',
        category: { id: 'moradia.aluguel', source: 'rule' },
      }),
      delivery,
    ],
    outliers: [],
    incomeSources: [
      { key: 'cp:a', label: 'Cliente Exemplo', total: brl(150000), count: 3 },
      { key: 'cp:b', label: 'Fundação Exemplo', total: brl(90000), count: 1 },
      {
        key: 'acc:carteira:renda.rendimentos',
        accountId: 'conta-corrente',
        categoryId: 'renda',
        total: brl(10000),
        count: 30,
      },
    ],
    recurring: [
      {
        key: 'r-streaming',
        label: 'Streaming Exemplo',
        occurrences: 6,
        typicalAmount: brl(-3990),
        intervalDays: 30,
        lastOn: '2026-10-10',
        nextExpectedOn: '2026-11-10',
        annualCost: brl(-47880),
      },
    ],
    commitments: [
      { month: '2026-11', installments: brl(-30000), recurring: brl(-3990), total: brl(-33990) },
      { month: '2026-12', installments: brl(-30000), recurring: brl(-3990), total: brl(-33990) },
    ],
  };
}

export const INSTALLMENTS: InstallmentPurchaseDto[] = [
  {
    accountId: 'cartao',
    merchant: 'Loja Exemplo',
    total: 10,
    knownNumbers: [1, 2, 3, 4],
    remainingCount: 6,
    firstInstallmentMonth: '2026-07',
    totalAmount: brl(-300000),
    totalAmountIsEstimated: false,
    purchaseDate: '2026-06-20',
    projected: ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'].map((expectedMonth, i) => ({
      number: i + 5,
      expectedMonth,
      amount: brl(-30000),
    })),
  },
];

export const SYNC_RUN: SyncRunDto = {
  id: 's1',
  startedAt: '2026-11-07T09:00:00.000Z',
  finishedAt: '2026-11-07T09:00:20.000Z',
  status: 'success',
  accounts: [{ accountExternalId: 'x', created: 3, updated: 10, removed: 0 }],
  transferPairs: 2,
  ambiguousTransfers: 0,
  uncategorized: 1,
};

// ------------------------------------------------------------------ planejamento (fictício)
const months = (from: string, count: number) => {
  const [y, m] = from.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const index = y * 12 + (m - 1) + i;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
};

export const INCOME_SOURCES: IncomeSourceDto[] = [
  {
    id: 's1',
    name: 'Bolsa Exemplo',
    kind: 'scholarship',
    expectedMonthly: brl(90000),
    startsOn: '2025-01',
    endsOn: '2027-12',
    risk: 'low',
    status: 'active',
    matcher: { counterpartyContains: 'fundacao exemplo' },
  },
  {
    id: 's2',
    name: 'Freela Exemplo',
    kind: 'freelance',
    expectedMonthly: brl(150000),
    startsOn: '2025-07',
    risk: 'high',
    status: 'active',
  },
];

export function anIncomeOverview(month = '2026-10'): IncomeOverviewDto {
  const ms = months('2026-11', 24);
  const scenario = (id: 'floor' | 'likely' | 'optimistic', name: string, cents: (i: number) => number) => ({
    id,
    name,
    description: `Cenário ${name}`,
    totals: ms.map((_, i) => brl(cents(i))),
    bySource: [],
  });
  return {
    month,
    projection: {
      months: ms,
      scenarios: [
        scenario('floor', 'Piso', (i) => (i < 14 ? 90000 : 0)),
        scenario('likely', 'Provável', (i) => (i < 14 ? 90000 : 0)),
        scenario('optimistic', 'Otimista', (i) => (i < 14 ? 240000 : 150000)),
      ],
    },
    tracking: {
      sources: [
        { sourceId: 's1', expected: brl(90000), observed: brl(90000), status: 'paid' },
        { sourceId: 's2', expected: brl(150000), observed: brl(70000), status: 'partial' },
      ],
      unrecognized: brl(30300),
      suggestions: [{ name: 'Cliente Novo', months: 3, averageMonthly: brl(30000) }],
    },
  };
}

export const GOALS: GoalDto[] = [
  {
    id: 'g1',
    name: 'Bicicleta elétrica',
    kind: 'purchase',
    price: brl(330000),
    downPayment: brl(0),
    oneTimeCosts: brl(30000),
    financing: { kind: 'interest_free', installments: 12 },
    recurringCosts: [{ name: 'manutenção', monthly: brl(8000), replacesCategoryId: 'alimentacao.delivery' }],
    upfront: brl(30000),
    installment: brl(27500),
    totalCost: brl(360000),
  },
  {
    id: 'g2',
    name: 'Carteira de motorista',
    kind: 'purchase',
    price: brl(110000),
    downPayment: brl(0),
    oneTimeCosts: brl(0),
    financing: { kind: 'cash' },
    recurringCosts: [],
    upfront: brl(110000),
    installment: brl(0),
    totalCost: brl(110000),
  },
];

export function aPlan(): GoalPlanDto {
  const ms = months('2026-11', 48);
  const timeline = ms.map((month, i) => ({
    month,
    income: brl(200000),
    spending: brl(150000),
    surplus: brl(50000),
    savings: brl(40000 + 50000 * (i + 1)),
  }));
  const goal = (goalId: string, extra: Partial<GoalPlanDto['scenarios'][number]['goals'][number]>) => ({
    goalId,
    status: 'scheduled' as const,
    monthlyCost: brl(23500),
    monthlyCostAfterPayments: brl(-1000),
    alerts: [],
    levers: [],
    ...extra,
  });
  return {
    months: ms,
    startingSavings: brl(40000),
    minSlackPercent: 10,
    baseline: { monthlySpending: brl(150000), months: 6 },
    scenarios: [
      {
        id: 'floor',
        name: 'Piso',
        goals: [
          goal('g1', {
            status: 'not_feasible',
            monthlyGap: brl(50000),
            levers: [
              { kind: 'extra_income', amount: brl(50000) },
              { kind: 'cut', categoryId: 'alimentacao.mercado', amount: brl(12000) },
            ],
          }),
          goal('g2', { status: 'blocked' }),
        ],
        timeline,
      },
      {
        id: 'likely',
        name: 'Provável',
        goals: [
          goal('g1', { startMonth: '2026-12', monthsWaiting: 1 }),
          goal('g2', { startMonth: '2027-03', monthsWaiting: 4, alerts: ['income_drops'] }),
        ],
        timeline,
      },
      {
        id: 'optimistic',
        name: 'Otimista',
        goals: [
          goal('g1', { startMonth: '2026-11', monthsWaiting: 0 }),
          goal('g2', { startMonth: '2027-01', monthsWaiting: 2 }),
        ],
        timeline,
      },
    ],
  };
}

export const PROFILE: CareerProfileDto = {
  headline: 'Desenvolvedora Full Stack',
  summary: 'Perfil fictício.',
  location: 'Cidade Exemplo',
  preferences: { workModes: ['freela', 'pj'], remote: true, inPerson: false },
  english: { reading: 'fluente', listening: 'fluente', writing: 'avancado', speaking: 'intermediario' },
  skills: [
    { name: 'TypeScript', level: 'avancado' },
    { name: 'NestJS', level: 'intermediario' },
  ],
  experiences: [
    {
      title: 'Desenvolvedora',
      organization: 'Empresa A',
      start: '2025-01',
      end: '2026-11',
      description: 'Sistemas web',
    },
  ],
  education: [{ title: 'Bacharelado', institution: 'Instituto X', start: '2020-03' }],
  links: [{ label: 'Portfólio', url: 'https://exemplo.dev' }],
  resumeMarkdown: '# Fulana',
};

export const OPPORTUNITIES: OpportunityDto[] = [
  {
    id: 'o1',
    title: 'Agente de IA no WhatsApp',
    kind: 'recorrente',
    status: 'ideia',
    estimatedMonthly: brl(80000),
    notes: 'Pequenos negócios',
    updatedAt: '2026-11-08T12:00:00.000Z',
  },
  {
    id: 'o2',
    title: 'Vaga PJ remota',
    kind: 'vaga',
    status: 'aplicada',
    estimatedMonthly: brl(650000),
    notes: '',
    updatedAt: '2026-11-07T12:00:00.000Z',
  },
];

/** API de dados falsa (stub + spy), escrita à mão. */
export class FakeFinanceApi implements FinanceApi {
  readonly calls: string[] = [];
  accountList = ACCOUNTS;
  categoryList = CATEGORIES;
  report: (month: string) => MonthlyReportDto = aReport;
  pages: TransactionPageDto[] = [{ items: [aTransaction()], nextCursor: null }];
  installmentList = INSTALLMENTS;
  runs: SyncRunDto[] = [SYNC_RUN];
  syncBusy = false;
  failReports = false;
  readonly searches: TransactionSearch[] = [];

  async accounts() {
    return this.accountList;
  }
  async categories() {
    return this.categoryList;
  }
  async monthlyReport(month: string) {
    this.calls.push(`report:${month}`);
    if (this.failReports) throw new ApiError(500, 'erro interno');
    return this.report(month);
  }
  async transactions(search: TransactionSearch) {
    this.searches.push(search);
    const index = search.cursor ? Number(search.cursor) : 0;
    return this.pages[index] ?? { items: [], nextCursor: null };
  }
  private find(id: string): TransactionDto {
    const found = this.pages.flatMap((p) => p.items).find((t) => t.id === id);
    if (!found) throw new ApiError(404, 'não encontrada');
    return found;
  }
  async categorize(id: string, categoryId: string) {
    this.calls.push(`categorize:${id}:${categoryId}`);
    const updated = { ...this.find(id), category: { id: categoryId, source: 'manual' as const } };
    this.replace(updated);
    return updated;
  }
  async classify(id: string, classification: TransactionDto['classification']) {
    this.calls.push(`classify:${id}:${classification}`);
    const updated = { ...this.find(id), classification, classificationSource: 'manual' as const };
    this.replace(updated);
    return updated;
  }
  private replace(t: TransactionDto) {
    this.pages = this.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === t.id ? t : i)) }));
  }
  async installments() {
    return this.installmentList;
  }
  async syncNow(options: { full?: boolean } = {}) {
    this.calls.push(options.full ? 'sync-full' : 'sync');
    if (this.syncBusy) throw new ApiError(409, 'sincronização em andamento');
    return SYNC_RUN;
  }
  async syncRuns() {
    return this.runs;
  }
  async dismissRecurring(key: string) {
    this.calls.push(`dismiss:${key}`);
  }

  // ---------------------------------------------------------------- planejamento
  sources: IncomeSourceDto[] = [...INCOME_SOURCES];
  goalList: GoalDto[] = [...GOALS];
  plan: GoalPlanDto = aPlan();
  readonly sent: unknown[] = [];
  readonly planQueries: (PlanQuery & { deadline?: string })[] = [];

  async incomeSources() {
    return this.sources;
  }
  async createIncomeSource(command: CreateIncomeSourceCommand) {
    this.calls.push('create-source');
    this.sent.push(command);
    const created: IncomeSourceDto = {
      id: `s${this.sources.length + 1}`,
      name: command.name,
      kind: command.kind,
      expectedMonthly: brl(command.expectedMonthlyCents),
      startsOn: command.startsOn,
      ...(command.endsOn ? { endsOn: command.endsOn } : {}),
      risk: command.risk,
      status: command.status,
      ...(command.matcher ? { matcher: command.matcher } : {}),
    };
    this.sources = [...this.sources, created];
    return created;
  }
  async updateIncomeSource(id: string, command: UpdateIncomeSourceCommand) {
    this.calls.push(`update-source:${id}`);
    this.sent.push(command);
    return this.sources.find((s) => s.id === id) as IncomeSourceDto;
  }
  async deleteIncomeSource(id: string) {
    this.calls.push(`delete-source:${id}`);
    this.sources = this.sources.filter((s) => s.id !== id);
  }
  async incomeOverview(month: string) {
    this.calls.push(`income-overview:${month}`);
    return anIncomeOverview(month);
  }
  async goals() {
    return this.goalList;
  }
  async createGoal(command: GoalCommand) {
    this.calls.push('create-goal');
    this.sent.push(command);
    return { ...(GOALS[0] as GoalDto), id: 'g-new', name: command.name };
  }
  async replaceGoal(id: string, command: GoalCommand) {
    this.calls.push(`replace-goal:${id}`);
    this.sent.push(command);
    return { ...(GOALS[0] as GoalDto), id, name: command.name };
  }
  async deleteGoal(id: string) {
    this.calls.push(`delete-goal:${id}`);
    this.goalList = this.goalList.filter((g) => g.id !== id);
  }
  async reorderGoals(ids: string[]) {
    this.calls.push(`reorder:${ids.join(',')}`);
    this.goalList = ids.map((id) => this.goalList.find((g) => g.id === id) as GoalDto);
  }
  async goalPlan(query: PlanQuery) {
    this.planQueries.push(query);
    return this.plan;
  }
  // ---------------------------------------------------------------- carreira
  profile: CareerProfileDto | null = PROFILE;
  opportunityList: OpportunityDto[] = [...OPPORTUNITIES];
  async careerProfile() {
    return this.profile;
  }
  async saveCareerProfile(profile: CareerProfileDto) {
    this.calls.push('save-profile');
    this.sent.push(profile);
    this.profile = profile;
    return profile;
  }
  async opportunities() {
    return this.opportunityList;
  }
  async createOpportunity(command: CreateOpportunityCommand) {
    this.calls.push('create-opportunity');
    this.sent.push(command);
    const created: OpportunityDto = {
      id: `o${this.opportunityList.length + 1}`,
      title: command.title,
      kind: command.kind,
      status: command.status ?? 'ideia',
      notes: command.notes ?? '',
      updatedAt: '2026-11-08T12:00:00.000Z',
    };
    this.opportunityList = [created, ...this.opportunityList];
    return created;
  }
  async updateOpportunity(id: string, command: UpdateOpportunityCommand) {
    this.calls.push(`update-opportunity:${id}`);
    this.sent.push(command);
    this.opportunityList = this.opportunityList.map((o) =>
      o.id === id && command.status ? { ...o, status: command.status } : o,
    );
    return this.opportunityList.find((o) => o.id === id) as OpportunityDto;
  }
  async deleteOpportunity(id: string) {
    this.calls.push(`delete-opportunity:${id}`);
    this.opportunityList = this.opportunityList.filter((o) => o.id !== id);
  }
  // ---------------------------------------------------------------- rotina mensal
  reminder: AnalysisReminderDto = { month: '2026-10', pending: true };
  async analysisReminder() {
    return this.reminder;
  }
  async recordAnalysis(month: string, outcome: RecordAnalysisCommand['outcome']) {
    this.calls.push(`record-analysis:${month}:${outcome}`);
    this.reminder = { month, pending: false, outcome, recordedAt: '2026-11-09T12:00:00.000Z' };
    return this.reminder;
  }

  async requiredIncome(query: PlanQuery & { deadline?: string }): Promise<RequiredIncomeDto> {
    this.planQueries.push(query);
    return {
      months: this.plan.months,
      ...(query.deadline ? { deadline: query.deadline } : {}),
      steps: [
        { goalId: 'g1', monthlyIncome: brl(180000), startMonth: '2026-12' },
        { goalId: 'g2', monthlyIncome: brl(query.deadline ? 260000 : 195000), startMonth: '2027-02' },
      ],
    };
  }
}
