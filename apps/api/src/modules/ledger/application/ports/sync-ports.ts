/** Trava exclusiva com expiração: impede duas sincronizações ao mesmo tempo. */
export abstract class SyncLock {
  /** true se conseguiu a trava. Ela expira sozinha após `ttlMs` (processo que morreu não trava para sempre). */
  abstract acquire(key: string, ttlMs: number): Promise<boolean>;
  abstract release(key: string): Promise<void>;
}

/** Guarda o payload original do provedor ao lado da transação (reprocessamento sem nova coleta). */
export abstract class RawPayloadStore {
  abstract putMany(entries: readonly { transactionId: string; raw: unknown }[]): Promise<void>;
  abstract deleteMany(transactionIds: readonly string[]): Promise<void>;
}

export interface SyncAccountResult {
  readonly accountExternalId: string;
  readonly created: number;
  readonly updated: number;
  readonly removed: number;
  /** Mensagem segura (sem payload). */
  readonly error?: string;
}

export interface SyncRun {
  readonly id: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly status: 'success' | 'partial' | 'failed';
  readonly accounts: readonly SyncAccountResult[];
  readonly transferPairs: number;
  readonly ambiguousTransfers: number;
  readonly uncategorized: number;
}

export abstract class SyncRunRepository {
  abstract save(run: SyncRun): Promise<void>;
  /** Mais recentes primeiro. */
  abstract findRecent(limit: number): Promise<SyncRun[]>;
}
