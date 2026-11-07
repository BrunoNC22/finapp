export interface SessionPolicy {
  /** Sem uso por este tempo, a sessão acaba (como em app de banco). */
  readonly idleMinutes: number;
  /** Limite absoluto, mesmo com uso contínuo. */
  readonly maxHours: number;
}

export type LoginMethod = 'password' | 'passkey' | 'setup';

/** Sessão de login. O token em si nunca é guardado: só o hash dele. */
export class Session {
  private constructor(
    readonly id: string,
    readonly tokenHash: string,
    readonly method: LoginMethod,
    readonly createdAt: Date,
    private _lastSeenAt: Date,
    private _revokedAt: Date | undefined,
  ) {}

  static start(props: { id: string; tokenHash: string; method: LoginMethod; now: Date }): Session {
    return new Session(props.id, props.tokenHash, props.method, props.now, props.now, undefined);
  }

  static restore(props: {
    id: string;
    tokenHash: string;
    method: LoginMethod;
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt?: Date;
  }): Session {
    return new Session(props.id, props.tokenHash, props.method, props.createdAt, props.lastSeenAt, props.revokedAt);
  }

  get lastSeenAt(): Date {
    return this._lastSeenAt;
  }
  get revokedAt(): Date | undefined {
    return this._revokedAt;
  }

  isActive(now: Date, policy: SessionPolicy): boolean {
    if (this._revokedAt) return false;
    if (now.getTime() - this._lastSeenAt.getTime() >= policy.idleMinutes * 60_000) return false;
    return now.getTime() - this.createdAt.getTime() < policy.maxHours * 3_600_000;
  }

  touch(now: Date): void {
    this._lastSeenAt = now;
  }

  revoke(now: Date): void {
    this._revokedAt ??= now;
  }
}
