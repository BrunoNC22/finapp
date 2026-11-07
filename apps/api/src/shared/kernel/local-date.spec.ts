import { describe, expect, it } from 'vitest';
import { InvalidLocalDateError, LocalDate } from './local-date.js';

describe('LocalDate', () => {
  it('parses an ISO calendar date', () => {
    const date = LocalDate.parse('2026-03-09');
    expect([date.year, date.month, date.day]).toEqual([2026, 3, 9]);
    expect(date.toString()).toBe('2026-03-09');
  });

  it('rejects malformed and impossible dates', () => {
    for (const bad of ['2026-3-9', '09/03/2026', '2026-02-30', '2026-13-01', '', 'abc']) {
      expect(() => LocalDate.parse(bad), bad).toThrow(InvalidLocalDateError);
    }
  });

  it('accepts leap days only in leap years', () => {
    expect(LocalDate.parse('2028-02-29').toString()).toBe('2028-02-29');
    expect(() => LocalDate.parse('2027-02-29')).toThrow(InvalidLocalDateError);
  });

  it('converts an instant to the calendar date of a time zone', () => {
    // 01:30 UTC on Mar 10 is still Mar 9 in São Paulo (UTC-3): a purchase at 22:30 local time.
    expect(LocalDate.fromInstant('2026-03-10T01:30:00.000Z', 'America/Sao_Paulo').toString()).toBe('2026-03-09');
    expect(LocalDate.fromInstant('2026-03-10T03:00:00.000Z', 'America/Sao_Paulo').toString()).toBe('2026-03-10');
  });

  it('compares chronologically', () => {
    const a = LocalDate.parse('2026-01-31');
    const b = LocalDate.parse('2026-02-01');
    expect(a.isBefore(b)).toBe(true);
    expect(b.isAfter(a)).toBe(true);
    expect(a.equals(LocalDate.parse('2026-01-31'))).toBe(true);
    expect([b, a].sort(LocalDate.compare)).toEqual([a, b]);
  });

  it('adds days across month and year boundaries', () => {
    expect(LocalDate.parse('2026-12-30').addDays(3).toString()).toBe('2027-01-02');
    expect(LocalDate.parse('2026-03-01').addDays(-1).toString()).toBe('2026-02-28');
  });

  it('measures the absolute distance in days', () => {
    expect(LocalDate.parse('2026-01-30').daysBetween(LocalDate.parse('2026-02-02'))).toBe(3);
    expect(LocalDate.parse('2026-02-02').daysBetween(LocalDate.parse('2026-01-30'))).toBe(3);
  });

  it('exposes the month it belongs to', () => {
    expect(LocalDate.parse('2026-07-04').monthKey).toBe('2026-07');
  });

  it('adds months clamping to the last day of the target month', () => {
    expect(LocalDate.parse('2026-01-31').addMonths(1).toString()).toBe('2026-02-28');
    expect(LocalDate.parse('2026-11-15').addMonths(3).toString()).toBe('2027-02-15');
  });
});
