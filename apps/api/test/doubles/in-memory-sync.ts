import {
  RawPayloadStore,
  SyncLock,
  type SyncRun,
  SyncRunRepository,
} from '../../src/modules/ledger/application/ports/sync-ports.js';

export class InMemorySyncLock extends SyncLock {
  private readonly held = new Set<string>();
  async acquire(key: string): Promise<boolean> {
    if (this.held.has(key)) return false;
    this.held.add(key);
    return true;
  }
  async release(key: string): Promise<void> {
    this.held.delete(key);
  }
  /** Simula outra sincronização em andamento. */
  holdBySomeoneElse(key: string): void {
    this.held.add(key);
  }
}

export class InMemorySyncRunRepository extends SyncRunRepository {
  readonly runs: SyncRun[] = [];
  async save(run: SyncRun): Promise<void> {
    this.runs.push(run);
  }
  async findRecent(limit: number): Promise<SyncRun[]> {
    return [...this.runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit);
  }
}

export class InMemoryRawPayloadStore extends RawPayloadStore {
  readonly payloads = new Map<string, unknown>();
  async putMany(entries: readonly { transactionId: string; raw: unknown }[]): Promise<void> {
    for (const e of entries) this.payloads.set(e.transactionId, e.raw);
  }
  async deleteMany(transactionIds: readonly string[]): Promise<void> {
    for (const id of transactionIds) this.payloads.delete(id);
  }
}

import { RecurrenceDismissals } from '../../src/modules/ledger/application/ports/recurrence-dismissals.js';

export class InMemoryRecurrenceDismissals extends RecurrenceDismissals {
  private readonly keys = new Set<string>();
  async dismiss(key: string): Promise<void> {
    this.keys.add(key);
  }
  async all(): Promise<Set<string>> {
    return new Set(this.keys);
  }
}
