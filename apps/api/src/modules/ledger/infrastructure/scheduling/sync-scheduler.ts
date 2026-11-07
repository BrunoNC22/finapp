import type { Clock } from '../../../../shared/application/clock.js';
import type { SyncRun, SyncRunRepository } from '../../application/ports/sync-ports.js';
import { SyncInProgressError } from '../../application/use-cases/sync-accounts.js';

/** Abstração dos timers do Node (injetável para testes sem esperar de verdade). */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const nodeTimers: Timers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    handle.unref(); // o agendamento não impede o processo de encerrar
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export interface SyncSchedulerOptions {
  readonly sync: { execute(): Promise<SyncRun> };
  readonly runs: SyncRunRepository;
  readonly clock: Clock;
  readonly timers: Timers;
  /** 0 desliga a sincronização automática. */
  readonly intervalHours: number;
  readonly log?: (message: string) => void;
}

/**
 * Sincronização periódica dentro da API (sem webhooks, sem endpoint público).
 * No início, sincroniza já se a última execução for mais antiga que o intervalo; senão espera o restante.
 * Falhas são registradas e não interrompem o agendamento.
 */
export class SyncScheduler {
  private handle: unknown;
  private stopped = false;

  constructor(private readonly options: SyncSchedulerOptions) {}

  async start(): Promise<void> {
    if (this.options.intervalHours <= 0) return;
    const [last] = await this.options.runs.findRecent(1);
    const elapsed = last ? this.options.clock.now().getTime() - last.startedAt.getTime() : Number.POSITIVE_INFINITY;
    if (elapsed >= this.intervalMs) {
      await this.runOnce();
      this.scheduleNext(this.intervalMs);
    } else {
      this.scheduleNext(this.intervalMs - elapsed);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.handle !== undefined) this.options.timers.clearTimeout(this.handle);
  }

  private get intervalMs(): number {
    return this.options.intervalHours * 3_600_000;
  }

  private scheduleNext(ms: number): void {
    if (this.stopped) return;
    this.handle = this.options.timers.setTimeout(() => {
      void this.runOnce().then(() => this.scheduleNext(this.intervalMs));
    }, ms);
  }

  private async runOnce(): Promise<void> {
    try {
      const run = await this.options.sync.execute();
      this.options.log?.(`sincronização automática: ${run.status}`);
    } catch (error) {
      if (error instanceof SyncInProgressError) return;
      this.options.log?.(`sincronização automática falhou: ${(error as Error).message}`);
    }
  }
}
