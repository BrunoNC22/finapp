import { DatabaseHealth } from '../../src/modules/health/application/database-health.js';

/** Stub manual da porta DatabaseHealth: responde de forma fixa, sem banco. */
export class StubDatabaseHealth extends DatabaseHealth {
  private constructor(private readonly answer: () => Promise<boolean>) {
    super();
  }

  static up(): StubDatabaseHealth {
    return new StubDatabaseHealth(async () => true);
  }

  static down(): StubDatabaseHealth {
    return new StubDatabaseHealth(async () => false);
  }

  static failing(): StubDatabaseHealth {
    return new StubDatabaseHealth(async () => {
      throw new Error('connection refused');
    });
  }

  static hanging(): StubDatabaseHealth {
    return new StubDatabaseHealth(() => new Promise<boolean>(() => {}));
  }

  ping(): Promise<boolean> {
    return this.answer();
  }
}
