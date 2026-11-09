import { describe, expect, it } from 'vitest';
import { analysisLogContract } from '../../../../test/contracts/analysis-log.contract.js';
import { FixedClock } from '../../../../test/doubles/fixed-clock.js';
import { InMemoryAnalysisLog } from '../../../../test/doubles/in-memory-analysis-log.js';
import { AnalysisMonthNotClosedError, GetAnalysisReminder, RecordMonthlyAnalysis } from './monthly-analysis-routine.js';

analysisLogContract('memória', async () => new InMemoryAnalysisLog());

describe('monthly analysis routine', () => {
  // 1º de dezembro, 01:30 em São Paulo = 04:30 UTC: o mês fechado já é novembro.
  const clock = new FixedClock(new Date('2026-12-01T04:30:00Z'));

  it('reminds about the last closed month (in São Paulo time) until it is recorded', async () => {
    const log = new InMemoryAnalysisLog();
    const reminder = new GetAnalysisReminder(log, clock);
    expect(await reminder.execute()).toEqual({ month: '2026-11', pending: true });

    await new RecordMonthlyAnalysis(log, clock).execute({ outcome: 'feita', via: 'skill' });
    expect(await reminder.execute()).toEqual({
      month: '2026-11',
      pending: false,
      record: { month: '2026-11', outcome: 'feita', via: 'skill', at: new Date('2026-12-01T04:30:00Z') },
    });
  });

  it('still in November in São Paulo (UTC already December): the closed month is October', async () => {
    const lateNight = new FixedClock(new Date('2026-12-01T02:30:00Z'));
    expect((await new GetAnalysisReminder(new InMemoryAnalysisLog(), lateNight).execute()).month).toBe('2026-10');
  });

  it('skipping a month also clears the reminder; an older month can be recorded, the current one cannot', async () => {
    const log = new InMemoryAnalysisLog();
    const record = new RecordMonthlyAnalysis(log, clock);
    await record.execute({ month: '2026-11', outcome: 'pulada', via: 'app' });
    expect((await new GetAnalysisReminder(log, clock).execute()).pending).toBe(false);
    await expect(record.execute({ month: '2026-09', outcome: 'feita', via: 'skill' })).resolves.toMatchObject({
      month: '2026-09',
    });
    await expect(record.execute({ month: '2026-12', outcome: 'feita', via: 'app' })).rejects.toThrow(
      AnalysisMonthNotClosedError,
    );
  });
});
