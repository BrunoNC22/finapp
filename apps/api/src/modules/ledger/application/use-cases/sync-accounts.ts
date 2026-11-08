import type { Clock } from '../../../../shared/application/clock.js';
import type { IdGenerator } from '../../../../shared/application/id-generator.js';
import { Document } from '../../../../shared/kernel/document.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Account } from '../../domain/account.js';
import { Categorizer } from '../../domain/categorization/categorizer.js';
import { LearnedCategories } from '../../domain/categorization/learned-categories.js';
import { Installment } from '../../domain/installment.js';
import { InternalTransferMatcher } from '../../domain/services/internal-transfer-matcher.js';
import { Transaction, type TransactionProps } from '../../domain/transaction.js';
import type { AccountRepository } from '../ports/account-repository.js';
import type { CategorizationRuleRepository } from '../ports/categorization-rule-repository.js';
import type { OpenFinanceProvider, ProviderAccount, ProviderTransaction } from '../ports/open-finance-provider.js';
import type { RawPayloadStore, SyncAccountResult, SyncLock, SyncRun, SyncRunRepository } from '../ports/sync-ports.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export class SyncInProgressError extends Error {
  constructor() {
    super('sincronização já em andamento');
    this.name = 'SyncInProgressError';
  }
}

export interface SyncAccountsDependencies {
  readonly provider: OpenFinanceProvider;
  readonly accounts: AccountRepository;
  readonly transactions: TransactionRepository;
  readonly rules: CategorizationRuleRepository;
  readonly runs: SyncRunRepository;
  readonly lock: SyncLock;
  readonly raw: RawPayloadStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Fuso para converter instantes em datas de calendário. */
  readonly timeZone?: string;
  /** Quantos dias antes da última sincronização revisitar (lançamentos tardios, parcelas). */
  readonly overlapDays?: number;
  /** Histórico pedido na primeira sincronização de uma conta. */
  readonly initialMonths?: number;
}

const LOCK_KEY = 'ledger-sync';
const LOCK_TTL_MS = 30 * 60 * 1000;
/** Uma transação pendente que sumiu pode reaparecer lançada até alguns dias depois. */
const PENDING_TWIN_MAX_DAYS = 3;

/**
 * Traz contas e transações do provedor de Open Finance e as torna confiáveis:
 * - idempotente (upsert pelo id externo; rodar de novo não muda nada);
 * - tolerante a buracos (revisita uma janela que sobrepõe a última sincronização);
 * - preserva decisões do usuário, inclusive quando o provedor recria uma pendente com outro id;
 * - uma conta com erro não interrompe as outras;
 * - depois de importar, categoriza e concilia transferências na janela afetada.
 */
export class SyncAccounts {
  private readonly timeZone: string;
  private readonly overlapDays: number;
  private readonly initialMonths: number;

  constructor(private readonly deps: SyncAccountsDependencies) {
    this.timeZone = deps.timeZone ?? 'America/Sao_Paulo';
    this.overlapDays = deps.overlapDays ?? 35;
    this.initialMonths = deps.initialMonths ?? 12;
  }

  /**
   * `full`: revisita a janela inicial inteira (12 meses) em todas as contas. Serve para aplicar
   * regras de mapeamento/conciliação melhoradas aos meses antigos. Decisões manuais são preservadas.
   */
  async execute(options: { full?: boolean } = {}): Promise<SyncRun> {
    if (!(await this.deps.lock.acquire(LOCK_KEY, LOCK_TTL_MS))) throw new SyncInProgressError();
    try {
      return await this.run(options.full ?? false);
    } finally {
      await this.deps.lock.release(LOCK_KEY);
    }
  }

  private async run(full: boolean): Promise<SyncRun> {
    const startedAt = this.deps.clock.now();
    const today = LocalDate.fromInstant(startedAt, this.timeZone);
    const results: SyncAccountResult[] = [];
    let earliestTouched: LocalDate | undefined;

    for (const connection of await this.deps.provider.listConnections()) {
      let providerAccounts: ProviderAccount[];
      try {
        providerAccounts = await this.deps.provider.listAccounts(connection.id);
      } catch (error) {
        results.push({
          accountExternalId: `conexão ${connection.id}`,
          created: 0,
          updated: 0,
          removed: 0,
          error: safeMessage(error),
        });
        continue;
      }
      for (const providerAccount of providerAccounts) {
        try {
          const account = await this.upsertAccount(providerAccount);
          const from =
            account.lastSyncedAt && !full
              ? LocalDate.fromInstant(account.lastSyncedAt, this.timeZone).addDays(-this.overlapDays)
              : today.addMonths(-this.initialMonths);
          const received = await this.deps.provider.listTransactions(providerAccount.externalId, { from, to: today });
          results.push(await this.importTransactions(account, received, { from, to: today }));
          account.recordBalance(providerAccount.balance, startedAt, providerAccount.creditLimit);
          await this.deps.accounts.save(account);
          if (!earliestTouched || from.isBefore(earliestTouched)) earliestTouched = from;
        } catch (error) {
          results.push({
            accountExternalId: providerAccount.externalId,
            created: 0,
            updated: 0,
            removed: 0,
            error: safeMessage(error),
          });
        }
      }
    }

    const post = earliestTouched
      ? await this.postProcess(earliestTouched, today)
      : { pairs: 0, ambiguous: 0, uncategorized: 0 };
    const failures = results.filter((r) => r.error).length;
    const run: SyncRun = {
      id: this.deps.ids.next(),
      startedAt,
      finishedAt: this.deps.clock.now(),
      status: failures === 0 ? 'success' : failures === results.length ? 'failed' : 'partial',
      accounts: results,
      transferPairs: post.pairs,
      ambiguousTransfers: post.ambiguous,
      uncategorized: post.uncategorized,
    };
    await this.deps.runs.save(run);
    return run;
  }

