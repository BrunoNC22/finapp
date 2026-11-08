import { beforeEach, describe, expect, it } from 'vitest';
import { incomeSourceRepositoryContract } from '../../../../../test/contracts/income-source-repository.contract.js';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import { InMemoryIncomeSourceRepository, StubIncomeLedger } from '../../../../../test/doubles/in-memory-planning.js';
import { SequentialIdGenerator } from '../../../../../test/doubles/sequential-id-generator.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { InvalidIncomeSourceError } from '../../domain/income/income-source.js';
import {
  CreateIncomeSource,
  DeleteIncomeSource,
  GetIncomeOverview,
  UnknownIncomeSourceError,
  UpdateIncomeSource,
} from './income.js';

incomeSourceRepositoryContract('em memória', async () => new InMemoryIncomeSourceRepository());

describe('income use cases', () => {
  let sources: InMemoryIncomeSourceRepository;
  const ym = YearMonth.parse;
  const scholarship = {
    name: 'Bolsa A',
    kind: 'scholarship',
    expectedMonthly: Money.fromReais(900),
    startsOn: ym('2026-01'),
    endsOn: ym('2027-04'),
    risk: 'low',
    status: 'active',
    matcher: { counterpartyContains: 'fundacao exemplo' },
  } as const;

  beforeEach(() => {
    sources = new InMemoryIncomeSourceRepository();
  });

  it('creates, changes (clearing the end and the matcher) and deletes a source', async () => {
    const created = await new CreateIncomeSource(sources, new SequentialIdGenerator('src')).execute(scholarship);
    const updated = await new UpdateIncomeSource(sources).execute(created.id, {
      expectedMonthly: Money.fromReais(1000),
      endsOn: null,
      matcher: null,
    });
    expect(updated.props.expectedMonthly.cents).toBe(100000);
    expect(updated.props.endsOn).toBeUndefined();
    expect(updated.props.matcher).toBeUndefined();
    expect(updated.props.startsOn.toString()).toBe('2026-01');

    await new DeleteIncomeSource(sources).execute(created.id);
    expect(await sources.findAll()).toEqual([]);
    await expect(new DeleteIncomeSource(sources).execute(created.id)).rejects.toThrow(UnknownIncomeSourceError);
  });

  it('refuses changes that break the rules', async () => {
    const created = await new CreateIncomeSource(sources, new SequentialIdGenerator('src')).execute(scholarship);
    await expect(new UpdateIncomeSource(sources).execute(created.id, { endsOn: ym('2025-01') })).rejects.toThrow(
      InvalidIncomeSourceError,
    );
    await expect(new UpdateIncomeSource(sources).execute('nope', { name: 'x' })).rejects.toThrow(
      UnknownIncomeSourceError,
    );
  });

  it('overview: projects from the current month and tracks the asked month with 2 previous months of history', async () => {
    await new CreateIncomeSource(sources, new SequentialIdGenerator('src')).execute(scholarship);
    const ledger = new StubIncomeLedger([
      {
        id: 'r1',
        occurredOn: LocalDate.parse('2026-10-05'),
        amount: Money.fromReais(900),
        accountId: 'conta',
        description: 'Pix recebido',
        counterpartyName: 'Fundação Exemplo',
      },
    ]);
    const overview = await new GetIncomeOverview(
      sources,
      ledger,
      new FixedClock(new Date('2026-11-08T15:00:00Z')),
    ).execute({
      month: ym('2026-10'),
      months: 6,
    });

    expect(ledger.requested).toEqual([{ from: '2026-08-01', to: '2026-10-31' }]);
    expect(overview.projection.months.map(String)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
    ]);
    expect(overview.tracking.sources[0]?.status).toBe('paid');
  });
});
