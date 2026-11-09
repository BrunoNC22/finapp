import { describe, expect, it } from 'vitest';
import type { AnalysisLog } from '../../src/modules/routine/application/monthly-analysis-routine.js';

/** Comportamento que todo AnalysisLog precisa ter (memória e Mongo). */
export function analysisLogContract(name: string, make: () => Promise<AnalysisLog>) {
  describe(`AnalysisLog (${name})`, () => {
    it('stores one record per month; the latest one wins', async () => {
      const log = await make();
      expect(await log.find('2026-10')).toBeUndefined();
      await log.save({ month: '2026-10', outcome: 'pulada', via: 'app', at: new Date('2026-11-02T12:00:00Z') });
      await log.save({ month: '2026-10', outcome: 'feita', via: 'skill', at: new Date('2026-11-03T12:00:00Z') });
      await log.save({ month: '2026-09', outcome: 'feita', via: 'app', at: new Date('2026-10-01T12:00:00Z') });
      expect(await log.find('2026-10')).toEqual({
        month: '2026-10',
        outcome: 'feita',
        via: 'skill',
        at: new Date('2026-11-03T12:00:00Z'),
      });
      expect((await log.find('2026-09'))?.outcome).toBe('feita');
    });
  });
}
