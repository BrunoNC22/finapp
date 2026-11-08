import type {
  AccountDto,
  CategoryDto,
  InstallmentPurchaseDto,
  MonthlyReportDto,
  SyncRunDto,
  TransactionDto,
  TransactionPageDto,
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
