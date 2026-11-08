import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import { InMemoryMcpTokenStore } from '../../../../../test/doubles/in-memory-identity.js';
import { CryptoSecretTokens } from '../../infrastructure/identity-adapters.js';
import { McpAccess } from './mcp-access.js';

describe('McpAccess (read token for the assistant)', () => {
  const setup = () => {
    const store = new InMemoryMcpTokenStore();
    const clock = new FixedClock(new Date('2026-11-08T15:00:00Z'));
    return { store, clock, access: new McpAccess(store, new CryptoSecretTokens(), clock) };
  };

  it('issues a token that verifies, stores only its hash and records its use', async () => {
    const { store, clock, access } = setup();
    const token = await access.issue('Claude Code no desktop');
    expect(token.length).toBeGreaterThan(40);
    expect(JSON.stringify(store.rows)).not.toContain(token);
    clock.advanceMinutes(5);
    expect(await access.verify(token)).toBe(true);
    expect((await access.list())[0]).toMatchObject({ label: 'Claude Code no desktop', lastUsedAt: clock.now() });
  });

  it('rejects missing, unknown and revoked tokens', async () => {
    const { access } = setup();
    const token = await access.issue('x');
    expect(await access.verify(undefined)).toBe(false);
    expect(await access.verify('nao-existe')).toBe(false);
    expect(await access.revokeAll()).toBe(1);
    expect(await access.verify(token)).toBe(false);
  });
});
