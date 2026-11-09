import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import { InMemorySyncRunRepository } from '../../../../../test/doubles/in-memory-sync.js';
import type { ConnectionSnapshot, SyncRun } from '../ports/sync-ports.js';
import { GetConnectionsHealth } from './connections.js';

const NOW = new Date('2026-11-09T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const run = (startedAt: Date, connections: ConnectionSnapshot[]): SyncRun => ({
  id: startedAt.toISOString(),
  startedAt,
  finishedAt: startedAt,
  status: 'success',
  accounts: [],
  transferPairs: 0,
  ambiguousTransfers: 0,
  uncategorized: 0,
  connections,
});

describe('GetConnectionsHealth', () => {
  it('uses the latest sync that saw the connections and flags the one about to expire', async () => {
    const runs = new InMemorySyncRunRepository();
    await runs.save(
      run(new Date('2026-11-01T00:00:00Z'), [
        { id: 'c1', institutionName: 'Banco Antigo', status: 'active', consentExpiresAt: inDays(2) },
      ]),
    );
    await runs.save(
      run(new Date('2026-11-09T06:00:00Z'), [
        { id: 'c1', institutionName: 'Banco Aurora', status: 'active', consentExpiresAt: inDays(200) },
        { id: 'c2', institutionName: 'Carteira Ágil', status: 'active', consentExpiresAt: inDays(20) },
      ]),
    );
    const health = await new GetConnectionsHealth(runs, new FixedClock(NOW)).execute();
    expect(health.checkedAt).toEqual(new Date('2026-11-09T06:00:00Z'));
    expect(health.worst).toBe('aviso');
    expect(health.connections).toEqual([
      {
        id: 'c1',
        institutionName: 'Banco Aurora',
        status: 'active',
        consentExpiresAt: inDays(200),
        alert: 'ok',
        daysLeft: 200,
      },
      {
        id: 'c2',
        institutionName: 'Carteira Ágil',
        status: 'active',
        consentExpiresAt: inDays(20),
        alert: 'aviso',
        daysLeft: 20,
      },
    ]);
  });

  it('skips runs without connection data (older syncs) and is calm when nothing was synced yet', async () => {
    const runs = new InMemorySyncRunRepository();
    expect(await new GetConnectionsHealth(runs, new FixedClock(NOW)).execute()).toEqual({
      worst: 'ok',
      connections: [],
    });
    await runs.save(run(new Date('2026-11-01T00:00:00Z'), [{ id: 'c1', institutionName: 'Banco', status: 'expired' }]));
    await runs.save(run(new Date('2026-11-09T00:00:00Z'), []));
    const health = await new GetConnectionsHealth(runs, new FixedClock(NOW)).execute();
    expect(health.worst).toBe('expirada');
  });
});
