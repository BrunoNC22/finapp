import type { DatabaseHealth } from './database-health.js';

export type ComponentStatus = 'up' | 'down';

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly checks: { readonly database: ComponentStatus };
}

export interface CheckHealthOptions {
  /** Tempo máximo de espera pelo banco antes de considerá-lo fora. */
  readonly timeoutMs: number;
}

/** Caso de uso: informa se a aplicação e suas dependências estão saudáveis. */
export class CheckHealth {
  constructor(
    private readonly database: DatabaseHealth,
    private readonly options: CheckHealthOptions = { timeoutMs: 2000 },
  ) {}

  async execute(): Promise<HealthReport> {
    const database = (await this.withTimeout(this.database.ping())) ? 'up' : 'down';
    return { status: database === 'up' ? 'ok' : 'degraded', checks: { database } };
  }

  private async withTimeout(check: Promise<boolean>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.options.timeoutMs);
    });
    try {
      return await Promise.race([check.catch(() => false), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
