import { describe, expect, it } from 'vitest';
import { LocalDate } from './local-date.js';
import { InvalidYearMonthError, YearMonth } from './year-month.js';

describe('YearMonth', () => {
  it('parses, validates and prints AAAA-MM', () => {
    expect(YearMonth.parse('2026-11').toString()).toBe('2026-11');
    expect(() => YearMonth.parse('2026-13')).toThrow(InvalidYearMonthError);
    expect(() => YearMonth.parse('nov/26')).toThrow(InvalidYearMonthError);
    expect(YearMonth.of(LocalDate.parse('2026-11-16')).toString()).toBe('2026-11');
  });

  it('does month arithmetic across years', () => {
    const nov = YearMonth.parse('2026-11');
    expect(nov.addMonths(2).toString()).toBe('2027-01');
    expect(nov.addMonths(-11).toString()).toBe('2025-12');
    expect(nov.monthsUntil(YearMonth.parse('2028-05'))).toBe(18);
    expect(nov.sequence(3).map(String)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('compares and gives the first and last day', () => {
    const feb = YearMonth.parse('2028-02');
    expect(feb.isAfter(YearMonth.parse('2027-12'))).toBe(true);
    expect(feb.lastDay().toString()).toBe('2028-02-29');
    expect(feb.firstDay().toString()).toBe('2028-02-01');
  });
});
