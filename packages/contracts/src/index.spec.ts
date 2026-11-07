import { describe, expect, it } from 'vitest';
import {
  CreateRuleCommandSchema,
  TransactionListQuerySchema,
  TransactionSchema,
  UpdateCategoryCommandSchema,
} from './index.js';

describe('contracts', () => {
  it('parses query strings with defaults and coercion', () => {
    const query = TransactionListQuerySchema.parse({ limit: '20', uncategorized: 'true', from: '2026-10-01' });
    expect(query).toEqual({ limit: 20, uncategorized: true, from: '2026-10-01' });
    expect(TransactionListQuerySchema.parse({}).limit).toBe(50);
  });

  it('rejects invalid filters', () => {
    expect(TransactionListQuerySchema.safeParse({ from: '01/10/2026' }).success).toBe(false);
    expect(TransactionListQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
    expect(TransactionListQuerySchema.safeParse({ classification: 'other' }).success).toBe(false);
  });

  it('money is always integer cents', () => {
    const base = {
      id: 't',
      accountId: 'a',
      occurredOn: '2026-10-01',
      description: 'x',
      paymentMethod: 'pix',
      status: 'posted',
      classification: 'expense',
      classificationSource: 'default',
    };
    expect(TransactionSchema.safeParse({ ...base, amount: { cents: -1050, currency: 'BRL' } }).success).toBe(true);
    expect(TransactionSchema.safeParse({ ...base, amount: { cents: -10.5, currency: 'BRL' } }).success).toBe(false);
  });

  it('applies rule defaults', () => {
    const rule = CreateRuleCommandSchema.parse({
      name: 'Aluguel',
      categoryId: 'moradia.aluguel',
      descriptionContains: 'aluguel',
    });
    expect(rule).toMatchObject({ priority: 100, enabled: true, applyToExisting: true });
  });

  it('category update needs something to change', () => {
    expect(UpdateCategoryCommandSchema.safeParse({}).success).toBe(false);
    expect(UpdateCategoryCommandSchema.safeParse({ archived: true }).success).toBe(true);
  });
});
