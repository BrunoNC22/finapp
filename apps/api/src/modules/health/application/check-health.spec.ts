import { describe, expect, it } from 'vitest';
import { StubDatabaseHealth } from '../../../../test/doubles/stub-database-health.js';
import { CheckHealth } from './check-health.js';

describe('CheckHealth', () => {
  it('adds the Open Finance consent level when available, without degrading the status (only the database does)', async () => {
    const consent = { check: async () => ({ alert: 'urgente' as const, daysLeft: 5 }) };
    const report = await new CheckHealth(StubDatabaseHealth.up(), { timeoutMs: 2000 }, consent).execute();
    expect(report).toEqual({
      status: 'ok',
      checks: { database: 'up', openFinance: { consent: 'urgente', daysLeft: 5 } },
    });

    const unknown = { check: async (): Promise<never> => Promise.reject(new Error('sem banco')) };
    const failing = await new CheckHealth(StubDatabaseHealth.down(), { timeoutMs: 2000 }, unknown).execute();
    expect(failing.checks.openFinance).toEqual({ consent: 'desconhecido' });

    const absent = { check: async () => undefined };
    expect((await new CheckHealth(StubDatabaseHealth.up(), { timeoutMs: 2000 }, absent).execute()).checks).toEqual({
      database: 'up',
    });
  });

  it('reports ok when the database answers', async () => {
    const report = await new CheckHealth(StubDatabaseHealth.up()).execute();
    expect(report).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('reports degraded when the database does not answer', async () => {
    const report = await new CheckHealth(StubDatabaseHealth.down()).execute();
    expect(report).toEqual({ status: 'degraded', checks: { database: 'down' } });
  });

  it('reports degraded when the database check throws', async () => {
    const report = await new CheckHealth(StubDatabaseHealth.failing()).execute();
    expect(report.checks.database).toBe('down');
  });

  it('does not hang when the database never answers', async () => {
    const report = await new CheckHealth(StubDatabaseHealth.hanging(), { timeoutMs: 20 }).execute();
    expect(report).toEqual({ status: 'degraded', checks: { database: 'down' } });
  });
});
