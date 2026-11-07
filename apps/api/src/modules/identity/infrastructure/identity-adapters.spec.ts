import { describe, expect, it } from 'vitest';
import { CryptoSecretTokens, ScryptPasswordHasher } from './identity-adapters.js';

describe('ScryptPasswordHasher', () => {
  // Parâmetros baixos só para o teste ser rápido; produção usa N=2^15.
  const hasher = new ScryptPasswordHasher({ N: 2 ** 10, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

  it('verifies the right password and rejects others', async () => {
    const hash = await hasher.hash('senha-forte-1');
    expect(await hasher.verify('senha-forte-1', hash)).toBe(true);
    expect(await hasher.verify('senha-forte-2', hash)).toBe(false);
  });

  it('salts every hash and never stores the password', async () => {
    const [a, b] = [await hasher.hash('igual-igual'), await hasher.hash('igual-igual')];
    expect(a).not.toBe(b);
    expect(a).not.toContain('igual-igual');
    expect(a.startsWith('scrypt$1024$8$1$')).toBe(true);
  });

  it('rejects malformed hashes', async () => {
    expect(await hasher.verify('x', 'bcrypt$abc')).toBe(false);
  });
});

describe('CryptoSecretTokens', () => {
  it('generates long random tokens and stores only their hash', () => {
    const tokens = new CryptoSecretTokens();
    const a = tokens.generate();
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(tokens.hashOf(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(tokens.generate().token).not.toBe(a.token);
  });
});
