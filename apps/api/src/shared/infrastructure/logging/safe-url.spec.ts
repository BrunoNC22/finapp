import { describe, expect, it } from 'vitest';
import { safeUrl } from './safe-url.js';

describe('safeUrl (request log)', () => {
  it('keeps the path and only the NAMES of query parameters (values may be searches or amounts)', () => {
    expect(safeUrl('/transactions?q=pix%20para%20fulano&period=2026-10&limit=50')).toBe('/transactions?q&period&limit');
    expect(safeUrl('/goals/plan?startingSavingsCents=150000')).toBe('/goals/plan?startingSavingsCents');
    expect(safeUrl('/accounts')).toBe('/accounts');
    expect(safeUrl('/x?')).toBe('/x');
  });
});
