import { describe, expect, it } from 'vitest';
import { AppConfig, InvalidConfigError } from './app-config.js';

const validEnv = {
  MONGO_URL: 'mongodb://user:pass@mongo:27017/?authSource=admin',
};

describe('AppConfig.fromEnv', () => {
  it('applies safe defaults when only the required variables are present', () => {
    const config = AppConfig.fromEnv(validEnv);

    expect(config.nodeEnv).toBe('development');
    expect(config.http).toEqual({ host: '0.0.0.0', port: 3000 });
    expect(config.logLevel).toBe('info');
    expect(config.mongo).toEqual({ url: validEnv.MONGO_URL, dbName: 'finapp' });
    expect(config.openFinance).toEqual({ provider: 'demo' });
  });

  it('coerces the port from string', () => {
    expect(AppConfig.fromEnv({ ...validEnv, PORT: '8080' }).http.port).toBe(8080);
  });

  it('requires a mongodb connection string', () => {
    expect(() => AppConfig.fromEnv({})).toThrow(InvalidConfigError);
    expect(() => AppConfig.fromEnv({ MONGO_URL: 'postgres://x' })).toThrow(InvalidConfigError);
  });

  it('rejects an unknown open finance provider', () => {
    expect(() => AppConfig.fromEnv({ ...validEnv, OPEN_FINANCE_PROVIDER: 'other' })).toThrow(InvalidConfigError);
  });

  it('requires pluggy credentials and item ids only when the provider is pluggy', () => {
    expect(() => AppConfig.fromEnv({ ...validEnv, OPEN_FINANCE_PROVIDER: 'pluggy' })).toThrow(InvalidConfigError);

    const config = AppConfig.fromEnv({
      ...validEnv,
      OPEN_FINANCE_PROVIDER: 'pluggy',
      PLUGGY_CLIENT_ID: 'client-id',
      PLUGGY_CLIENT_SECRET: 'client-secret',
      PLUGGY_ITEM_IDS: ' item-a , item-b ,',
    });

    expect(config.openFinance).toEqual({
      provider: 'pluggy',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      itemIds: ['item-a', 'item-b'],
    });
  });

  it('treats empty variables as absent (as written in .env files)', () => {
    const config = AppConfig.fromEnv({ ...validEnv, PORT: '', PLUGGY_CLIENT_ID: '', OPEN_FINANCE_PROVIDER: '' });
    expect(config.http.port).toBe(3000);
    expect(config.openFinance.provider).toBe('demo');
  });

  it('lists every problem by variable name without ever echoing values', () => {
    const secret = 'super-secret-value-123';
    try {
      AppConfig.fromEnv({
        MONGO_URL: secret,
        PORT: secret,
        OPEN_FINANCE_PROVIDER: 'pluggy',
        PLUGGY_CLIENT_SECRET: secret,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      const message = (error as Error).message;
      expect(message).toContain('MONGO_URL');
      expect(message).toContain('PORT');
      expect(message).toContain('PLUGGY_CLIENT_ID');
      expect(message).not.toContain(secret);
    }
  });

  it('is immutable', () => {
    const config = AppConfig.fromEnv(validEnv);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.http)).toBe(true);
  });
});
