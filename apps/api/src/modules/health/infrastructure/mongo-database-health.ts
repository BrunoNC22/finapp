import type { Db } from 'mongodb';
import { DatabaseHealth } from '../application/database-health.js';

/** Adapter: verifica o MongoDB com o comando `ping`. */
export class MongoDatabaseHealth extends DatabaseHealth {
  constructor(private readonly db: Db) {
    super();
  }

  async ping(): Promise<boolean> {
    const result = await this.db.command({ ping: 1 });
    return result.ok === 1;
  }
}
