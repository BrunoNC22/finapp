import { describe, expect, it } from 'vitest';
import { addMonths, currentMonth, formatMonthLong, isMonth, monthBounds } from './months';

describe('months', () => {
  it('uses the Brazilian calendar for "now" (UTC midnight is still the previous day there)', () => {
    expect(currentMonth(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10');
    expect(currentMonth(new Date('2026-11-01T12:00:00Z'))).toBe('2026-11');
  });

  it('adds and subtracts months across years', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -15)).toBe('2024-12');
  });

  it('gives the first and last day, including leap years', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('validates and formats', () => {
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth(null)).toBe(false);
    expect(formatMonthLong('2026-03')).toBe('março de 2026');
  });
});
