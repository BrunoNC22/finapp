import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, Money } from './money.js';

describe('Money', () => {
  describe('fromCents', () => {
    it('creates an amount from an integer number of cents', () => {
      expect(Money.fromCents(1999).cents).toBe(1999);
    });

    it('accepts negative amounts (outflows)', () => {
      expect(Money.fromCents(-4590).cents).toBe(-4590);
    });

    it('rejects fractional cents', () => {
      expect(() => Money.fromCents(10.5)).toThrow(InvalidMoneyError);
    });

    it('rejects values that are not finite numbers', () => {
      expect(() => Money.fromCents(Number.NaN)).toThrow(InvalidMoneyError);
      expect(() => Money.fromCents(Number.POSITIVE_INFINITY)).toThrow(InvalidMoneyError);
    });

    it('rejects values outside the safe integer range', () => {
      expect(() => Money.fromCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(InvalidMoneyError);
    });
  });

  describe('fromReais', () => {
    it('converts a decimal amount with up to two places into cents', () => {
      expect(Money.fromReais(19.99).cents).toBe(1999);
      expect(Money.fromReais(-45.9).cents).toBe(-4590);
    });

    it('is immune to binary floating point representation (0.29 * 100 = 28.999…)', () => {
      expect(Money.fromReais(0.29).cents).toBe(29);
      expect(Money.fromReais(1234.57).cents).toBe(123457);
    });

    it('rejects amounts with more than two decimal places instead of silently rounding', () => {
      expect(() => Money.fromReais(1.234)).toThrow(InvalidMoneyError);
    });
  });

  describe('zero', () => {
    it('is zero', () => {
      expect(Money.zero().isZero()).toBe(true);
    });
  });

  describe('arithmetic', () => {
    it('adds and subtracts without floating point drift', () => {
      const a = Money.fromReais(0.1);
      const b = Money.fromReais(0.2);
      expect(a.add(b).equals(Money.fromReais(0.3))).toBe(true);
      expect(a.subtract(b).cents).toBe(-10);
    });

    it('negates', () => {
      expect(Money.fromCents(500).negate().cents).toBe(-500);
    });

    it('negating zero yields zero, not negative zero', () => {
      expect(Object.is(Money.zero().negate().cents, 0)).toBe(true);
    });

    it('returns the absolute value', () => {
      expect(Money.fromCents(-700).abs().cents).toBe(700);
    });

    it('sums a list of amounts, and the empty list sums to zero', () => {
      const total = Money.sum([Money.fromCents(100), Money.fromCents(250), Money.fromCents(-50)]);
      expect(total.cents).toBe(300);
      expect(Money.sum([]).isZero()).toBe(true);
    });

    it('is immutable: operations return new instances', () => {
      const original = Money.fromCents(100);
      original.add(Money.fromCents(1));
      expect(original.cents).toBe(100);
    });
  });

  describe('allocate', () => {
    it('splits into equal parts when the amount divides evenly', () => {
      expect(
        Money.fromCents(900)
          .allocate(3)
          .map((m) => m.cents),
      ).toEqual([300, 300, 300]);
    });

    it('never loses cents: the remainder goes to the first parts', () => {
      const parts = Money.fromCents(10000).allocate(3);
      expect(parts.map((m) => m.cents)).toEqual([3334, 3333, 3333]);
      expect(Money.sum(parts).cents).toBe(10000);
    });

    it('keeps the sign for negative amounts', () => {
      const parts = Money.fromCents(-10000).allocate(3);
      expect(parts.map((m) => m.cents)).toEqual([-3334, -3333, -3333]);
    });

    it('rejects a number of parts that is not a positive integer', () => {
      expect(() => Money.fromCents(100).allocate(0)).toThrow(InvalidMoneyError);
      expect(() => Money.fromCents(100).allocate(2.5)).toThrow(InvalidMoneyError);
    });
  });

  describe('comparison', () => {
    it('knows its sign', () => {
      expect(Money.fromCents(1).isPositive()).toBe(true);
      expect(Money.fromCents(-1).isNegative()).toBe(true);
      expect(Money.zero().isPositive()).toBe(false);
      expect(Money.zero().isNegative()).toBe(false);
    });

    it('compares by value', () => {
      expect(Money.fromCents(100).equals(Money.fromReais(1))).toBe(true);
      expect(Money.fromCents(100).isGreaterThan(Money.fromCents(99))).toBe(true);
      expect(Money.fromCents(99).isLessThan(Money.fromCents(100))).toBe(true);
    });

    it('provides a comparator for sorting', () => {
      const sorted = [300, -100, 200].map(Money.fromCents).sort(Money.compare);
      expect(sorted.map((m) => m.cents)).toEqual([-100, 200, 300]);
    });
  });
});
