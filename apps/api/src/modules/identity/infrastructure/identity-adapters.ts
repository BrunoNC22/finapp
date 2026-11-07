import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { Collection, Db } from 'mongodb';
import {
  ChallengeStore,
  OwnerRepository,
  PasskeyService,
  PasswordHasher,
  SecretTokens,
  SessionRepository,
  SetupTokenStore,
} from '../application/ports/identity-ports.js';
import { Owner, type Passkey } from '../domain/owner.js';
import { type LoginMethod, Session } from '../domain/session.js';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: object,
) => Promise<Buffer>;

/** scrypt (nativo do Node): N=2^15, r=8, p=1, sal de 16 bytes, chave de 64 bytes. Formato autodescritivo. */
export class ScryptPasswordHasher extends PasswordHasher {
  constructor(private readonly params = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }) {
    super();
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, 64, this.params);
    const { N, r, p } = this.params;
    return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, N, r, p, salt, key] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !key) return false;
    const expected = Buffer.from(key, 'base64url');
    const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: this.params.maxmem,
    });
    return timingSafeEqual(actual, expected);
  }
}

/** Tokens de 256 bits; no banco só o SHA-256. */
export class CryptoSecretTokens extends SecretTokens {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashOf(token) };
  }
  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/** Desafios WebAuthn em memória, válidos por 5 minutos (a API roda numa instância só). */
export class MemoryChallengeStore extends ChallengeStore {
  private readonly challenges = new Map<string, { value: string; expiresAt: number }>();
  async put(kind: string, challenge: string): Promise<void> {
    this.challenges.set(kind, { value: challenge, expiresAt: Date.now() + 5 * 60_000 });
  }
  async take(kind: string): Promise<string | undefined> {
    const entry = this.challenges.get(kind);
    this.challenges.delete(kind);
    return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
  }
}

export interface WebAuthnConfig {
  readonly rpId: string;
  readonly rpName: string;
  readonly origin: string;
}

/**
 * WebAuthn via SimpleWebAuthn. `userVerification: 'required'` exige a biometria ou o PIN do
 * dispositivo, que é o que torna a passkey equivalente a "entrar com a digital".
 */
export class SimpleWebAuthnPasskeyService extends PasskeyService {
  constructor(private readonly config: WebAuthnConfig) {
    super();
  }

  async registrationOptions(owner: Owner): Promise<{ options: unknown; challenge: string }> {
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userName: 'dono',
      userDisplayName: 'Dono da instância',
      attestationType: 'none',
      excludeCredentials: owner.passkeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    return { options, challenge: options.challenge };
  }

  async verifyRegistration(response: unknown, expectedChallenge: string, label: string): Promise<Passkey> {
    const result = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpId,
      requireUserVerification: true,
    });
    if (!result.verified || !result.registrationInfo) throw new Error('cadastro da digital não verificado');
    const { credential } = result.registrationInfo;
    return {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
      label,
      createdAt: new Date(),
    };
  }

  async authenticationOptions(owner: Owner): Promise<{ options: unknown; challenge: string }> {
    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      userVerification: 'required',
      allowCredentials: owner.passkeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransport[],
      })),
    });
    return { options, challenge: options.challenge };
  }

  async verifyAuthentication(
    owner: Owner,
    response: unknown,
    expectedChallenge: string,
  ): Promise<{ credentialId: string; newCounter: number }> {
    const body = response as Parameters<typeof verifyAuthenticationResponse>[0]['response'];
    const passkey = owner.passkey(body.id);
    if (!passkey) throw new Error('digital desconhecida');
    const result = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpId,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransport[],
      },
    });
    if (!result.verified) throw new Error('digital não verificada');
    return { credentialId: passkey.credentialId, newCounter: result.authenticationInfo.newCounter };
  }
}

// ---------------------------------------------------------------------------- MongoDB
export const IDENTITY_COLLECTIONS = { owner: 'owner', sessions: 'sessions', setupTokens: 'setup_tokens' } as const;

export async function ensureIdentityIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(IDENTITY_COLLECTIONS.sessions).createIndex({ tokenHash: 1 }, { unique: true }),
    // Sessões antigas somem sozinhas (bem depois do limite absoluto de horas).
    db.collection(IDENTITY_COLLECTIONS.sessions).createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 }),
    db.collection(IDENTITY_COLLECTIONS.setupTokens).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

interface OwnerDocument {
  _id: string;
  passwordHash: string;
  passkeys: (Omit<Passkey, 'transports'> & { transports: string[] })[];
  failedAttempts: number;
  lockedUntil?: Date;
}

export class MongoOwnerRepository extends OwnerRepository {
  private readonly collection: Collection<OwnerDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<OwnerDocument>(IDENTITY_COLLECTIONS.owner);
  }
  async get(): Promise<Owner | undefined> {
    const doc = await this.collection.findOne({});
    return doc
      ? Owner.create({
          id: doc._id,
          passwordHash: doc.passwordHash,
          passkeys: doc.passkeys,
          failedAttempts: doc.failedAttempts,
          ...(doc.lockedUntil ? { lockedUntil: doc.lockedUntil } : {}),
        })
      : undefined;
  }
  async save(owner: Owner): Promise<void> {
    await this.collection.replaceOne(
      { _id: owner.id },
      {
        passwordHash: owner.passwordHash,
        passkeys: owner.passkeys.map((p) => ({ ...p, transports: [...p.transports] })),
        failedAttempts: owner.failedAttempts,
        ...(owner.lockedUntil ? { lockedUntil: owner.lockedUntil } : {}),
      },
      { upsert: true },
    );
  }
}

interface SessionDocument {
  _id: string;
  tokenHash: string;
  method: LoginMethod;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt?: Date;
}

export class MongoSessionRepository extends SessionRepository {
  private readonly collection: Collection<SessionDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<SessionDocument>(IDENTITY_COLLECTIONS.sessions);
  }
  async save(s: Session): Promise<void> {
    await this.collection.replaceOne(
      { _id: s.id },
      {
        tokenHash: s.tokenHash,
        method: s.method,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        ...(s.revokedAt ? { revokedAt: s.revokedAt } : {}),
      },
      { upsert: true },
    );
  }
  async findByTokenHash(tokenHash: string): Promise<Session | undefined> {
    const doc = await this.collection.findOne({ tokenHash });
    return doc ? toSession(doc) : undefined;
  }
  async findById(id: string): Promise<Session | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toSession(doc) : undefined;
  }
  async findNotRevoked(): Promise<Session[]> {
    return (await this.collection.find({ revokedAt: { $exists: false } }).toArray()).map(toSession);
  }
}

const toSession = (d: SessionDocument) =>
  Session.restore({
    id: d._id,
    tokenHash: d.tokenHash,
    method: d.method,
    createdAt: d.createdAt,
    lastSeenAt: d.lastSeenAt,
    ...(d.revokedAt ? { revokedAt: d.revokedAt } : {}),
  });

export class MongoSetupTokenStore extends SetupTokenStore {
  private readonly collection: Collection<{ _id: string; expiresAt: Date }>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<{ _id: string; expiresAt: Date }>(IDENTITY_COLLECTIONS.setupTokens);
  }
  async put(tokenHash: string, expiresAt: Date): Promise<void> {
    await this.collection.insertOne({ _id: tokenHash, expiresAt });
  }
  /** Atômico: o código só pode ser consumido uma vez, mesmo com requisições simultâneas. */
  async consume(tokenHash: string, now: Date): Promise<boolean> {
    const doc = await this.collection.findOneAndDelete({ _id: tokenHash });
    return doc !== null && now < doc.expiresAt;
  }
}
