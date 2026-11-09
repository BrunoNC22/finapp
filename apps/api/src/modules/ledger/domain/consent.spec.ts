import { describe, expect, it } from 'vitest';
import { consentAlert, worstAlert } from './consent.js';

const NOW = new Date('2026-11-09T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe('Open Finance consent alert', () => {
  it('warns 30 days ahead, becomes urgent at 7 and expired at 0', () => {
    expect(consentAlert({ status: 'active', consentExpiresAt: inDays(31) }, NOW)).toEqual({
      alert: 'ok',
      daysLeft: 31,
    });
    expect(consentAlert({ status: 'active', consentExpiresAt: inDays(30) }, NOW)).toEqual({
      alert: 'aviso',
      daysLeft: 30,
    });
    expect(consentAlert({ status: 'active', consentExpiresAt: inDays(7) }, NOW)).toEqual({
      alert: 'urgente',
      daysLeft: 7,
    });
    expect(consentAlert({ status: 'active', consentExpiresAt: inDays(0.4) }, NOW)).toEqual({
      alert: 'urgente',
      daysLeft: 1,
    });
    expect(consentAlert({ status: 'active', consentExpiresAt: inDays(-2) }, NOW)).toEqual({
      alert: 'expirada',
      daysLeft: -2,
    });
  });

  it('trusts the provider status: expired or broken connections are flagged even with a future date', () => {
    expect(consentAlert({ status: 'expired', consentExpiresAt: inDays(100) }, NOW).alert).toBe('expirada');
    expect(consentAlert({ status: 'error', consentExpiresAt: inDays(100) }, NOW).alert).toBe('erro');
    expect(consentAlert({ status: 'active' }, NOW)).toEqual({ alert: 'sem_data' });
  });

  it('the worst alert drives the banner', () => {
    expect(worstAlert(['ok', 'aviso', 'sem_data'])).toBe('aviso');
    expect(worstAlert(['aviso', 'expirada', 'urgente'])).toBe('expirada');
    expect(worstAlert(['ok', 'erro'])).toBe('erro');
    expect(worstAlert([])).toBe('ok');
  });
});
