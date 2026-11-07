import type { Clock } from '../../../../shared/application/clock.js';
import { TooManyAttemptsError, UnauthorizedError } from '../../../../shared/application/errors.js';
import type { IdGenerator } from '../../../../shared/application/id-generator.js';
import { Owner, PasswordPolicy } from '../../domain/owner.js';
import { type LoginMethod, Session, type SessionPolicy } from '../../domain/session.js';
import type {
  ChallengeStore,
  OwnerRepository,
  PasskeyService,
  PasswordHasher,
  SecretTokens,
  SessionRepository,
  SetupTokenStore,
} from '../ports/identity-ports.js';

/** Falha de autenticação. A mensagem é genérica de propósito (não diz o que estava errado). */
export class AuthenticationError extends UnauthorizedError {}

export class AccountLockedError extends TooManyAttemptsError {
  constructor(
    readonly until: Date,
    now: Date,
  ) {
    super(
      'muitas tentativas erradas; tente de novo mais tarde',
      Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)),
    );
  }
}

export interface AuthDependencies {
  readonly owners: OwnerRepository;
  readonly sessions: SessionRepository;
  readonly setupTokens: SetupTokenStore;
  readonly hasher: PasswordHasher;
  readonly tokens: SecretTokens;
  readonly passkeys: PasskeyService;
  readonly challenges: ChallengeStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly policy: SessionPolicy;
}

export interface LoginResult {
  /** Token Bearer. Mostrado uma única vez; o front guarda só em memória. */
  readonly token: string;
  readonly expiresAfterIdleMinutes: number;
}

const SETUP_TOKEN_MINUTES = 15;

/**
 * Autenticação do dono da instância, no modelo de app de banco: senha ou digital (passkey),
 * sessão curta que expira por inatividade, bloqueio após tentativas erradas.
 */
export class AuthService {
  constructor(private readonly deps: AuthDependencies) {}

  async status(): Promise<{ ownerExists: boolean; passkeys: number }> {
    const owner = await this.deps.owners.get();
    return { ownerExists: owner !== undefined, passkeys: owner?.passkeys.length ?? 0 };
  }

  /** Gerado no terminal do servidor. Vale 15 minutos e uma única vez. */
  async issueSetupToken(): Promise<{ token: string; expiresAt: Date }> {
    const { token, hash } = this.deps.tokens.generate();
    const expiresAt = new Date(this.deps.clock.now().getTime() + SETUP_TOKEN_MINUTES * 60_000);
    await this.deps.setupTokens.put(hash, expiresAt);
    return { token, expiresAt };
  }

  /**
   * Primeiro acesso (cria o dono) ou "esqueci a senha" (redefine e encerra todas as sessões).
   * Exige o código de uso único gerado no servidor.
   */
  async setup(setupToken: string, password: string): Promise<LoginResult> {
    PasswordPolicy.check(password);
    const now = this.deps.clock.now();
    if (!(await this.deps.setupTokens.consume(this.deps.tokens.hashOf(setupToken), now)))
      throw new AuthenticationError();
    const hash = await this.deps.hasher.hash(password);
    const existing = await this.deps.owners.get();
    if (existing) {
      existing.changePasswordHash(hash);
      await this.deps.owners.save(existing);
      await this.revokeAll();
    } else {
      await this.deps.owners.save(Owner.create({ id: 'owner', passwordHash: hash }));
    }
    return this.startSession('setup');
  }

  async loginWithPassword(password: string): Promise<LoginResult> {
    const owner = await this.requireOwner();
    const now = this.deps.clock.now();
    if (owner.isLocked(now)) throw new AccountLockedError(owner.lockedUntil as Date, this.deps.clock.now());
    if (!(await this.deps.hasher.verify(password, owner.passwordHash))) {
      owner.registerFailedAttempt(now);
      await this.deps.owners.save(owner);
      if (owner.isLocked(now)) throw new AccountLockedError(owner.lockedUntil as Date, this.deps.clock.now());
      throw new AuthenticationError();
    }
    owner.registerSuccessfulLogin();
    await this.deps.owners.save(owner);
    return this.startSession('password');
  }

