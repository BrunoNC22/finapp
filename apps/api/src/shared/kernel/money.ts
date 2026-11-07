import { DomainError } from './domain-error';

export class InvalidMoneyError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Valor monetário em BRL, armazenado como centavos inteiros.
 * Imutável: toda operação devolve uma nova instância.
 * Negativo representa saída de dinheiro.
 */
export class Money {
  /** Tolerância para o erro de representação binária ao converter reais em centavos. */
  private static readonly DECIMAL_TOLERANCE = 1e-6;

  private constructor(readonly cents: number) {
    Object.freeze(this);
  }

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidMoneyError(`centavos devem ser um inteiro seguro, recebido: ${cents}`);
    }
    // `|| 0` normaliza -0 para 0.
    return new Money(cents || 0);
  }

  /** Converte um valor decimal (como vem de APIs) em centavos. Recusa mais de 2 casas. */
  static fromReais(reais: number): Money {
    const scaled = reais * 100;
    const cents = Math.round(scaled);
    if (!Number.isFinite(scaled) || Math.abs(scaled - cents) > Money.DECIMAL_TOLERANCE) {
      throw new InvalidMoneyError(`valor com mais de 2 casas decimais: ${reais}`);
    }
    return Money.fromCents(cents);
  }

  static zero(): Money {
    return Money.fromCents(0);
  }

  static sum(amounts: readonly Money[]): Money {
    return amounts.reduce((total, amount) => total.add(amount), Money.zero());
  }

  static compare(a: Money, b: Money): number {
    return a.cents - b.cents;
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return Money.fromCents(this.cents - other.cents);
  }

  negate(): Money {
    return Money.fromCents(-this.cents);
  }

  abs(): Money {
    return Money.fromCents(Math.abs(this.cents));
  }

  /**
   * Divide o valor em `parts` partes que somam exatamente o original.
   * Os centavos que sobram vão para as primeiras partes (ex.: 100,00 / 3 → 33,34 + 33,33 + 33,33).
   */
  allocate(parts: number): Money[] {
    if (!Number.isSafeInteger(parts) || parts <= 0) {
      throw new InvalidMoneyError(`número de partes deve ser um inteiro positivo, recebido: ${parts}`);
    }
    const sign = this.cents < 0 ? -1 : 1;
    const absolute = Math.abs(this.cents);
    const base = Math.floor(absolute / parts);
    const remainder = absolute % parts;
    return Array.from({ length: parts }, (_, index) =>
      Money.fromCents(sign * (base + (index < remainder ? 1 : 0))),
    );
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }
}
