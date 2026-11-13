import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/kernel/money.js';
import { Goal, type GoalProps, InvalidGoalError, type TradeIn } from './goal.js';
import { assertTradeInsFit, pruneTradeIns } from './goal-queue.js';

const goal = (id: string, extra: Partial<GoalProps> = {}) =>
  Goal.create({
    id,
    name: id,
    kind: 'purchase',
    price: Money.fromReais(1000),
    downPayment: Money.zero(),
    oneTimeCosts: Money.zero(),
    financing: { kind: 'cash' },
    recurringCosts: [],
    ...extra,
  });
const sells = (...goalIds: string[]): TradeIn[] =>
  goalIds.map((goalId) => ({ source: { kind: 'goal', goalId }, annualDepreciationRate: 0.2 }));
const owned: TradeIn = {
  source: { kind: 'owned', name: 'PC atual', currentValue: Money.fromReais(2000) },
  annualDepreciationRate: 0.25,
};

describe('assertTradeInsFit: só vende o bem de uma meta de compra que vem antes e que ninguém mais vende', () => {
  it('aceita bens de metas anteriores e bens que a pessoa já tem', () => {
    const moto = goal('moto', { tradeIns: [...sells('bike'), owned] });
    expect(() => assertTradeInsFit([goal('bike'), moto], moto)).not.toThrow();
  });

  it.each([
    ['meta inexistente', [goal('bike')], sells('patinete'), /não existe/],
    ['meta que não é compra', [goal('reserva', { kind: 'reserve' })], sells('reserva'), /meta de compra/],
  ])('recusa %s', (_, before, tradeIns, message) => {
    const moto = goal('moto', { tradeIns });
    expect(() => assertTradeInsFit([...before, moto], moto)).toThrow(message);
  });

  it('recusa vender o bem de uma meta que vem depois na fila', () => {
    const moto = goal('moto', { tradeIns: sells('bike') });
    expect(() => assertTradeInsFit([moto, goal('bike')], moto)).toThrow(/precisa vir antes/);
  });

  it('recusa vender um bem que outra meta já vende', () => {
    const carro = goal('carro', { tradeIns: sells('bike') });
    const moto = goal('moto', { tradeIns: sells('bike') });
    expect(() => assertTradeInsFit([goal('bike'), carro, moto], moto)).toThrow(InvalidGoalError);
    expect(() => assertTradeInsFit([goal('bike'), carro, moto], moto)).toThrow(/já é vendido por "carro"/);
  });
});

describe('pruneTradeIns: tira as vendas que a fila deixou de sustentar', () => {
  it('não muda nada numa fila consistente', () => {
    expect(pruneTradeIns([goal('bike'), goal('moto', { tradeIns: [...sells('bike'), owned] })])).toEqual([]);
  });

  it('meta vendida excluída, que passou para depois ou deixou de ser compra: só aquela venda sai', () => {
    const queue = [
      goal('pc', { kind: 'lifestyle' }),
      goal('moto', { tradeIns: [...sells('bike', 'pc', 'patinete'), owned] }),
      goal('bike'),
    ];
    const changed = pruneTradeIns(queue);
    expect(changed.map((g) => g.id)).toEqual(['moto']);
    expect(changed[0]?.tradeIns).toEqual([owned]);
    expect(changed[0]?.props.name).toBe('moto');
  });

  it('se duas metas vendem o mesmo bem, fica com a primeira da fila', () => {
    const changed = pruneTradeIns([
      goal('bike'),
      goal('carro', { tradeIns: sells('bike') }),
      goal('moto', { tradeIns: sells('bike') }),
    ]);
    expect(changed.map((g) => [g.id, g.tradeIns.length])).toEqual([['moto', 0]]);
  });
});
