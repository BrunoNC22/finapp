import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { depreciatedValue, Goal, InvalidGoalError } from './goal.js';
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

describe('Goal: categoria do bem e revenda', () => {
  it('categoria só informativa, só em metas de compra; nome livre só em "outro"', () => {
    expect(goal({ id: 'moto', category: { kind: 'vehicle' } }).props.category).toEqual({ kind: 'vehicle' });
    expect(goal({ id: 'x', category: { kind: 'other', label: ' Instrumento ' } }).props.category).toEqual({
      kind: 'other',
      label: 'Instrumento',
    });
    expect(() => goal({ id: 'x', kind: 'reserve', category: { kind: 'vehicle' } })).toThrow(InvalidGoalError);
    expect(() => goal({ id: 'x', category: { kind: 'vehicle', label: 'moto' } })).toThrow(InvalidGoalError);
  });

  it('valida os bens vendidos na largada', () => {
    const owned = (name: string, reais: number) => ({ kind: 'owned' as const, name, currentValue: r(reais) });
    const ok = goal({
      id: 'moto',
      tradeIns: [
        { source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: 0.2 },
        { source: owned(' Notebook ', 1500), annualDepreciationRate: 0 },
      ],
    });
    expect(ok.tradeIns.map((t) => (t.source.kind === 'owned' ? t.source.name : t.source.goalId))).toEqual([
      'bike',
      'Notebook',
    ]);
    expect(goal({ id: 'cnh' }).tradeIns).toEqual([]);
    const invalid = [
      [{ source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: 1 }],
      [{ source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: -0.1 }],
      [{ source: { kind: 'goal', goalId: 'moto' }, annualDepreciationRate: 0.1 }],
      [
        { source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: 0.1 },
        { source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: 0.2 },
      ],
      [{ source: owned(' ', 100), annualDepreciationRate: 0.1 }],
      [{ source: owned('PC', -1), annualDepreciationRate: 0.1 }],
    ] as const;
    for (const tradeIns of invalid) expect(() => goal({ id: 'moto', tradeIns })).toThrow(InvalidGoalError);
  });

  it('desvalorização anual composta, mês a mês (3.000 a 20% a.a.: 2.400 em 12 meses; 2.146,63 em 18)', () => {
    expect(depreciatedValue(r(3000), 0.2, 0).cents).toBe(300000);
    expect(depreciatedValue(r(3000), 0.2, 12).cents).toBe(240000);
    expect(depreciatedValue(r(3000), 0.2, 18).cents).toBe(214663);
    expect(depreciatedValue(r(3000), 0, 40).cents).toBe(300000);
  });

  it('saldo devedor depois de k parcelas pagas (o que a venda precisa quitar)', () => {
    const card = goal({ id: 'a', price: r(3000), financing: { kind: 'interest_free', installments: 10 } });
    expect(card.outstandingBalance(3).cents).toBe(210000);
    expect(card.outstandingBalance(10).cents).toBe(0);
    expect(card.outstandingBalance(15).cents).toBe(0);
    // Price: valor presente das 36 parcelas restantes de 624,68 a 1,99% a.m. = 15.947,97 (decimal de alta precisão)
    const loan = goal({
      id: 'b',
      price: r(24000),
      downPayment: r(4800),
      financing: { kind: 'loan', installments: 48, monthlyRate: 0.0199 },
    });
    expect(loan.outstandingBalance(12).cents).toBe(1594797);
    expect(loan.outstandingBalance(48).cents).toBe(0);
    const consortium = goal({
      id: 'c',
      price: r(24000),
      financing: { kind: 'consortium', installments: 72, adminFeeRate: 0.15 },
    });
    expect(consortium.outstandingBalance(70).cents).toBe(2 * 38333);
    expect(goal({ id: 'd', price: r(1000) }).outstandingBalance(0).cents).toBe(0);
  });
});

