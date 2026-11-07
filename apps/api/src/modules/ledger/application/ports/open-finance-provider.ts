import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { Money } from '../../../../shared/kernel/money.js';
import type { AccountKind } from '../../domain/account.js';
import type { ProviderCategoryMap } from '../../domain/categorization/categorizer.js';
import type { PaymentMethod, TransactionStatus } from '../../domain/transaction.js';

export interface ProviderConnection {
  readonly id: string;
  readonly institutionName: string;
  readonly status: 'active' | 'error' | 'expired';
  /** Quando a autorização de leitura expira (Open Finance: até 12 meses). */
  readonly consentExpiresAt?: Date;
  readonly lastUpdatedAt?: Date;
}

/** Conta já normalizada para os termos do domínio. */
export interface ProviderAccount {
  readonly externalId: string;
  readonly connectionId: string;
  readonly institutionName: string;
  readonly name: string;
  readonly kind: AccountKind;
  /** CPF/CNPJ do titular (o adapter herda da conta bancária da mesma conexão quando faltar). */
  readonly holderDocument: string;
  readonly balance: Money;
  readonly creditLimit?: Money;
}

/** Transação já normalizada: sinal do ponto de vista do usuário, data local, forma de pagamento. */
export interface ProviderTransaction {
  readonly externalId: string;
  readonly accountExternalId: string;
  readonly occurredOn: LocalDate;
  readonly amount: Money;
  readonly description: string;
  readonly paymentMethod: PaymentMethod;
  readonly status: TransactionStatus;
  readonly counterparty?: { readonly name?: string; readonly document?: string };
  readonly installment?: {
    readonly number: number;
    readonly total: number;
    readonly totalAmount?: Money;
    readonly purchaseDate?: LocalDate;
  };
  readonly providerCategoryId?: string;
  /** Payload original do provedor, guardado para reprocessamento. Nunca logado. */
  readonly raw: unknown;
}

/**
 * Porta de Open Finance (ADR 0005). Adapters: Pluggy (dados reais) e Demo (dados sintéticos).
 * Toda a tradução do formato do provedor acontece no adapter.
 */
export abstract class OpenFinanceProvider {
  /** Mapa das categorias deste provedor para a taxonomia do app. */
  abstract readonly categoryMap: ProviderCategoryMap;
  abstract listConnections(): Promise<ProviderConnection[]>;
  abstract listAccounts(connectionId: string): Promise<ProviderAccount[]>;
  /** Datas inclusivas. */
  abstract listTransactions(
    accountExternalId: string,
    range: { readonly from: LocalDate; readonly to: LocalDate },
  ): Promise<ProviderTransaction[]>;
}
