import { describe, expect, it } from 'vitest';
import { searchToQueryString } from '../../lib/api/finance-api';
import { filtersFromParams, filtersToParams, toSearch } from './filters';

describe('transaction filters', () => {
  it('reads the URL, ignoring invalid values, and defaults to the given month', () => {
    const filters = filtersFromParams(
      new URLSearchParams('periodo=2026-13&conta=a1&tipo=nada&forma=pix&busca=%20ifood%20'),
      '2026-11',
    );
    expect(filters).toEqual({ period: '2026-11', accountId: 'a1', paymentMethod: 'pix', q: 'ifood' });
  });

  it('round-trips through the URL', () => {
    const filters = { period: 'all', categoryId: 'none', classification: 'expense' } as const;
    expect(filtersFromParams(filtersToParams(filters), '2026-11')).toEqual(filters);
  });

  it('turns a month into a date range and "none" into uncategorized', () => {
    expect(toSearch({ period: '2026-02', categoryId: 'none' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
      uncategorized: true,
    });
    expect(toSearch({ period: 'all', categoryId: 'alimentacao.delivery' })).toEqual({
      categoryId: 'alimentacao.delivery',
    });
  });

  it('only searches text from 2 letters on', () => {
    expect(toSearch({ period: 'all', q: 'a' })).toEqual({});
    expect(toSearch({ period: 'all', q: 'ab' })).toEqual({ q: 'ab' });
  });

  it('builds the API query string without empty values', () => {
    expect(searchToQueryString({ from: '2026-10-01', uncategorized: true, cursor: 'x y' })).toBe(
      '?from=2026-10-01&uncategorized=true&cursor=x+y',
    );
    expect(searchToQueryString({})).toBe('');
  });
});
