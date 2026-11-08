import { describe, expect, it } from 'vitest';
import type { GoalRepository } from '../../src/modules/planning/application/ports/goal-ports.js';
import { Goal } from '../../src/modules/planning/domain/goals/goal.js';
import { Money } from '../../src/shared/kernel/money.js';

/** Contrato que todo GoalRepository cumpre (fake e MongoDB). */
export function goalRepositoryContract(name: string, make: () => Promise<GoalRepository>) {
  describe(`GoalRepository (${name})`, () => {
    const goal = (id: string, extra: Partial<Parameters<typeof Goal.create>[0]> = {}) =>
      Goal.create({
        id,
        name: `Meta ${id}`,
        kind: 'purchase',
        price: Money.fromCents(330000),
        downPayment: Money.zero(),
        oneTimeCosts: Money.fromCents(15000),
        financing: { kind: 'interest_free', installments: 12 },
        recurringCosts: [{ name: 'manutenção', monthly: Money.fromCents(8000), replacesCategoryId: 'transporte.app' }],
        ...extra,
      });

    it('round-trips every field', async () => {
      const repo = await make();
      await repo.save(goal('bike'));
      const back = await repo.findById('bike');
      expect(back?.props.price.cents).toBe(330000);
      expect(back?.props.financing).toEqual({ kind: 'interest_free', installments: 12 });
      expect(back?.props.recurringCosts[0]?.replacesCategoryId).toBe('transporte.app');
      expect(back?.installment().cents).toBe(27500);
    });

    it('keeps the order: new goals go last, updates keep their place, reorder changes it', async () => {
      const repo = await make();
      for (const id of ['a', 'b', 'c']) await repo.save(goal(id));
      await repo.save(goal('a', { name: 'A editada' }));
      expect((await repo.findAll()).map((g) => g.id)).toEqual(['a', 'b', 'c']);
      await repo.reorder(['c', 'a', 'b']);
      expect((await repo.findAll()).map((g) => g.id)).toEqual(['c', 'a', 'b']);
      expect(await repo.delete('a')).toBe(true);
      expect(await repo.delete('a')).toBe(false);
      expect((await repo.findAll()).map((g) => g.id)).toEqual(['c', 'b']);
    });
  });
}
