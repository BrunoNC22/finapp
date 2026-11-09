import type { Clock } from '../../../../shared/application/clock.js';
import { type ConsentAlert, consentAlert, worstAlert } from '../../domain/consent.js';
import type { ConnectionSnapshot, SyncRunRepository } from '../ports/sync-ports.js';

export interface ConnectionHealth extends ConnectionSnapshot {
  readonly alert: ConsentAlert;
  readonly daysLeft?: number;
}

export interface ConnectionsHealth {
  /** Quando as conexões foram vistas pela última vez (sincronização). */
  readonly checkedAt?: Date;
  readonly worst: ConsentAlert;
  readonly connections: readonly ConnectionHealth[];
}

/** Situação de cada conexão do Open Finance, a partir da última sincronização que as viu. */
export class GetConnectionsHealth {
  constructor(
    private readonly runs: SyncRunRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ConnectionsHealth> {
    const last = (await this.runs.findRecent(20)).find((r) => r.connections.length > 0);
    if (!last) return { worst: 'ok', connections: [] };
    const now = this.clock.now();
    const connections = last.connections.map((c) => ({ ...c, ...consentAlert(c, now) }));
    return { checkedAt: last.startedAt, worst: worstAlert(connections.map((c) => c.alert)), connections };
  }
}
