import { DomainError } from './domain-error.js';
import { LocalDate } from './local-date.js';

export class InvalidYearMonthError extends DomainError {
  constructor(value: string) {
    super(`mês inválido (use AAAA-MM): ${value}`);
  }
}

/** Mês de calendário (AAAA-MM). Imutável; aritmética só com ano e mês, sem fuso. */
export class YearMonth {
  private constructor(
    readonly year: number,
    /** 1 a 12. */
    readonly month: number,
  ) {
    Object.freeze(this);
  }

  static parse(value: string): YearMonth {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    const month = Number(match?.[2]);
    if (!match || month < 1 || month > 12) throw new InvalidYearMonthError(value);
    return new YearMonth(Number(match[1]), month);
  }

  static of(date: LocalDate): YearMonth {
    return YearMonth.parse(date.monthKey);
  }

  static compare(a: YearMonth, b: YearMonth): number {
    return a.index - b.index;
  }

  private get index(): number {
    return this.year * 12 + (this.month - 1);
  }

  addMonths(months: number): YearMonth {
    const index = this.index + months;
    return new YearMonth(Math.floor(index / 12), (((index % 12) + 12) % 12) + 1);
  }

  /** Quantos meses de `this` até `other` (negativo se `other` vem antes). */
  monthsUntil(other: YearMonth): number {
    return other.index - this.index;
  }

  isBefore(other: YearMonth): boolean {
    return this.index < other.index;
  }

  isAfter(other: YearMonth): boolean {
    return this.index > other.index;
  }

  equals(other: YearMonth): boolean {
    return this.index === other.index;
  }

  /** Os `count` meses a partir deste (inclusive). */
  sequence(count: number): YearMonth[] {
    return Array.from({ length: count }, (_, i) => this.addMonths(i));
  }

  firstDay(): LocalDate {
    return LocalDate.of(this.year, this.month, 1);
  }

  lastDay(): LocalDate {
    return this.addMonths(1).firstDay().addDays(-1);
  }

  toString(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