  async passkeyLoginOptions(): Promise<unknown> {
    const owner = await this.requireOwner();
    if (owner.passkeys.length === 0) throw new AuthenticationError('nenhuma digital cadastrada');
    const { options, challenge } = await this.deps.passkeys.authenticationOptions(owner);
    await this.deps.challenges.put('authentication', challenge);
    return options;
  }

  async loginWithPasskey(response: unknown): Promise<LoginResult> {
    const owner = await this.requireOwner();
    if (owner.isLocked(this.deps.clock.now()))
      throw new AccountLockedError(owner.lockedUntil as Date, this.deps.clock.now());
    const challenge = await this.deps.challenges.take('authentication');
    if (!challenge) throw new AuthenticationError();
    try {
      const { credentialId, newCounter } = await this.deps.passkeys.verifyAuthentication(owner, response, challenge);
      owner.updatePasskeyCounter(credentialId, newCounter);
    } catch {
      throw new AuthenticationError();
    }
    owner.registerSuccessfulLogin();
    await this.deps.owners.save(owner);
    return this.startSession('passkey');
  }

  /** Cadastro da digital: só com uma sessão ativa (logado com a senha). */
  async passkeyRegistrationOptions(): Promise<unknown> {
    const owner = await this.requireOwner();
    const { options, challenge } = await this.deps.passkeys.registrationOptions(owner);
    await this.deps.challenges.put('registration', challenge);
    return options;
  }

  async registerPasskey(response: unknown, label: string): Promise<{ credentialId: string }> {
    const owner = await this.requireOwner();
    const challenge = await this.deps.challenges.take('registration');
    if (!challenge) throw new AuthenticationError();
    const passkey = await this.deps.passkeys.verifyRegistration(response, challenge, label.trim() || 'Digital');
    owner.addPasskey(passkey);
    await this.deps.owners.save(owner);
    return { credentialId: passkey.credentialId };
  }

  async removePasskey(credentialId: string): Promise<void> {
    const owner = await this.requireOwner();
    owner.removePasskey(credentialId);
    await this.deps.owners.save(owner);
  }

  /** Valida o token de uma requisição e renova a janela de inatividade. */
  async authenticate(token: string | undefined): Promise<Session> {
    if (!token) throw new AuthenticationError();
    const session = await this.deps.sessions.findByTokenHash(this.deps.tokens.hashOf(token));
    const now = this.deps.clock.now();
    if (!session || !session.isActive(now, this.deps.policy)) throw new AuthenticationError();
    session.touch(now);
    await this.deps.sessions.save(session);
    return session;
  }

  async logout(sessionId: string): Promise<void> {
    await this.revoke(sessionId);
  }

  async activeSessions(): Promise<Session[]> {
    const now = this.deps.clock.now();
    return (await this.deps.sessions.findNotRevoked()).filter((s) => s.isActive(now, this.deps.policy));
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.deps.sessions.findById(sessionId);
    if (!session) return;
    session.revoke(this.deps.clock.now());
    await this.deps.sessions.save(session);
  }

  /** Troca a senha e encerra as outras sessões. */
  async changePassword(currentSessionId: string, current: string, next: string): Promise<void> {
    PasswordPolicy.check(next);
    const owner = await this.requireOwner();
    if (!(await this.deps.hasher.verify(current, owner.passwordHash))) throw new AuthenticationError();
    owner.changePasswordHash(await this.deps.hasher.hash(next));
    await this.deps.owners.save(owner);
    await this.revokeAll(currentSessionId);
  }

  private async startSession(method: LoginMethod): Promise<LoginResult> {
    const { token, hash } = this.deps.tokens.generate();
    await this.deps.sessions.save(
      Session.start({ id: this.deps.ids.next(), tokenHash: hash, method, now: this.deps.clock.now() }),
    );
    return { token, expiresAfterIdleMinutes: this.deps.policy.idleMinutes };
  }

  private async revokeAll(exceptId?: string): Promise<void> {
    const now = this.deps.clock.now();
    for (const session of await this.deps.sessions.findNotRevoked()) {
      if (session.id === exceptId) continue;
      session.revoke(now);
      await this.deps.sessions.save(session);
    }
  }

  private async requireOwner(): Promise<Owner> {
    const owner = await this.deps.owners.get();
    if (!owner) throw new AuthenticationError('instância ainda não configurada');
    return owner;
  }
}
