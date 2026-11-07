import { DomainError } from '../../../shared/kernel/domain-error.js';
import type { LocalDate } from '../../../shared/kernel/local-date.js';
import { Money } from '../../../shared/kernel/money.js';

export class InvalidInstallmentError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export interface InstallmentProps {
  readonly number: number;
  readonly total: number;
  /** Valor total da compra, quando o provedor informa. */
  readonly totalAmount?: Money;
  /** Valor desta parcela. Usado para estimar o total quando o provedor não o informa. */
  readonly installmentAmount?: Money;
  readonly purchaseDate?: LocalDate;
}

/**
 * Parcela k de n de uma compra no cartão.
 * O Open Finance não informa o valor total da compra: nesse caso ele é estimado
 * como parcela × n, e `totalAmountIsEstimated` fica verdadeiro.
 */
export class Installment {
  private constructor(
    readonly number: number,
    readonly total: number,
    readonly totalAmount: Money,
    readonly totalAmountIsEstimated: boolean,
    readonly purchaseDate: LocalDate | undefined,
  ) {
    Object.freeze(this);
  }

  static of(props: InstallmentProps): Installment {
    const { number, total } = props;
    if (!Number.isSafeInteger(total) || total < 2) {
      throw new InvalidInstallmentError(`total de parcelas deve ser um inteiro ≥ 2, recebido: ${total}`);
    }
    if (!Number.isSafeInteger(number) || number < 1 || number > total) {
      throw new InvalidInstallmentError(`número da parcela deve estar entre 1 e ${total}, recebido: ${number}`);
    }
    if (props.totalAmount) return new Installment(number, total, props.totalAmount.abs(), false, props.purchaseDate);
    if (props.installmentAmount) {
      const estimated = Money.fromCents(props.installmentAmount.abs().cents * total);
      return new Installment(number, total, estimated, true, props.purchaseDate);
    }
    throw new InvalidInstallmentError('informe o valor total da compra ou o valor da parcela');
  }

  get remaining(): number {
    return this.total - this.number;
  }

  get isLast(): boolean {
    return this.number === this.total;
  }

  get label(): string {
    return `${this.number}/${this.total}`;
  }
}
