import { describe, expect, it } from 'vitest';
import { SessionStore } from '../session/session-store';
import { ApiClient, ApiError, OutdatedAppError } from './api-client';

/** fetch falso (spy + stub): registra as chamadas e responde o que o teste definir. */
function fakeFetch(respond: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return respond(url, init);
  };
  return { calls, fetchFn };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ApiClient', () => {
  it('sends the in-memory token and validates responses with the contracts', async () => {
    const session = new SessionStore();
    session.signIn('abc', 10);
    const { calls, fetchFn } = fakeFetch(() => json({ ownerExists: true, passkeys: 1 }));

    const status = await new ApiClient(session, '/api', fetchFn).status();

    expect(status).toEqual({ ownerExists: true, passkeys: 1 });
    expect(calls[0]?.url).toBe('/api/auth/status');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer abc');
  });

  it('a 401 with a session ends the session (back to the login screen)', async () => {
    const session = new SessionStore();
    session.signIn('abc', 10);
    const { fetchFn } = fakeFetch(() => json({ message: 'não autorizado' }, 401));

    await expect(new ApiClient(session, '/api', fetchFn).sessions()).rejects.toBeInstanceOf(ApiError);
    expect(session.getState()).toEqual({ status: 'signed-out', reason: 'expired' });
  });

  it('exposes the retry time when the login is locked', async () => {
    const { fetchFn } = fakeFetch(() => json({ message: 'muitas tentativas', retryAfterSeconds: 900 }, 429));
    const error = await new ApiClient(new SessionStore(), '/api', fetchFn).login('x').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 900 });
  });

  it('rejects responses that do not match the contract', async () => {
    const { fetchFn } = fakeFetch(() => json({ ownerExists: 'sim' }));
    await expect(new ApiClient(new SessionStore(), '/api', fetchFn).status()).rejects.toThrow();
  });

  it('a response the app does not understand means the app is outdated (not a generic failure)', async () => {
    const { fetchFn } = fakeFetch(() => json({ ownerExists: 'talvez' }));

    await expect(new ApiClient(new SessionStore(), '/api', fetchFn).status()).rejects.toBeInstanceOf(OutdatedAppError);
  });
});
