import type { ConnectionsHealthDto } from '@finapp/contracts';
import { describe, expect, it } from 'vitest';
import { bannerText, consentText } from './consent';

const conn = (
  institutionName: string,
  alert: ConnectionsHealthDto['connections'][number]['alert'],
  daysLeft?: number,
): ConnectionsHealthDto['connections'][number] => ({
  id: institutionName,
  institutionName,
  status: alert === 'expirada' ? 'expired' : 'active',
  alert,
  ...(daysLeft !== undefined ? { daysLeft } : {}),
});

describe('consent texts', () => {
  it('describes each connection', () => {
    expect(consentText(conn('A', 'ok', 200))).toBe('Autorização válida por mais 200 dias.');
    expect(consentText(conn('A', 'urgente', 1))).toBe('Autorização válida por mais 1 dia.');
    expect(consentText(conn('A', 'expirada', -3))).toMatch(/expirada/);
  });

  it('the banner names the most urgent connection and how many others need attention', () => {
    const health = (connections: ConnectionsHealthDto['connections']): ConnectionsHealthDto => ({
      worst: 'ok',
      connections,
    });
    expect(bannerText(health([conn('A', 'ok', 200)]))).toBeUndefined();
    expect(bannerText(health([conn('A', 'aviso', 25), conn('B', 'urgente', 5)]))).toBe(
      'A autorização de B (e mais 1) expira em 5 dias.',
    );
    expect(bannerText(health([conn('A', 'urgente', 5), conn('B', 'expirada', -1)]))).toBe(
      'A autorização de B (e mais 1) expirou.',
    );
  });
});
