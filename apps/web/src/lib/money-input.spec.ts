import { describe, expect, it } from 'vitest';
import { centsToInput, parsePercent, parseReais } from './money-input';

describe('parseReais', () => {
  it('understands how people type money in Brazil', () => {
    expect(parseReais('1.944,43')).toBe(194443);
    expect(parseReais('3.300')).toBe(330000);
    expect(parseReais('1500')).toBe(150000);
    expect(parseReais('R$ 86,05')).toBe(8605);
    expect(parseReais('12.5')).toBe(1250);
  });

  it('rejects what is not a value', () => {
    expect(parseReais('')).toBeUndefined();
    expect(parseReais('abc')).toBeUndefined();
    expect(parseReais('1,234,5')).toBeUndefined();
  });

  it('round-trips with the edit format and reads percentages', () => {
    expect(parseReais(centsToInput(194443))).toBe(194443);
    expect(parsePercent('1,99')).toBeCloseTo(0.0199);
    expect(parsePercent('15%')).toBeCloseTo(0.15);
    expect(parsePercent('x')).toBeUndefined();
  });
});
