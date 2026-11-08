import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { Goal, InvalidGoalError } from './goal.js';
import { simulatePlan } from './plan-simulator.js';

// Números SINTÉTICOS, conferidos à mão.
const r = Money.fromReais;
const months = (count: number) => YearMonth.parse('2027-01').sequence(count);
const flat = (reais: number, count: number) => months(count).map(() => r(reais));
const baseline = {
  monthlySpending: r(1500),
  byCategory: new Map([
    ['transporte.app', r(300)],
    ['alimentacao.delivery', r(200)],
    ['moradia.aluguel', r(350)],
    ['outros', r(650)],
  ]),
};
const goal = (props: Partial<Parameters<typeof Goal.create>[0]> & { id: string }) =>
  Goal.create({
    name: props.id,
    kind: 'purchase',
    price: Money.zero(),
    downPayment: Money.zero(),
    oneTimeCosts: Money.zero(),
    financing: { kind: 'cash' },
    recurringCosts: [],
    ...props,
  });

describe('Goal: quanto custa', () => {
  it('Tabela Price: parcela e custo total (conferido em decimal de alta precisão: 19.200 em 48x a 1,99% a.m. = R$ 624,68)', () => {
    const financed = goal({
      id: 'moto',
      price: r(24000),
      downPayment: r(4800),
      oneTimeCosts: r(1200),
      financing: { kind: 'loan', installments: 48, monthlyRate: 0.0199 },
    });
    expect(financed.installment().cents).toBe(62468);
    expect(financed.upfront().cents).toBe(600000);
    expect(financed.totalCost().cents).toBe(600000 + 62468 * 48);
  });

  it('taxa zero, sem juros no cartão, consórcio e à vista', () => {
    expect(
      goal({ id: 'a', price: r(1200), financing: { kind: 'loan', installments: 12, monthlyRate: 0 } }).installment()
        .cents,
    ).toBe(10000);
    expect(
      goal({ id: 'b', price: r(3300), financing: { kind: 'interest_free', installments: 12 } }).installment().cents,
    ).toBe(27500);
    // consórcio: (24.000 × 1,15) / 72 = 383,33
    expect(
      goal({
        id: 'c',
        price: r(24000),
        financing: { kind: 'consortium', installments: 72, adminFeeRate: 0.15 },
      }).installment().cents,
    ).toBe(38333);
    const cash = goal({ id: 'd', price: r(1000), oneTimeCosts: r(200) });
    expect(cash.upfront().cents).toBe(120000);
    expect(cash.installment().cents).toBe(0);
  });

  it('validates nonsense', () => {
    expect(() =>
      goal({ id: 'x', price: r(100), downPayment: r(200), financing: { kind: 'interest_free', installments: 2 } }),
    ).toThrow(InvalidGoalError);
    expect(() =>
      goal({ id: 'x', price: r(100), financing: { kind: 'loan', installments: 0, monthlyRate: 0.01 } }),
    ).toThrow(InvalidGoalError);
    expect(() => goal({ id: ' ', price: r(100) })).toThrow(InvalidGoalError);
  });
});

