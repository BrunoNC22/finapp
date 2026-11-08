import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { Goal } from './goal.js';
import { requiredIncome } from './required-income.js';

// SINTÉTICO, conferido à mão.
const r = Money.fromReais;
const months = YearMonth.parse('2027-01').sequence(12);
const baseline = { monthlySpending: r(1500), byCategory: new Map([['moradia.aluguel', r(350)]]) };
const goal = (id: string, extra: Partial<Parameters<typeof Goal.create>[0]> = {}) =>
  Goal.create({
    id,
    name: id,
    kind: 'purchase',
    price: Money.zero(),
    downPayment: Money.zero(),
    oneTimeCosts: Money.zero(),
    financing: { kind: 'cash' },
    recurringCosts: [],
    ...extra,
  });
const base = { baseline, months, startingSavings: Money.zero(), minSlackRatio: 0.1 };

describe('requiredIncome: a menor renda mensal estável que realiza as metas', () => {
  it('sem prazo, o limite é a folga: 1.500 / 0,9 = 1.666,67 (e com ela a meta de 1.000 sai no 7º mês)', () => {
    const [step] = requiredIncome({ ...base, goals: [goal('cnh', { price: r(1000) })] });
    expect(step?.monthlyIncome?.cents).toBe(166667);
    expect(step?.startMonth?.toString()).toBe('2027-07');
  });

  it('com prazo, é preciso juntar a largada a tempo: 1.000 até o 3º mês → 2 sobras de 500 → 2.000', () => {
    const [step] = requiredIncome({
      ...base,
      goals: [goal('cnh', { price: r(1000) })],
      deadline: YearMonth.parse('2027-03'),
    });
    expect(step?.monthlyIncome?.cents).toBe(200000);
    expect(step?.startMonth?.toString()).toBe('2027-03');
  });

  it('é cumulativa na sequência: cada degrau inclui as metas anteriores', () => {
    // apê: 1.600/mês substituindo os 350 de aluguel → gasto 2.750 → 2.750 / 0,9 = 3.055,56
    const steps = requiredIncome({
      ...base,
      goals: [
        goal('cnh', { price: r(1000) }),
        goal('ape', {
          kind: 'lifestyle',
          recurringCosts: [{ name: 'aluguel', monthly: r(1600), replacesCategoryId: 'moradia.aluguel' }],
        }),
      ],
    });
    expect(steps.map((s) => [s.goalId, s.monthlyIncome?.cents])).toEqual([
      ['cnh', 166667],
      ['ape', 305556],
    ]);
  });

  it('says when no income in range achieves it', () => {
    const [step] = requiredIncome({
      ...base,
      goals: [goal('impossivel', { price: r(1000) })],
      deadline: YearMonth.parse('2026-12'),
    });
    expect(step?.monthlyIncome).toBeUndefined();
  });
});
