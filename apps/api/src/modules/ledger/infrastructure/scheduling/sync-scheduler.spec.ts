import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import { InMemorySyncRunRepository } from '../../../../../test/doubles/in-memory-sync.js';
import type { SyncRun } from '../../application/ports/sync-ports.js';
import { SyncInProgressError } from '../../application/use-cases/sync-accounts.js';
import { SyncScheduler, type Timers } from './sync-scheduler.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-11-07T12:00:00Z');

/** Timers manuais (fake): o teste decide quando o tempo "passa". */
class ManualTimers implements Timers {
  readonly scheduled: { ms: number; fn: () => void }[] = [];
  cancelled = 0;
  setTimeout(fn: () => void, ms: number): unknown {
    this.scheduled.push({ ms, fn });
    return this.scheduled.length;
  }
  clearTimeout(): void {
    this.cancelled++;
  }
  async fireNext(): Promise<void> {
    const next = this.scheduled.shift();
    next?.fn();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Spy do caso de uso de sincronização. */
class SpySync {
  calls = 0;
  constructor(private readonly behavior: () => Promise<unknown> = async () => ({})) {}
  async execute(): Promise<SyncRun> {
    this.calls++;
    return (await this.behavior()) as SyncRun;
  }
}

const run = (startedAt: Date): SyncRun => ({
  connections: [],
  id: String(startedAt.getTime()),
  startedAt,
  finishedAt: startedAt,
  status: 'success',
  accounts: [],
  transferPairs: 0,
  ambiguousTransfers: 0,
  uncategorized: 0,
});

async function setup(lastRunHoursAgo?: number, sync = new SpySync()) {
  const runs = new InMemorySyncRunRepository();
  if (lastRunHoursAgo !== undefined) await runs.save(run(new Date(NOW.getTime() - lastRunHoursAgo * HOUR)));
  const timers = new ManualTimers();
  const scheduler = new SyncScheduler({ sync, runs, clock: new FixedClock(NOW), timers, intervalHours: 6 });
  return { scheduler, timers, sync };
}

describe('SyncScheduler', () => {
  it('syncs right away on start when there was never a sync', async () => {
    const { scheduler, sync } = await setup();
    await scheduler.start();
    expect(sync.calls).toBe(1);
  });

  it('syncs right away when the last sync is older than the interval', async () => {
    const { scheduler, sync } = await setup(7);
    await scheduler.start();
    expect(sync.calls).toBe(1);
  });

  it('waits for the remaining time when the last sync is recent', async () => {
    const { scheduler, sync, timers } = await setup(2);
    await scheduler.start();
    expect(sync.calls).toBe(0);
    expect(timers.scheduled[0]?.ms).toBe(4 * HOUR);
  });

  it('keeps syncing every interval', async () => {
    const { scheduler, sync, timers } = await setup(7);
    await scheduler.start();
    expect(timers.scheduled[0]?.ms).toBe(6 * HOUR);
    await timers.fireNext();
    expect(sync.calls).toBe(2);
    expect(timers.scheduled[0]?.ms).toBe(6 * HOUR);
  });

  it('survives failures and a sync already in progress, and keeps the schedule', async () => {
    const failing = new SpySync(async () => {
      throw new Error('provider down');
    });
    const { scheduler, timers } = await setup(undefined, failing);
    await expect(scheduler.start()).resolves.toBeUndefined();
    expect(timers.scheduled).toHaveLength(1);

    const busy = new SpySync(async () => {
      throw new SyncInProgressError();
    });
    const second = await setup(undefined, busy);
    await expect(second.scheduler.start()).resolves.toBeUndefined();
  });

  it('stop cancels the next run', async () => {
    const { scheduler, timers } = await setup(2);
    await scheduler.start();
    scheduler.stop();
    expect(timers.cancelled).toBe(1);
  });

  it('is disabled with an interval of zero', async () => {
    const runs = new InMemorySyncRunRepository();
    const sync = new SpySync();
    const timers = new ManualTimers();
    await new SyncScheduler({ sync, runs, clock: new FixedClock(NOW), timers, intervalHours: 0 }).start();
    expect(sync.calls).toBe(0);
    expect(timers.scheduled).toHaveLength(0);
  });
});
