import {
  OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderTransaction,
} from '../../src/modules/ledger/application/ports/open-finance-provider.js';
import type { ProviderCategoryMap } from '../../src/modules/ledger/domain/categorization/categorizer.js';
import type { LocalDate } from '../../src/shared/kernel/local-date.js';
import { StubProviderCategoryMap } from './in-memory-categorization.js';

/**
 * Provedor controlável pelo teste (stub + spy): o teste define contas e transações,
 * pode fazer uma conta falhar, e inspeciona os períodos consultados.
 */
export class StubOpenFinanceProvider extends OpenFinanceProvider {
  readonly categoryMap: ProviderCategoryMap = new StubProviderCategoryMap();
  readonly requestedRanges: { account: string; from: string; to: string }[] = [];
  private readonly failing = new Set<string>();

  constructor(
    public accounts: ProviderAccount[],
    public transactions: ProviderTransaction[] = [],
  ) {
    super();
  }

  failOn(accountExternalId: string): void {
    this.failing.add(accountExternalId);
  }

  async listConnections(): Promise<ProviderConnection[]> {
    return [...new Set(this.accounts.map((a) => a.connectionId))].map((id) => ({
      id,
      institutionName: id,
      status: 'active',
    }));
  }

  async listAccounts(connectionId: string): Promise<ProviderAccount[]> {
    return this.accounts.filter((a) => a.connectionId === connectionId);
  }

  async listTransactions(
    accountExternalId: string,
    range: { from: LocalDate; to: LocalDate },
  ): Promise<ProviderTransaction[]> {
    this.requestedRanges.push({ account: accountExternalId, from: range.from.toString(), to: range.to.toString() });
    if (this.failing.has(accountExternalId)) throw new Error('provider unavailable');
    return this.transactions.filter(
      (t) =>
        t.accountExternalId === accountExternalId &&
        !t.occurredOn.isBefore(range.from) &&
        !t.occurredOn.isAfter(range.to),
    );
  }
}
