import { describe, expect, it } from 'vitest';
import { accountLabel } from './accounts';

describe('accountLabel', () => {
  it('uses the display name from the API', () => {
    expect(accountLabel({ institutionName: 'Banco Exemplo', displayName: 'Banco Exemplo · Platinum' })).toBe(
      'Banco Exemplo · Platinum',
    );
  });

  it('shows repeated parts once and falls back to the institution', () => {
    expect(accountLabel({ institutionName: 'Carteira X', displayName: 'Carteira X · carteira x' })).toBe('Carteira X');
    expect(accountLabel({ institutionName: 'Carteira X', displayName: ' ' })).toBe('Carteira X');
  });
});
