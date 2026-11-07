import type { Owner, Passkey } from '../../domain/owner.js';
import type { Session } from '../../domain/session.js';

export abstract class OwnerRepository {
  abstract get(): Promise<Owner | undefined>;
  abstract save(owner: Owner): Promise<void>;
}

export abstract class SessionRepository {
  abstract save(session: Session): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | undefined>;
  abstract findById(id: string): Promise<Session | undefined>;
  /** Não revogadas (a expiração por tempo é decidida pelo domínio). */
  abstract findNotRevoked(): Promise<Session[]>;
}

/** Códigos de uso único gerados no terminal do servidor (primeiro acesso / "esqueci a senha"). */
export abstract class SetupTokenStore {
  abstract put(tokenHash: string, expiresAt: Date): Promise<void>;
  /** Consome o código: true só na primeira vez e dentro da validade. */
  abstract consume(tokenHash: string, now: Date): Promise<boolean>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, hash: string): Promise<boolean>;
}

/** Segredos aleatórios (tokens) e seu hash para guardar no banco. */
export abstract class SecretTokens {
  abstract generate(): { token: string; hash: string };
  abstract hashOf(token: string): string;
}

/** Desafios WebAuthn em andamento (curta duração). */
export abstract class ChallengeStore {
  abstract put(kind: 'registration' | 'authentication', challenge: string): Promise<void>;
  abstract take(kind: 'registration' | 'authentication'): Promise<string | undefined>;
}

/** Porta para o protocolo WebAuthn (a biblioteca fica na infraestrutura). */
export abstract class PasskeyService {
  abstract registrationOptions(owner: Owner): Promise<{ options: unknown; challenge: string }>;
  abstract verifyRegistration(response: unknown, expectedChallenge: string, label: string): Promise<Passkey>;
  abstract authenticationOptions(owner: Owner): Promise<{ options: unknown; challenge: string }>;
  /** Devolve a credencial usada e o novo contador, ou lança se a assinatura não confere. */
  abstract verifyAuthentication(
    owner: Owner,
    response: unknown,
    expectedChallenge: string,
  ): Promise<{ credentialId: string; newCounter: number }>;
}
