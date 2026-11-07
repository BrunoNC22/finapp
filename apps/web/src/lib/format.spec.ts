import { describe, expect, it } from 'vitest';
import { formatCents, formatCentsCompact, formatDate, formatDateTime, formatMonth, formatPercent } from './format';

// Intl usa espaço não separável entre "R$" e o número.
const plain = (s: string) => s.replace(/ /g, ' ');

describe('format', () => {
  it('formats integer cents as BRL', () => {
    expect(plain(formatCents(123456))).toBe('R$ 1.234,56');
    expect(plain(formatCents(-4590))).toBe('-R$ 45,90');
    expect(plain(formatCents(0))).toBe('R$ 0,00');
  });

  it('formats compact amounts for charts', () => {
    expect(plain(formatCentsCompact(120000))).toBe('R$ 1,2 mil');
  });

  it('formats dates and months without time zone surprises', () => {
    expect(formatDate('2026-10-05')).toBe('05/10/2026');
    expect(formatMonth('2026-10')).toBe('out/26');
  });

  it('formats signed percentages', () => {
    expect(formatPercent(40)).toBe('+40%');
    expect(formatPercent(-12)).toBe('-12%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('shows instants in Brasília time', () => {
    expect(formatDateTime('2026-11-07T09:00:00.000Z')).toBe('07/11/2026, 06:00');
  });
});