describe('simulatePlan: metas em sequência, mês a mês', () => {
  it('juntar para pagar à vista: começa quando o dinheiro da entrada existe', () => {
    // sobra 500/mês (2.000 − 1.500); meta de 1.000 à vista: jan +500, fev +500 → em março há 1.000
    const plan = simulatePlan({
      goals: [goal({ id: 'cnh', price: r(1000) })],
      baseline,
      months: months(6),
      income: flat(2000, 6),
      startingSavings: Money.zero(),
      minSlackRatio: 0.1,
    });
    expect(plan.goals[0]).toMatchObject({ goalId: 'cnh', status: 'scheduled', monthsWaiting: 2 });
    expect(plan.goals[0]?.startMonth?.toString()).toBe('2027-03');
    expect(plan.timeline.map((m) => m.savings.cents / 100)).toEqual([500, 1000, 500, 1000, 1500, 2000]);
  });

  it('uma meta que SUBSTITUI um gasto atual (bike elétrica no lugar do app) e soa a manutenção', () => {
    // bike 12x de 275 + manter 80, substituindo transporte por app (300): gasto vai de 1.500 para 1.500 − 300 + 80 + 275 = 1.555
    const plan = simulatePlan({
      goals: [
        goal({
          id: 'bike',
          price: r(3300),
          financing: { kind: 'interest_free', installments: 12 },
          recurringCosts: [
            { name: 'manutenção', monthly: r(80) },
            { name: 'sem app', monthly: Money.zero(), replacesCategoryId: 'transporte.app' },
          ],
        }),
      ],
      baseline,
      months: months(14),
      income: flat(2000, 14),
      startingSavings: Money.zero(),
      minSlackRatio: 0.1,
    });
    expect(plan.goals[0]?.startMonth?.toString()).toBe('2027-01');
    expect(plan.goals[0]?.monthlyCost.cents).toBe(27500 + 8000 - 30000);
    expect(plan.timeline[0]?.spending.cents).toBe(155500);
    // depois da 12ª parcela, só a manutenção: 1.500 − 300 + 80 = 1.280
    expect(plan.timeline[12]?.spending.cents).toBe(128000);
  });

  it('não começa se a renda cai no meio das parcelas e o plano ficaria no vermelho (alerta de horizonte)', () => {
    // renda 3.000 por 6 meses e depois 1.600 (uma bolsa acaba); financiamento de 48x de ~625 só caberia com a renda maior
    const income = [...flat(3000, 6), ...flat(1600, 42)];
    const plan = simulatePlan({
      goals: [
        goal({
          id: 'moto',
          price: r(24000),
          downPayment: Money.zero(),
          financing: { kind: 'loan', installments: 48, monthlyRate: 0.0199 },
        }),
      ],
      baseline,
      months: months(48),
      income,
      startingSavings: Money.zero(),
      minSlackRatio: 0.1,
    });
    expect(plan.goals[0]?.status).toBe('not_feasible');
    expect(plan.goals[0]?.startMonth).toBeUndefined();
    expect(plan.goals[0]?.alerts).toContain('income_drops');
  });

  it('metas em sequência: a segunda espera a primeira e o dinheiro dela', () => {
    const plan = simulatePlan({
      goals: [goal({ id: 'cnh', price: r(1000) }), goal({ id: 'reserva', kind: 'reserve', price: r(1500) })],
      baseline,
      months: months(8),
      income: flat(2000, 8),
      startingSavings: Money.zero(),
      minSlackRatio: 0.1,
    });
    // cnh em mar (poupança 1.000 → 0); reserva precisa de 1.500: abr 500, mai 1.000, jun 1.500 → começa em jun
    expect(plan.goals.map((g) => g.startMonth?.toString())).toEqual(['2027-03', '2027-06']);
  });

  it('mostra no máximo as 3 maiores alavancas de corte, mesmo quando falta muito', () => {
    const many = {
      monthlySpending: r(1500),
      byCategory: new Map(['a', 'b', 'c', 'd', 'e'].map((id, i) => [`grupo${id}.x`, r(300 - i * 10)])),
    };
    const plan = simulatePlan({
      goals: [goal({ id: 'caro', kind: 'lifestyle', recurringCosts: [{ name: 'x', monthly: r(5000) }] })],
      baseline: many,
      months: months(12),
      income: flat(2000, 12),
      startingSavings: Money.zero(),
      minSlackRatio: 0.1,
    });
    expect(plan.goals[0]?.levers.filter((l) => l.kind === 'cut').map((l) => l.categoryId)).toEqual([
      'grupoa.x',
      'grupob.x',
      'grupoc.x',
    ]);
  });

  it('respeita a folga mínima e mostra as alavancas quando a meta não cabe', () => {
    // aluguel de 1.600 substituindo os 350 de casa: gasto 1.500 − 350 + 1.600 = 2.750 > renda 2.000
    const plan = simulatePlan({
      goals: [
        goal({
          id: 'ape',
          kind: 'lifestyle',
          recurringCosts: [
            { name: 'aluguel + condomínio + contas', monthly: r(1600), replacesCategoryId: 'moradia.aluguel' },
          ],
        }),
      ],
      baseline,
      months: months(12),
      income: flat(2000, 12),
      startingSavings: Money.zero(),
      minSlackRatio: 0.1,
    });
    const ape = plan.goals[0];
    expect(ape?.status).toBe('not_feasible');
    // falta: 2.750 + 10% de 2.000 (folga) − 2.000 = 950 por mês
    expect(ape?.monthlyGap?.cents).toBe(95000);
    expect(ape?.levers[0]).toEqual({ kind: 'extra_income', amount: r(950) });
    // cortes sugeridos nas categorias que não são essenciais, até 30% de cada
    expect(ape?.levers.filter((l) => l.kind === 'cut').map((l) => l.categoryId)).toEqual([
      'outros',
      'transporte.app',
      'alimentacao.delivery',
    ]);
  });
});
