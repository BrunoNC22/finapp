import { createHash } from 'node:crypto';
import {
  ChallengeStore,
  OwnerRepository,
  PasskeyService,
  PasswordHasher,
  SecretTokens,
  SessionRepository,
  SetupTokenStore,
} from '../../src/modules/identity/application/ports/identity-ports.js';
import { Owner, type Passkey } from '../../src/modules/identity/domain/owner.js';
import { Session } from '../../src/modules/identity/domain/session.js';

export class InMemoryOwnerRepository extends OwnerRepository {
  private row: ReturnType<typeof snapshot> | undefined;
  async get(): Promise<Owner | undefined> {
    return this.row ? Owner.create({ ...this.row, passkeys: [...this.row.passkeys] }) : undefined;
  }
  async save(owner: Owner): Promise<void> {
    this.row = snapshot(owner);
  }
}
const snapshot = (o: Owner) => ({
  id: o.id,
  passwordHash: o.passwordHash,
  passkeys: [...o.passkeys],
  failedAttempts: o.failedAttempts,
  ...(o.lockedUntil ? { lockedUntil: o.lockedUntil } : {}),
});

export class InMemorySessionRepository extends SessionRepository {
  private readonly rows = new Map<string, Parameters<typeof Session.restore>[0]>();
  async save(s: Session): Promise<void> {
    this.rows.set(s.id, {
      id: s.id,
      tokenHash: s.tokenHash,
      method: s.method,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      ...(s.revokedAt ? { revokedAt: s.revokedAt } : {}),
    });
  }
  async findByTokenHash(hash: string): Promise<Session | undefined> {
    const row = [...this.rows.values()].find((r) => r.tokenHash === hash);
    return row ? Session.restore(row) : undefined;
  }
  async findById(id: string): Promise<Session | undefined> {
    const row = this.rows.get(id);
    return row ? Session.restore(row) : undefined;
  }
  async findNotRevoked(): Promise<Session[]> {
    return [...this.rows.values()].filter((r) => !r.revokedAt).map((r) => Session.restore(r));
  }
}

export class InMemorySetupTokenStore extends SetupTokenStore {
  private readonly tokens = new Map<string, Date>();
  async put(hash: string, expiresAt: Date): Promise<void> {
    this.tokens.set(hash, expiresAt);
  }
  async consume(hash: string, now: Date): Promise<boolean> {
    const expiresAt = this.tokens.get(hash);
    this.tokens.delete(hash);
    return expiresAt !== undefined && now < expiresAt;
  }
}

/** Hasher rápido para testes (o real usa scrypt). Nunca usar em produção. */
export class FakePasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    return `fake:${password}`;
  }
  async verify(password: string, hash: string): Promise<boolean> {
    return hash === `fake:${password}`;
  }
}

/** Tokens previsíveis para testes. */
export class SequentialSecretTokens extends SecretTokens {
  private n = 0;
  generate(): { token: string; hash: string } {
    const token = `token-${++this.n}`;
    return { token, hash: this.hashOf(token) };
  }
  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

export class InMemoryChallengeStore extends ChallengeStore {
  private readonly challenges = new Map<string, string>();
  async put(kind: string, challenge: string): Promise<void> {
    this.challenges.set(kind, challenge);
  }
  async take(kind: string): Promise<string | undefined> {
    const value = this.challenges.get(kind);
    this.challenges.delete(kind);
    return value;
  }
}

/**
 * Autenticador falso (stub): aceita respostas { credentialId, signedChallenge } em que o desafio
 * assinado é o esperado. Simula o que a biblioteca WebAuthn verifica, sem criptografia real.
 */
export class FakePasskeyService extends PasskeyService {
  async registrationOptions(): Promise<{ options: unknown; challenge: string }> {
    return { options: { challenge: 'reg-challenge' }, challenge: 'reg-challenge' };
  }
  async verifyRegistration(response: unknown, expectedChallenge: string, label: string): Promise<Passkey> {
    const r = response as { credentialId: string; signedChallenge: string };
    if (r.signedChallenge !== expectedChallenge) throw new Error('assinatura inválida');
    return { credentialId: r.credentialId, publicKey: 'pk', counter: 0, transports: [], label, createdAt: new Date(0) };
  }
  async authenticationOptions(): Promise<{ options: unknown; challenge: string }> {
    return { options: { challenge: 'auth-challenge' }, challenge: 'auth-challenge' };
  }
  async verifyAuthentication(
    owner: Owner,
    response: unknown,
    expectedChallenge: string,
  ): Promise<{ credentialId: string; newCounter: number }> {
    const r = response as { credentialId: string; signedChallenge: string; counter: number };
    const passkey = owner.passkey(r.credentialId);
    if (!passkey || r.signedChallenge !== expectedChallenge || r.counter <= passkey.counter)
      throw new Error('assinatura inválida');
    return { credentialId: r.credentialId, newCounter: r.counter };
  }
}
