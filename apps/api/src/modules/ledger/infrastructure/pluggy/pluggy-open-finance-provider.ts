import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import {
  OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderTransaction,
} from '../../application/ports/open-finance-provider.js';
import type { ProviderCategoryMap } from '../../domain/categorization/categorizer.js';
import { PluggyCategoryMap } from './pluggy-category-map.js';
import type { PluggyClient } from './pluggy-client.js';
import { institutionNameOf, mapAccount, mapTransaction } from './pluggy-mapper.js';
import type { PluggyAccount, PluggyItem, PluggyPage, PluggyTransaction } from './pluggy-types.js';

/**
 * Open Finance via Pluggy (Meu Pluggy, uso pessoal).
 * No Meu Pluggy não há API para listar os items: os ids vêm da configuração (PLUGGY_ITEM_IDS).
 */
export class PluggyOpenFinanceProvider extends OpenFinanceProvider {
  readonly categoryMap: ProviderCategoryMap = new PluggyCategoryMap();
  private readonly itemAccounts = new Map<string, PluggyAccount[]>();
  private readonly accounts = new Map<string, PluggyAccount>();

  constructor(
    private readonly client: PluggyClient,
    private readonly itemIds: readonly string[],
    private readonly timeZone = 'America/Sao_Paulo',
  ) {
    super();
  }

  async listConnections(): Promise<ProviderConnection[]> {
    const connections: ProviderConnection[] = [];
    for (const itemId of this.itemIds) {
      const item = await this.client.get<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);
      const accounts = await this.loadAccounts(itemId);
      connections.push({
        id: itemId,
        institutionName: institutionNameOf(accounts),
        status: connectionStatus(item),
        ...(item.consentExpiresAt ? { consentExpiresAt: new Date(item.consentExpiresAt) } : {}),
        ...(item.lastUpdatedAt ? { lastUpdatedAt: new Date(item.lastUpdatedAt) } : {}),
      });
    }
    return connections;
  }

  async listAccounts(connectionId: string): Promise<ProviderAccount[]> {
    const accounts = await this.loadAccounts(connectionId);
    return accounts.map((account) => mapAccount(account, accounts));
  }

  async listTransactions(
    accountExternalId: string,
    range: { readonly from: LocalDate; readonly to: LocalDate },
  ): Promise<ProviderTransaction[]> {
    const account =
      this.accounts.get(accountExternalId) ??
      (await this.client.get<PluggyAccount>(`/accounts/${encodeURIComponent(accountExternalId)}`));
    const query = new URLSearchParams({
      accountId: accountExternalId,
      dateFrom: range.from.toString(),
      dateTo: range.to.toString(),
    });
    const transactions: PluggyTransaction[] = [];
    let path: string | undefined = `/v2/transactions?${query}`;
    while (path) {
      const page: PluggyPage<PluggyTransaction> = await this.client.get(path);
      transactions.push(...page.results);
      // O cursor `next` é anexado ao caminho exatamente como veio (documentação da Pluggy).
      path = page.next ? `/v2/transactions${page.next}` : undefined;
    }
    return transactions.map((t) => mapTransaction(t, account, this.timeZone));
  }

  private async loadAccounts(itemId: string): Promise<PluggyAccount[]> {
    const page = await this.client.get<PluggyPage<PluggyAccount>>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
    this.itemAccounts.set(itemId, page.results);
    for (const account of page.results) this.accounts.set(account.id, account);
    return page.results;
  }
}

function connectionStatus(item: PluggyItem): ProviderConnection['status'] {
  const code = `${item.error?.code ?? ''} ${item.executionStatus ?? ''}`;
  if (/EXPIRED/.test(code)) return 'expired';
  if (item.status === 'UPDATED' || item.status === 'UPDATING') return 'active';
  return 'error';
}
