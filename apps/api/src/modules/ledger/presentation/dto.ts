import type {
  AccountDto,
  CategorizationRuleDto,
  CategoryDto,
  InstallmentPurchaseDto,
  MoneyDto,
  TransactionDto,
} from '@finapp/contracts';
import { BadRequestException } from '@nestjs/common';
import type { Money } from '../../../shared/kernel/money.js';
import type { TransactionCursor } from '../application/ports/transaction-queries.js';
import type { Account } from '../domain/account.js';
import type { CategorizationRule } from '../domain/categorization/categorization-rule.js';
import type { Category } from '../domain/categorization/category.js';
import type { InstallmentPurchase } from '../domain/services/installment-grouper.js';
import type { Transaction } from '../domain/transaction.js';

/** Entidades → DTOs do contrato. Documentos de contraparte nunca saem da API. */

export const money = (value: Money): MoneyDto => ({ cents: value.cents, currency: 'BRL' });

export function toAccountDto(account: Account): AccountDto {
  return {
    id: account.id,
    displayName: account.displayName,
    institutionName: account.institutionName,
    kind: account.kind,
    holderType: account.holderType,
    balance: money(account.currentBalance),
    ...(account.creditLimit ? { creditLimit: money(account.creditLimit) } : {}),
    ...(account.lastSyncedAt ? { lastSyncedAt: account.lastSyncedAt.toISOString() } : {}),
  };
}

export function toTransactionDto(t: Transaction): TransactionDto {
  return {
    id: t.id,
    accountId: t.accountId,
    occurredOn: t.occurredOn.toString(),
    amount: money(t.amount),
    description: t.description,
    paymentMethod: t.paymentMethod,
    status: t.status,
    ...(t.counterparty?.name ? { counterpartyName: t.counterparty.name } : {}),
    ...(t.installment
      ? {
          installment: {
            number: t.installment.number,
            total: t.installment.total,
            totalAmount: money(t.installment.totalAmount),
            totalAmountIsEstimated: t.installment.totalAmountIsEstimated,
          },
        }
      : {}),
    classification: t.classification,
    classificationSource: t.classificationSource,
    ...(t.transferLink ? { transferLinkId: t.transferLink } : {}),
    ...(t.category ? { category: { id: t.category.categoryId, source: t.category.source } } : {}),
  };
}

export function toCategoryDto(c: Category): CategoryDto {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    archived: c.archived,
    ...(c.parentId ? { parentId: c.parentId } : {}),
  };
}

export function toRuleDto(rule: CategorizationRule): CategorizationRuleDto {
  const {
    id,
    name,
    categoryId,
    priority,
    enabled,
    minAmount,
    maxAmount,
    counterpartyDocument: _hidden,
    ...conditions
  } = rule.props;
  return {
    id,
    name,
    categoryId,
    priority,
    enabled,
    ...conditions,
    ...(minAmount ? { minAmountCents: minAmount.cents } : {}),
    ...(maxAmount ? { maxAmountCents: maxAmount.cents } : {}),
  };
}

export function toInstallmentDto(p: InstallmentPurchase): InstallmentPurchaseDto {
  return {
    accountId: p.accountId,
    merchant: p.merchant,
    total: p.total,
    knownNumbers: p.knownNumbers,
    remainingCount: p.remainingCount,
    firstInstallmentMonth: p.firstInstallmentMonth,
    totalAmount: money(p.totalAmount),
    totalAmountIsEstimated: p.totalAmountIsEstimated,
    ...(p.purchaseDate ? { purchaseDate: p.purchaseDate.toString() } : {}),
    projected: p
      .projectRemaining()
      .map((i) => ({ number: i.number, expectedMonth: i.expectedMonth, amount: money(i.amount) })),
  };
}

/** Cursor opaco para o cliente (base64url de data + id). */
export function encodeCursor(cursor: TransactionCursor): string {
  return Buffer.from(JSON.stringify([cursor.occurredOn, cursor.id])).toString('base64url');
}

export function decodeCursor(value: string): TransactionCursor {
  try {
    const [occurredOn, id] = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown[];
    if (typeof occurredOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) && typeof id === 'string')
      return { occurredOn, id };
  } catch {
    // cai no erro abaixo
  }
  throw new BadRequestException({ message: 'cursor inválido' });
}
