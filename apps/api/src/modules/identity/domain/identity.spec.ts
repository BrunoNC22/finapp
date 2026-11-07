import { describe, expect, it } from 'vitest';
import { InvalidPasswordError, Owner, PasswordPolicy } from './owner.js';
import { Session, type SessionPolicy } from './session.js';

const NOW = new Date('2026-11-07T12:00:00Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe('PasswordPolicy', () => {
  it('requires 8 to 128 characters', () => {
    expect(() => PasswordPolicy.check('1234567')).toThrow(InvalidPasswordError);
    expect(() => PasswordPolicy.check('x'.repeat(129))).toThrow(InvalidPasswordError);
    expect(() => PasswordPolicy.check('senha-boa-123')).not.toThrow();
  });
});

describe('Owner (lockout like a bank app)', () => {
  const owner = () => Owner.create({ id: 'owner', passwordHash: 'hash' });

  it('locks for 15 minutes after 5 wrong passwords in a row', () => {
    const o = owner();
    for (let i = 0; i < 4; i++) o.registerFailedAttempt(NOW);
    expect(o.isLocked(NOW)).toBe(false);
    o.registerFailedAttempt(NOW);
    expect(o.isLocked(at(14))).toBe(true);
    expect(o.lockedUntil).toEqual(at(15));
    expect(o.isLocked(at(15))).toBe(false);
  });

  it('a successful login resets the counter', () => {
    const o = owner();
    for (let i = 0; i < 4; i++) o.registerFailedAttempt(NOW);
    o.registerSuccessfulLogin();
    o.registerFailedAttempt(NOW);
    expect(o.failedAttempts).toBe(1);
  });

  it('after a lock expires, attempts count from zero again', () => {
    const o = owner();
    for (let i = 0; i < 5; i++) o.registerFailedAttempt(NOW);
    o.registerFailedAttempt(at(16));
    expect(o.failedAttempts).toBe(1);
    expect(o.isLocked(at(16))).toBe(false);
  });

  it('manages passkeys (no duplicates) and their signature counters', () => {
    const o = owner();
    const passkey = {
      credentialId: 'cred-1',
      publicKey: 'pk',
      counter: 0,
      label: 'Celular',
      createdAt: NOW,
      transports: [],
    };
    o.addPasskey(passkey);
    expect(() => o.addPasskey(passkey)).toThrow();
    o.updatePasskeyCounter('cred-1', 7);
    expect(o.passkey('cred-1')?.counter).toBe(7);
    o.removePasskey('cred-1');
    expect(o.passkeys).toHaveLength(0);
  });

  it('changing the password clears the lock', () => {
    const o = owner();
    for (let i = 0; i < 5; i++) o.registerFailedAttempt(NOW);
    o.changePasswordHash('new-hash');
    expect(o.isLocked(NOW)).toBe(false);
    expect(o.passwordHash).toBe('new-hash');
  });
});

describe('Session (closes after inactivity and has an absolute limit)', () => {
  const policy: SessionPolicy = { idleMinutes: 10, maxHours: 12 };
  const session = () => Session.start({ id: 's1', tokenHash: 'h', method: 'password', now: NOW });

  it('stays active while used, sliding the idle window', () => {
    const s = session();
    expect(s.isActive(at(9), policy)).toBe(true);
    s.touch(at(9));
    expect(s.isActive(at(18), policy)).toBe(true);
  });

  it('expires after 10 minutes without use', () => {
    expect(session().isActive(at(10), policy)).toBe(false);
  });

  it('expires after 12 hours even if always in use', () => {
    const s = session();
    for (let m = 5; m < 12 * 60; m += 5) s.touch(at(m));
    expect(s.isActive(at(12 * 60), policy)).toBe(false);
  });

  it('a revoked session is never active', () => {
    const s = session();
    s.revoke(at(1));
    expect(s.isActive(at(2), policy)).toBe(false);
  });
});