  private async upsertAccount(p: ProviderAccount): Promise<Account> {
    return (
      (await this.deps.accounts.findByExternalId(p.externalId)) ??
      Account.create({
        id: this.deps.ids.next(),
        externalId: p.externalId,
        institutionName: p.institutionName,
        kind: p.kind,
        holderDocument: Document.parse(p.holderDocument),
        displayName: Account.nameFromProvider(p.institutionName, p.name),
      })
    );
  }

  private async importTransactions(
    account: Account,
    received: readonly ProviderTransaction[],
    window: { from: LocalDate; to: LocalDate },
  ): Promise<SyncAccountResult> {
    const local = await this.deps.transactions.findInPeriod({ ...window, accountIds: [account.id] });
    const byExternalId = new Map(local.map((t) => [t.externalId, t]));
    const seen = new Set<string>();
    const created: Transaction[] = [];
    const toSave: Transaction[] = [];
    const raw: { transactionId: string; raw: unknown }[] = [];
    let updated = 0;

    for (const item of received) {
      seen.add(item.externalId);
      const existing =
        byExternalId.get(item.externalId) ??
        (await this.deps.transactions.findByExternalId(account.id, item.externalId));
      if (existing) {
        const props = toProps(item, existing.id, account.id);
        if (sameProviderData(existing.snapshot().props, props)) continue;
        existing.refreshFromProvider(props);
        updated++;
        toSave.push(existing);
        raw.push({ transactionId: existing.id, raw: item.raw });
        continue;
      }
      const transaction = Transaction.record(toProps(item, this.deps.ids.next(), account.id));
      created.push(transaction);
      toSave.push(transaction);
      raw.push({ transactionId: transaction.id, raw: item.raw });
    }

    // Pendentes que não vieram mais: o provedor as recriou (lançadas) com outro id ou as cancelou.
    // Lançadas (posted) que não vieram NUNCA são removidas: a ausência pode ser só limite da consulta.
    const vanished = local.filter((t) => t.status === 'pending' && !seen.has(t.externalId));
    const adopted = new Set<string>();
    for (const old of vanished) {
      const twin = created.find(
        (c) =>
          !adopted.has(c.id) &&
          c.amount.equals(old.amount) &&
          c.occurredOn.daysBetween(old.occurredOn) <= PENDING_TWIN_MAX_DAYS,
      );
      if (!twin) continue;
      twin.inheritUserDecisionsFrom(old);
      adopted.add(twin.id);
    }

    await this.deps.transactions.saveMany(toSave);
    await this.deps.raw.putMany(raw);
    const removedIds = vanished.map((t) => t.id);
    await this.deps.transactions.deleteMany(removedIds);
    await this.deps.raw.deleteMany(removedIds);
    return { accountExternalId: account.externalId, created: created.length, updated, removed: removedIds.length };
  }

  /** Recategoriza e concilia a janela afetada (com margem para pares que cruzam a borda). */
  private async postProcess(
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ pairs: number; ambiguous: number; uncategorized: number }> {
    const accounts = await this.deps.accounts.findAll();
    const transactions = await this.deps.transactions.findInPeriod({ from: from.addDays(-5), to });
    const matcher = new InternalTransferMatcher().match(transactions, accounts);
    const categorization = new Categorizer(this.deps.provider.categoryMap).categorize(
      transactions,
      await this.deps.rules.findAll(),
      LearnedCategories.from(await this.deps.transactions.findManuallyCategorized()),
    );
    await this.deps.transactions.saveMany(transactions);
    return {
      pairs: matcher.pairs.length,
      ambiguous: matcher.ambiguous.length,
      uncategorized: categorization.uncategorized,
    };
  }
}

function toProps(item: ProviderTransaction, id: string, accountId: string): TransactionProps {
  let document: Document | undefined;
  try {
    document = item.counterparty?.document ? Document.parse(item.counterparty.document) : undefined;
  } catch {
    document = undefined; // documento malformado do provedor: segue sem ele
  }
  const counterparty =
    item.counterparty?.name || document
      ? { ...(item.counterparty?.name ? { name: item.counterparty.name } : {}), ...(document ? { document } : {}) }
      : undefined;
  const installment =
    item.installment && item.paymentMethod === 'card_purchase'
      ? Installment.of({
          number: item.installment.number,
          total: item.installment.total,
          installmentAmount: item.amount,
          ...(item.installment.totalAmount ? { totalAmount: item.installment.totalAmount } : {}),
          ...(item.installment.purchaseDate ? { purchaseDate: item.installment.purchaseDate } : {}),
        })
      : undefined;
  return {
    id,
    accountId,
    externalId: item.externalId,
    occurredOn: item.occurredOn,
    amount: item.amount,
    description: item.description.trim() || '(sem descrição)',
    paymentMethod: item.paymentMethod,
    status: item.status,
    ...(counterparty ? { counterparty } : {}),
    ...(installment ? { installment } : {}),
    ...(item.providerCategoryId ? { providerCategoryId: item.providerCategoryId } : {}),
  };
}

function sameProviderData(a: TransactionProps, b: TransactionProps): boolean {
  return (
    a.status === b.status &&
    a.amount.equals(b.amount) &&
    a.description === b.description &&
    a.occurredOn.equals(b.occurredOn) &&
    a.paymentMethod === b.paymentMethod &&
    a.providerCategoryId === b.providerCategoryId &&
    a.installment?.label === b.installment?.label &&
    a.counterparty?.name === b.counterparty?.name &&
    (a.counterparty?.document?.value ?? '') === (b.counterparty?.document?.value ?? '')
  );
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido';
}
