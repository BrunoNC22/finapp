import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../../../test/doubles/fixed-clock.js';
import {
  FakePasskeyService,
  FakePasswordHasher,
  InMemoryChallengeStore,
  InMemoryOwnerRepository,
  InMemorySessionRepository,
  InMemorySetupTokenStore,
  SequentialSecretTokens,
} from '../../../../../test/doubles/in-memory-identity.js';
import { SequentialIdGenerator } from '../../../../../test/doubles/sequential-id-generator.js';
import { InvalidPasswordError } from '../../domain/owner.js';
import { AccountLockedError, AuthenticationError, AuthService } from './auth.js';

const PASSWORD = 'senha-forte-1';

function setup() {
  const clock = new FixedClock(new Date('2026-11-07T12:00:00Z'));
  const auth = new AuthService({
    owners: new InMemoryOwnerRepository(),
    sessions: new InMemorySessionRepository(),
    setupTokens: new InMemorySetupTokenStore(),
    hasher: new FakePasswordHasher(),
    tokens: new SequentialSecretTokens(),
    passkeys: new FakePasskeyService(),
    challenges: new InMemoryChallengeStore(),
    clock,
    ids: new SequentialIdGenerator('session'),
    policy: { idleMinutes: 10, maxHours: 12 },
  });
  return { auth, clock };
}

async function withOwner() {
  const env = setup();
  const { token } = await env.auth.issueSetupToken();
  const login = await env.auth.setup(token, PASSWORD);
  return { ...env, login };
}

