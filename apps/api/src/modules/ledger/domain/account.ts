import { Document } from '../../../shared/kernel/document.js';
import { DomainError } from '../../../shared/kernel/domain-error.js';
import { Money } from '../../../shared/kernel/money.js';

export class InvalidAccountError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export type AccountKind = 'checking' | 'savings' | 'credit_card' | 'payment_account';
export type HolderType = 'individual' | 'business';

const KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  payment_account: 'Conta de pagamento',
};

export interface AccountProps {
  readonly id: string;
  /** Id da conta no provedor de Open Finance. */
  readonly externalId: string;
  /** Nome da instituição como o provedor informa (nunca fixo no código). */
  readonly institutionName: string;
  readonly kind: AccountKind;
  readonly holderDocument: Document;
  readonly displayName?: string;
  readonly currentBalance?: Money;
  readonly creditLimit?: Money;
  readonly lastSyncedAt?: Date;
}

/** Conta ou cartão do usuário em uma instituição. */
export class Account {
  private constructor(
    readonly id: string,
    readonly externalId: string,
    readonly institutionName: string,
    readonly kind: AccountKind,
    readonly holderDocument: Document,
    private _displayName: string,
    private _currentBalance: Money,
    private _creditLimit: Money | undefined,
    private _lastSyncedAt: Date | undefined,
  ) {}

  static create(props: AccountProps): Account {
    const required = (value: string, field: string) => {
      if (!value.trim()) throw new InvalidAccountError(`${field} é obrigatório`);
      return value.trim();
    };
    const institutionName = required(props.institutionName, 'nome da instituição');
    return new Account(
      required(props.id, 'id'),
      required(props.externalId, 'id externo'),
      institutionName,
      props.kind,
      props.holderDocument,
      props.displayName?.trim() || `${institutionName} · ${KIND_LABEL[props.kind]}`,
      props.currentBalance ?? Money.zero(),
      props.creditLimit,
      props.lastSyncedAt,
    );
  }

  get displayName(): string {
    return this._displayName;
  }

  get currentBalance(): Money {
    return this._currentBalance;
  }

  get creditLimit(): Money | undefined {
    return this._creditLimit;
  }

  get lastSyncedAt(): Date | undefined {
    return this._lastSyncedAt;
  }

  /** PF (CPF) ou PJ (CNPJ), pelo documento do titular. */
  get holderType(): HolderType {
    return this.holderDocument.type === 'CNPJ' ? 'business' : 'individual';
  }

  get isCreditCard(): boolean {
    return this.kind === 'credit_card';
  }

  isHeldBy(document: Document): boolean {
    return this.holderDocument.isSameAs(document);
  }

  /** Estado completo para persistência; `Account.create(snapshot)` reconstrói a mesma conta. */
  snapshot(): Required<Omit<AccountProps, 'creditLimit' | 'lastSyncedAt'>> &
    Pick<AccountProps, 'creditLimit' | 'lastSyncedAt'> {
    return {
      id: this.id,
      externalId: this.externalId,
      institutionName: this.institutionName,
      kind: this.kind,
      holderDocument: this.holderDocument,
      displayName: this._displayName,
      currentBalance: this._currentBalance,
      ...(this._creditLimit ? { creditLimit: this._creditLimit } : {}),
      ...(this._lastSyncedAt ? { lastSyncedAt: this._lastSyncedAt } : {}),
    };
  }

  rename(name: string): void {
    if (!name.trim()) throw new InvalidAccountError('o nome da conta não pode ficar em branco');
    this._displayName = name.trim();
  }

  recordBalance(balance: Money, at: Date, creditLimit?: Money): void {
    this._currentBalance = balance;
    if (creditLimit) this._creditLimit = creditLimit;
    this._lastSyncedAt = at;
  }
}