describe('simulatePlan: vender um bem para ajudar a pagar a meta seguinte', () => {
  // bike 3.000 em 10x de 300 + manutenção 50, no lugar do app (300): gasto 1.550, sobra 450/mês
  const bike = goal({
    id: 'bike',
    price: r(3000),
    financing: { kind: 'interest_free', installments: 10 },
    recurringCosts: [{ name: 'manutenção', monthly: r(50), replacesCategoryId: 'transporte.app' }],
  });
  // moto 10.000: entrada 3.000 + 20x de 350, gasolina 150 no lugar do app
  const moto = (extra: Partial<Parameters<typeof Goal.create>[0]> = {}) =>
    goal({
      id: 'moto',
      price: r(10000),
      downPayment: r(3000),
      financing: { kind: 'interest_free', installments: 20 },
      recurringCosts: [{ name: 'gasolina', monthly: r(150), replacesCategoryId: 'transporte.app' }],
      ...extra,
    });
  const run = (goals: Goal[], count = 24) =>
    simulatePlan({
      goals,
      baseline,
      months: months(count),
      income: flat(2000, count),
      startingSavings: Money.zero(),
      minSlackRatio: 0.1,
    });

  it('sem vender: a moto espera juntar a entrada E acabarem as parcelas da bike (nov/27)', () => {
    expect(run([bike, moto()]).goals.map((g) => g.startMonth?.toString())).toEqual(['2027-01', '2027-11']);
  });

  it('vendendo a bike: o valor desvalorizado, menos o saldo que ela ainda deve, entra na entrada da moto', () => {
    const plan = run([
      bike,
      moto({ tradeIns: [{ source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: 0.2 }] }),
    ]);
    // jun/27 (5 meses): guardado 2.250 + bike 3.000 × 0,8^(5/12) = 2.733,64 − saldo de 5 parcelas (1.500) = 3.483,64 ≥ 3.000
    // (mai/27: 1.800 + 2.784,95 − 1.800 = 2.784,95, ainda não)
    const out = plan.goals[1];
    expect(out?.startMonth?.toString()).toBe('2027-06');
    expect(out?.tradeIns).toEqual([
      { source: { kind: 'goal', goalId: 'bike' }, value: Money.fromCents(273364), payoff: r(1500) },
    ]);
    // vendida, a bike sai do orçamento (parcelas e manutenção): 1.500 − 300 (app) + 150 + 350 = 1.700
    expect(plan.timeline[4]?.spending.cents).toBe(155000);
    expect(plan.timeline[5]?.spending.cents).toBe(170000);
    // 3.483,64 − 3.000 da entrada + sobra de junho (300)
    expect(plan.timeline[5]?.savings.cents).toBe(78364);
  });

  it('quando a venda não cobre o saldo devedor, a diferença sai do guardado', () => {
    // bike perde 90% ao ano; moto com entrada 1.000 (20x de 450): mai/27 → 1.800 + 1.392,48 − 1.800 = 1.392,48 ≥ 1.000
    const plan = run([
      bike,
      moto({
        downPayment: r(1000),
        tradeIns: [{ source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: 0.9 }],
      }),
    ]);
    expect(plan.goals[1]?.startMonth?.toString()).toBe('2027-05');
    expect(plan.goals[1]?.tradeIns).toEqual([
      { source: { kind: 'goal', goalId: 'bike' }, value: Money.fromCents(139248), payoff: r(1800) },
    ]);
  });

  it('vende um bem que a pessoa já tem: desvaloriza a partir de hoje', () => {
    // PC atual vale 2.000 hoje e perde 25% a.a.; PC novo 4.000 à vista; sobra 500/mês
    // jun/27: 2.500 + 2.000 × 0,75^(5/12) = 1.774,08 → 4.274,08 ≥ 4.000 (mai/27: 2.000 + 1.817,12, não)
    const owned = { kind: 'owned' as const, name: 'PC atual', currentValue: r(2000) };
    const plan = run([goal({ id: 'pc', price: r(4000), tradeIns: [{ source: owned, annualDepreciationRate: 0.25 }] })]);
    expect(plan.goals[0]?.startMonth?.toString()).toBe('2027-06');
    expect(plan.goals[0]?.tradeIns).toEqual([{ source: owned, value: Money.fromCents(177408), payoff: Money.zero() }]);
    expect(plan.timeline[5]?.savings.cents).toBe(27408 + 50000);
  });

  it('ignora a venda de uma meta que não começou antes (fila inconsistente)', () => {
    const plan = run([moto({ tradeIns: [{ source: { kind: 'goal', goalId: 'bike' }, annualDepreciationRate: 0.2 }] })]);
    // sem a bike na fila não há o que vender: junta os 3.000 da entrada com a sobra de 500/mês → jul/27
    expect(plan.goals[0]?.tradeIns).toEqual([]);
    expect(plan.goals[0]?.startMonth?.toString()).toBe('2027-07');
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
