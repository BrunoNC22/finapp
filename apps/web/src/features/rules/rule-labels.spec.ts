import { describe, expect, it } from 'vitest';
import { aTransaction } from '../../../test/finance-fixtures';
import { ruleSummary, suggestCondition } from './rule-labels';

describe('rule suggestions', () => {
  it('uses a stable part of the description, without numbers or codes', () => {
    expect(suggestCondition(aTransaction({ description: 'SUPERMERCADO EXEMPLO 0412*23' }))).toEqual({
      kind: 'descriptionContains',
      value: 'supermercado exemplo',
    });
  });

  it('uses the counterparty when the description is generic (Pix, transferência)', () => {
    expect(
      suggestCondition(aTransaction({ description: 'Pix enviado', counterpartyName: 'Academia Exemplo' })),
    ).toEqual({ kind: 'counterpartyNameContains', value: 'academia exemplo' });
  });

  it('summarizes the conditions of a rule', () => {
    expect(
      ruleSummary({
        id: 'r1',
        name: 'x',
        categoryId: 'c',
        priority: 1,
        enabled: true,
        descriptionContains: 'mercado',
        direction: 'outflow',
        maxAmountCents: 5000,
      }),
    ).toBe('descrição contém “mercado” · saídas · até R$\u00a050,00');
  });
});
