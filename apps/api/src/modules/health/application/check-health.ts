import type { DatabaseHealth } from './database-health.js';

export type ComponentStatus = 'up' | 'down';

/** Nível de alerta do consentimento do Open Finance (só o nível e os dias: o /health é público). */
export interface ConsentLevel {
  readonly alert: 'ok' | 'sem_data' | 'aviso' | 'urgente' | 'erro' | 'expirada';
  readonly daysLeft?: number;
}

/** Porta opcional: quando a aplicação tem Open Finance, informa o consentimento mais próximo de vencer. */
export interface ConsentCheck {
  /** `undefined` quando não há conexões ou o ledger não faz parte desta composição. */
  check(): Promise<ConsentLevel | undefined>;
}

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly checks: {
    readonly database: ComponentStatus;
    readonly openFinance?: { readonly consent: ConsentLevel['alert'] | 'desconhecido'; readonly daysLeft?: number };
  };
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
    private readonly consent?: ConsentCheck,
  ) {}

  async execute(): Promise<HealthReport> {
    const database = (await this.withTimeout(this.database.ping())) ? 'up' : 'down';
    const openFinance = await this.consentReport();
    // Só o banco decide o status (e o 503): um consentimento perto de vencer não derruba o container.
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      checks: { database, ...(openFinance ? { openFinance } : {}) },
    };
  }

  private async consentReport(): Promise<HealthReport['checks']['openFinance']> {
    if (!this.consent) return undefined;
    try {
      const level = await this.consent.check();
      if (!level) return undefined;
      return level.daysLeft === undefined
        ? { consent: level.alert }
        : { consent: level.alert, daysLeft: level.daysLeft };
    } catch {
      return { consent: 'desconhecido' };
    }
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
