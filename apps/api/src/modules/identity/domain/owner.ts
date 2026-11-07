import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidPasswordError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class PasskeyAlreadyRegisteredError extends DomainError {
  constructor() {
    super('esta passkey já está cadastrada');
  }
}

export const PasswordPolicy = {
  min: 8,
  max: 128,
  check(password: string): void {
    if (password.length < PasswordPolicy.min)
      throw new InvalidPasswordError(`a senha precisa de pelo menos ${PasswordPolicy.min} caracteres`);
    if (password.length > PasswordPolicy.max)
      throw new InvalidPasswordError(`a senha pode ter no máximo ${PasswordPolicy.max} caracteres`);
  },
};

/** Credencial WebAuthn ("digital"). A chave pública e o contador de assinaturas vêm do autenticador. */
export interface Passkey {
  readonly credentialId: string;
  /** Chave pública (base64url). */
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
  readonly label: string;
  readonly createdAt: Date;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * O dono da instância (o app é de um usuário só). Guarda o hash da senha, as passkeys e o
 * controle de tentativas: 5 senhas erradas seguidas bloqueiam por 15 minutos.
 */
export class Owner {
  private constructor(
    readonly id: string,
    private _passwordHash: string,
    private _passkeys: Passkey[],
    private _failedAttempts: number,
    private _lockedUntil: Date | undefined,
  ) {}

  static create(props: {
    id: string;
    passwordHash: string;
    passkeys?: readonly Passkey[];
    failedAttempts?: number;
    lockedUntil?: Date;
  }): Owner {
    return new Owner(
      props.id,
      props.passwordHash,
      [...(props.passkeys ?? [])],
      props.failedAttempts ?? 0,
      props.lockedUntil,
    );
  }

  get passwordHash(): string {
    return this._passwordHash;
  }
  get passkeys(): readonly Passkey[] {
    return this._passkeys;
  }
  get failedAttempts(): number {
    return this._failedAttempts;
  }
  get lockedUntil(): Date | undefined {
    return this._lockedUntil;
  }

  isLocked(now: Date): boolean {
    return this._lockedUntil !== undefined && now < this._lockedUntil;
  }

  registerFailedAttempt(now: Date): void {
    if (this._lockedUntil && now >= this._lockedUntil) {
      this._lockedUntil = undefined;
      this._failedAttempts = 0;
    }
    this._failedAttempts++;
    if (this._failedAttempts >= MAX_FAILED_ATTEMPTS) {
      this._lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
    }
  }

  registerSuccessfulLogin(): void {
    this._failedAttempts = 0;
    this._lockedUntil = undefined;
  }

  changePasswordHash(hash: string): void {
    this._passwordHash = hash;
    this.registerSuccessfulLogin();
  }

  passkey(credentialId: string): Passkey | undefined {
    return this._passkeys.find((p) => p.credentialId === credentialId);
  }

  addPasskey(passkey: Passkey): void {
    if (this.passkey(passkey.credentialId)) throw new PasskeyAlreadyRegisteredError();
    this._passkeys.push(passkey);
  }

  removePasskey(credentialId: string): void {
    this._passkeys = this._passkeys.filter((p) => p.credentialId !== credentialId);
  }

  /** O contador de assinaturas só cresce; a verificação de clonagem é feita pela biblioteca WebAuthn. */
  updatePasskeyCounter(credentialId: string, counter: number): void {
    this._passkeys = this._passkeys.map((p) => (p.credentialId === credentialId ? { ...p, counter } : p));
  }
}