describe('AuthService', () => {
  describe('first access', () => {
    it('needs the one-time code generated on the server, then logs in', async () => {
      const { auth } = setup();
      expect(await auth.status()).toEqual({ ownerExists: false, passkeys: 0 });
      const { token } = await auth.issueSetupToken();

      const login = await auth.setup(token, PASSWORD);

      expect(login.expiresAfterIdleMinutes).toBe(10);
      expect(await auth.status()).toEqual({ ownerExists: true, passkeys: 0 });
      await expect(auth.authenticate(login.token)).resolves.toBeDefined();
    });

    it('rejects wrong, reused or expired codes, and weak passwords', async () => {
      const { auth, clock } = setup();
      await expect(auth.setup('wrong', PASSWORD)).rejects.toThrow(AuthenticationError);
      const { token } = await auth.issueSetupToken();
      await expect(auth.setup(token, '123')).rejects.toThrow(InvalidPasswordError);
      await auth.setup(token, PASSWORD).catch(() => undefined);
      await expect(auth.setup(token, PASSWORD)).rejects.toThrow(AuthenticationError); // já usado

      const { token: late } = await auth.issueSetupToken();
      clock.advanceMinutes(16);
      await expect(auth.setup(late, PASSWORD)).rejects.toThrow(AuthenticationError);
    });

    it('"forgot my password": a new code resets the password and ends every session', async () => {
      const { auth, login } = await withOwner();
      const { token } = await auth.issueSetupToken();
      await auth.setup(token, 'outra-senha-forte');

      await expect(auth.authenticate(login.token)).rejects.toThrow(AuthenticationError);
      await expect(auth.loginWithPassword('outra-senha-forte')).resolves.toBeDefined();
    });
  });

  describe('password login', () => {
    it('logs in with the right password and rejects a wrong one with a generic error', async () => {
      const { auth } = await withOwner();
      await expect(auth.loginWithPassword(PASSWORD)).resolves.toHaveProperty('token');
      await expect(auth.loginWithPassword('errada')).rejects.toThrow(new AuthenticationError());
    });

    it('locks after 5 wrong passwords: even the right one fails until the lock ends', async () => {
      const { auth, clock } = await withOwner();
      for (let i = 0; i < 4; i++) await expect(auth.loginWithPassword('errada')).rejects.toThrow(AuthenticationError);
      await expect(auth.loginWithPassword('errada')).rejects.toThrow(AccountLockedError);
      await expect(auth.loginWithPassword(PASSWORD)).rejects.toThrow(AccountLockedError);
      clock.advanceMinutes(15);
      await expect(auth.loginWithPassword(PASSWORD)).resolves.toBeDefined();
    });
  });

  describe('session (like a bank app)', () => {
    it('expires after 10 minutes without use, and each request renews it', async () => {
      const { auth, clock, login } = await withOwner();
      clock.advanceMinutes(9);
      await auth.authenticate(login.token);
      clock.advanceMinutes(9);
      await expect(auth.authenticate(login.token)).resolves.toBeDefined();
      clock.advanceMinutes(10);
      await expect(auth.authenticate(login.token)).rejects.toThrow(AuthenticationError);
    });

    it('rejects missing or unknown tokens, and ends on logout', async () => {
      const { auth, login } = await withOwner();
      await expect(auth.authenticate(undefined)).rejects.toThrow(AuthenticationError);
      await expect(auth.authenticate('nope')).rejects.toThrow(AuthenticationError);
      const session = await auth.authenticate(login.token);
      await auth.logout(session.id);
      await expect(auth.authenticate(login.token)).rejects.toThrow(AuthenticationError);
    });

    it('lists active sessions and revokes a chosen one', async () => {
      const { auth, login } = await withOwner();
      const other = await auth.loginWithPassword(PASSWORD);
      expect(await auth.activeSessions()).toHaveLength(2);
      const otherSession = await auth.authenticate(other.token);
      await auth.revoke(otherSession.id);
      expect(await auth.activeSessions()).toHaveLength(1);
      await expect(auth.authenticate(login.token)).resolves.toBeDefined();
    });

    it('changing the password ends the other sessions but keeps the current one', async () => {
      const { auth, login } = await withOwner();
      const other = await auth.loginWithPassword(PASSWORD);
      const current = await auth.authenticate(login.token);

      await auth.changePassword(current.id, PASSWORD, 'nova-senha-forte');

      await expect(auth.authenticate(other.token)).rejects.toThrow(AuthenticationError);
      await expect(auth.authenticate(login.token)).resolves.toBeDefined();
      await expect(auth.changePassword(current.id, 'errada', 'qualquer-coisa')).rejects.toThrow(AuthenticationError);
    });
  });

  describe('fingerprint (passkey)', () => {
    it('registers a passkey while logged in, then logs in with it instead of the password', async () => {
      const { auth } = await withOwner();
      await expect(auth.passkeyLoginOptions()).rejects.toThrow(AuthenticationError); // nenhuma cadastrada

      await auth.passkeyRegistrationOptions();
      await auth.registerPasskey({ credentialId: 'cel', signedChallenge: 'reg-challenge' }, 'Celular');
      expect(await auth.status()).toEqual({ ownerExists: true, passkeys: 1 });

      await auth.passkeyLoginOptions();
      const login = await auth.loginWithPasskey({ credentialId: 'cel', signedChallenge: 'auth-challenge', counter: 1 });
      await expect(auth.authenticate(login.token)).resolves.toHaveProperty('method', 'passkey');
    });

    it('rejects a replayed or forged response, and each challenge works once', async () => {
      const { auth } = await withOwner();
      await auth.passkeyRegistrationOptions();
      await auth.registerPasskey({ credentialId: 'cel', signedChallenge: 'reg-challenge' }, 'Celular');

      await auth.passkeyLoginOptions();
      await auth.loginWithPasskey({ credentialId: 'cel', signedChallenge: 'auth-challenge', counter: 5 });
      await auth.passkeyLoginOptions();
      await expect(
        auth.loginWithPasskey({ credentialId: 'cel', signedChallenge: 'auth-challenge', counter: 5 }),
      ).rejects.toThrow(AuthenticationError);
      await expect(
        auth.loginWithPasskey({ credentialId: 'cel', signedChallenge: 'auth-challenge', counter: 9 }),
      ).rejects.toThrow(AuthenticationError);
    });
  });
});
