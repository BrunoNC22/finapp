import { describe, expect, it } from 'vitest';
import { SessionStore } from './session-store';

describe('SessionStore (bank-app style)', () => {
  it('keeps the token only in memory', () => {
    const store = new SessionStore();
    store.signIn('secret-token', 10);
    expect(store.currentToken()).toBe('secret-token');
    expect(JSON.stringify(localStorage)).not.toContain('secret-token');
    expect(JSON.stringify(sessionStorage)).not.toContain('secret-token');
    expect(document.cookie).not.toContain('secret-token');
  });

  it('expires after the idle time and notifies the app', () => {
    let now = 0;
    const store = new SessionStore(() => now);
    const states: string[] = [];
    store.subscribe(() => states.push(store.getState().status));
    store.signIn('t', 10);
    now = 9 * 60_000;
    store.touch();
    now = 18 * 60_000;
    expect(store.currentToken()).toBe('t');
    now = 19 * 60_000 + 1;
    store.checkIdle();
    expect(store.currentToken()).toBeUndefined();
    expect(store.getState()).toEqual({ status: 'signed-out', reason: 'expired' });
    expect(states).toEqual(['signed-in', 'signed-out']);
  });

  it('distinguishes logout from expiry', () => {
    const store = new SessionStore();
    store.signIn('t', 10);
    store.signOut();
    expect(store.getState()).toEqual({ status: 'signed-out', reason: 'logout' });
  });
});
