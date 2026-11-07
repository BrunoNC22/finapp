import { DomainError } from './domain-error.js';

export class InvalidLocalDateError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

const MS_PER_DAY = 86_400_000;

/**
 * Data de calendário sem hora nem fuso (ex.: dia de uma compra).
 * Imutável. Converter um instante em data exige informar o fuso (`fromInstant`).
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {
    Object.freeze(this);
  }

  static parse(iso: string): LocalDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) throw new InvalidLocalDateError(`data deve estar no formato AAAA-MM-DD, recebido: "${iso}"`);
    return LocalDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  static of(year: number, month: number, day: number): LocalDate {
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      throw new InvalidLocalDateError(`data inexistente: ${year}-${month}-${day}`);
    }
    return new LocalDate(year, month, day);
  }

  /** Data de calendário de um instante (ISO 8601) no fuso informado, ex.: "America/Sao_Paulo". */
  static fromInstant(instant: string | Date, timeZone: string): LocalDate {
    const date = typeof instant === 'string' ? new Date(instant) : instant;
    if (Number.isNaN(date.getTime())) throw new InvalidLocalDateError(`instante inválido: ${String(instant)}`);
    // en-CA formata como AAAA-MM-DD.
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return LocalDate.parse(formatted);
  }

  static compare(a: LocalDate, b: LocalDate): number {
    return a.epochDay - b.epochDay;
  }

  private get epochDay(): number {
    return Date.UTC(this.year, this.month - 1, this.day) / MS_PER_DAY;
  }

  get monthKey(): string {
    return this.toString().slice(0, 7);
  }

  addDays(days: number): LocalDate {
    const date = new Date((this.epochDay + days) * MS_PER_DAY);
    return new LocalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  /** Soma meses; se o dia não existir no mês de destino, usa o último dia do mês. */
  addMonths(months: number): LocalDate {
    const index = this.year * 12 + (this.month - 1) + months;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new LocalDate(year, month, Math.min(this.day, lastDay));
  }

  daysBetween(other: LocalDate): number {
    return Math.abs(this.epochDay - other.epochDay);
  }

  isBefore(other: LocalDate): boolean {
    return this.epochDay < other.epochDay;
  }

  isAfter(other: LocalDate): boolean {
    return this.epochDay > other.epochDay;
  }

  equals(other: LocalDate): boolean {
    return this.epochDay === other.epochDay;
  }

  toString(): string {
    const pad = (n: number, size = 2) => String(n).padStart(size, '0');
    return `${pad(this.year, 4)}-${pad(this.month)}-${pad(this.day)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
