import type {
  AccountDto,
  CategoryDto,
  InstallmentPurchaseDto,
  MonthlyReportDto,
  SyncRunDto,
  TransactionDto,
  TransactionPageDto,
} from '@finapp/contracts';
import { ApiError } from '../src/lib/api/api-client';
import type { FinanceApi, TransactionSearch } from '../src/lib/api/finance-api';

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
}
