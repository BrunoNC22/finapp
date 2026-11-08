import { DomainError } from '../../../../shared/kernel/domain-error.js';
import type { Money } from '../../../../shared/kernel/money.js';
import type { YearMonth } from '../../../../shared/kernel/year-month.js';
import type { IncomeRecord } from './income-record.js';

export class InvalidIncomeSourceError extends DomainError {
  // biome-ignore lint/complexity/noUselessConstructor: torna público o construtor protegido de DomainError
  constructor(message: string) {
    super(message);
  }
}

export type IncomeKind = 'scholarship' | 'freelance' | 'employment' | 'other';
/** Chance de a fonte parar ou mudar: define em quais cenários ela entra. */
export type IncomeRisk = 'low' | 'medium' | 'high';
/** `pending`: ainda não começou ou não está confirmada (ex.: bolsa aguardando resultado). */
export type IncomeStatus = 'active' | 'pending' | 'ended';

/** Como reconhecer os créditos desta fonte nas transações (sem acento, sem diferenciar maiúsculas). */
export interface IncomeMatcher {
  readonly counterpartyContains?: string;
  readonly descriptionContains?: string;
  readonly accountId?: string;
}

export interface IncomeSourceProps {
  readonly id: string;
  readonly name: string;
  readonly kind: IncomeKind;
  readonly expectedMonthly: Money;
  readonly startsOn: YearMonth;
  /** Último mês com pagamento (inclusive). Sem fim: indefinida. */
  readonly endsOn?: YearMonth;
  readonly risk: IncomeRisk;
  readonly status: IncomeStatus;
  readonly matcher?: IncomeMatcher;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Fonte de renda: quanto se espera por mês, de quando até quando, com que risco. */
export class IncomeSource {
  private constructor(readonly props: IncomeSourceProps) {
    Object.freeze(this);
  }

  static create(props: IncomeSourceProps): IncomeSource {
    if (!props.id.trim()) throw new InvalidIncomeSourceError('id é obrigatório');
    if (!props.name.trim()) throw new InvalidIncomeSourceError('dê um nome à fonte de renda');
    if (!props.expectedMonthly.isPositive()) throw new InvalidIncomeSourceError('o valor mensal precisa ser positivo');
    if (props.endsOn?.isBefore(props.startsOn))
      throw new InvalidIncomeSourceError('o fim não pode ser antes do início');
    const matcher = props.matcher ? cleanMatcher(props.matcher) : undefined;
    const { matcher: _ignored, ...rest } = props;
    return new IncomeSource({ ...rest, name: props.name.trim(), ...(matcher ? { matcher } : {}) });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get expectedMonthly(): Money {
    return this.props.expectedMonthly;
  }
  get risk(): IncomeRisk {
    return this.props.risk;
  }
  get status(): IncomeStatus {
    return this.props.status;
  }

  withChanges(changes: Partial<Omit<IncomeSourceProps, 'id'>>): IncomeSource {
    return IncomeSource.create({ ...this.props, ...changes });
  }

  /** Paga neste mês? (entre início e fim, e não encerrada) */
  activeIn(month: YearMonth): boolean {
    if (this.props.status === 'ended' || month.isBefore(this.props.startsOn)) return false;
    return !this.props.endsOn || !month.isAfter(this.props.endsOn);
  }

  /** O crédito é desta fonte? Sem matcher, a fonte não é acompanhada nas transações. */
  matches(record: IncomeRecord): boolean {
    const m = this.props.matcher;
    if (!m) return false;
    if (m.accountId && record.accountId !== m.accountId) return false;
    if (m.counterpartyContains && !fold(record.counterpartyName ?? '').includes(fold(m.counterpartyContains)))
      return false;
    if (m.descriptionContains && !fold(record.description).includes(fold(m.descriptionContains))) return false;
    return true;
  }
}

function cleanMatcher(m: IncomeMatcher): IncomeMatcher | undefined {
  const clean = {
    ...(m.counterpartyContains?.trim() ? { counterpartyContains: m.counterpartyContains.trim() } : {}),
    ...(m.descriptionContains?.trim() ? { descriptionContains: m.descriptionContains.trim() } : {}),
    ...(m.accountId?.trim() ? { accountId: m.accountId.trim() } : {}),
  };
  // Só a conta não identifica uma fonte (tudo que entra nela seria "desta fonte").
  return clean.counterpartyContains || clean.descriptionContains ? clean : undefined;
}
