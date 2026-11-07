import { describe, expect, it } from 'vitest';
import { StubDatabaseHealth } from '../../../../test/doubles/stub-database-health.js';
import { CheckHealth } from './check-health.js';

describe('CheckHealth', () => {
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
