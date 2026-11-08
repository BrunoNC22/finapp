import { describe, expect, it } from 'vitest';
import type { IncomeSourceRepository } from '../../src/modules/planning/application/ports/income-ports.js';
import { IncomeSource } from '../../src/modules/planning/domain/income/income-source.js';
import { Money } from '../../src/shared/kernel/money.js';
import { YearMonth } from '../../src/shared/kernel/year-month.js';

/** Contrato que todo IncomeSourceRepository cumpre (fake e MongoDB). */
export function incomeSourceRepositoryContract(name: string, make: () => Promise<IncomeSourceRepository>) {
  describe(`IncomeSourceRepository (${name})`, () => {
    const source = (id: string, startsOn: string, extra: Partial<Parameters<typeof IncomeSource.create>[0]> = {}) =>
      IncomeSource.create({
        id,
        name: `Fonte ${id}`,
        kind: 'scholarship',
        expectedMonthly: Money.fromCents(123456),
        startsOn: YearMonth.parse(startsOn),
        risk: 'low',
        status: 'active',
        ...extra,
      });

    it('round-trips every field, including optional end and matcher', async () => {
      const repo = await make();
      const full = source('a', '2026-01', {
        endsOn: YearMonth.parse('2027-06'),
        matcher: { counterpartyContains: 'exemplo', accountId: 'conta' },
      });
      await repo.save(full);
      const back = await repo.findById('a');
      expect(back?.props.expectedMonthly.cents).toBe(123456);
      expect(back?.props.endsOn?.toString()).toBe('2027-06');
      expect(back?.props.matcher).toEqual({ counterpartyContains: 'exemplo', accountId: 'conta' });
      expect(back?.props.startsOn.toString()).toBe('2026-01');
    });

    it('replaces on save (removing fields that were cleared), lists by start and deletes', async () => {
      const repo = await make();
      await repo.save(source('late', '2026-11', { endsOn: YearMonth.parse('2027-01') }));
      await repo.save(source('early', '2025-07'));
      await repo.save(source('late', '2026-11'));
      expect((await repo.findAll()).map((s) => s.id)).toEqual(['early', 'late']);
      expect((await repo.findById('late'))?.props.endsOn).toBeUndefined();
      expect(await repo.delete('late')).toBe(true);
      expect(await repo.delete('late')).toBe(false);
      expect(await repo.findById('late')).toBeUndefined();
    });
  });
}
