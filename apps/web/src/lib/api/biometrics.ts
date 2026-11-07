import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

/** Porta para a "digital" (WebAuthn/passkey). O teste usa um dublê manual. */
export interface Biometrics {
  isSupported(): boolean;
  authenticate(options: unknown): Promise<Record<string, unknown>>;
  register(options: unknown): Promise<Record<string, unknown>>;
}

type AuthOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];
type RegOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];

export const browserBiometrics: Biometrics = {
  isSupported: () => browserSupportsWebAuthn(),
  authenticate: async (options) =>
    (await startAuthentication({ optionsJSON: options as AuthOptions })) as unknown as Record<string, unknown>,
  register: async (options) =>
    (await startRegistration({ optionsJSON: options as RegOptions })) as unknown as Record<string, unknown>,
};
