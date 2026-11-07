import type { Installment } from '../../src/modules/ledger/domain/installment.js';
import {
  type Counterparty,
  type PaymentMethod,
  Transaction,
  type TransactionStatus,
} from '../../src/modules/ledger/domain/transaction.js';
import { Document } from '../../src/shared/kernel/document.js';
import { LocalDate } from '../../src/shared/kernel/local-date.js';
import { Money } from '../../src/shared/kernel/money.js';

let sequence = 0;

/** Builder de transações com dados 100% sintéticos. */
export class TransactionBuilder {
  private id = `tx-${++sequence}`;
  private accountId = 'acc-1';
  private externalId = `ext-tx-${sequence}`;
  private occurredOn = LocalDate.parse('2026-01-15');
  private amount = Money.fromCents(-1000);
  private description = 'Compra sintética';
  private paymentMethod: PaymentMethod = 'card_purchase';
  private status: TransactionStatus = 'posted';
  private counterparty: Counterparty | undefined;
  private installment: Installment | undefined;
  private providerCategoryId: string | undefined;

  withId(id: string): this {
    this.id = id;
    return this;
  }
  withAccount(accountId: string): this {
    this.accountId = accountId;
    return this;
  }
  withExternalId(externalId: string): this {
    this.externalId = externalId;
    return this;
  }
  on(isoDate: string): this {
    this.occurredOn = LocalDate.parse(isoDate);
    return this;
  }
  withAmount(cents: number): this {
    this.amount = Money.fromCents(cents);
    return this;
  }
  withDescription(description: string): this {
    this.description = description;
    return this;
  }
  withPaymentMethod(method: PaymentMethod): this {
    this.paymentMethod = method;
    return this;
  }
  withStatus(status: TransactionStatus): this {
    this.status = status;
    return this;
  }
  withCounterparty(name: string | undefined, document?: string): this {
    this.counterparty = {
      ...(name ? { name } : {}),
      ...(document ? { document: Document.parse(document) } : {}),
    };
    return this;
  }
  withInstallment(installment: Installment): this {
    this.installment = installment;
    return this;
  }
  withProviderCategory(categoryId: string): this {
    this.providerCategoryId = categoryId;
    return this;
  }

  build(): Transaction {
    return Transaction.record({
      id: this.id,
      accountId: this.accountId,
      externalId: this.externalId,
      occurredOn: this.occurredOn,
      amount: this.amount,
      description: this.description,
      paymentMethod: this.paymentMethod,
      status: this.status,
      ...(this.counterparty ? { counterparty: this.counterparty } : {}),
      ...(this.installment ? { installment: this.installment } : {}),
      ...(this.providerCategoryId ? { providerCategoryId: this.providerCategoryId } : {}),
    });
  }
}

export const aTransaction = () => new TransactionBuilder();
