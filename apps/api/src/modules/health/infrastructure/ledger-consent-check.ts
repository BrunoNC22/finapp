import type { ModuleRef } from '@nestjs/core';
import { GetConnectionsHealth } from '../../ledger/application/use-cases/connections.js';
import type { ConsentCheck, ConsentLevel } from '../application/check-health.js';

/**
 * Lê o consentimento pelo caso de uso do ledger, procurado na aplicação montada. O health continua independente:
 * composto sozinho (testes, diagnóstico), simplesmente não informa o Open Finance.
 */
export class LedgerConsentCheck implements ConsentCheck {
  constructor(private readonly modules: ModuleRef) {}

  async check(): Promise<ConsentLevel | undefined> {
    let connections: GetConnectionsHealth;
    try {
      connections = this.modules.get(GetConnectionsHealth, { strict: false });
    } catch {
      return undefined;
    }
    const health = await connections.execute();
    if (health.connections.length === 0) return undefined;
    const days = health.connections.map((c) => c.daysLeft).filter((d): d is number => d !== undefined);
    return days.length ? { alert: health.worst, daysLeft: Math.min(...days) } : { alert: health.worst };
  }
}
