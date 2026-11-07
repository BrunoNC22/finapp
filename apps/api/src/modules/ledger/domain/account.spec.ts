import { describe, expect, it } from 'vitest';
import { anAccount } from '../../../../test/builders/account.builder.js';
import { SYNTHETIC_CNPJ, SYNTHETIC_CPF, SYNTHETIC_CPF_DIGITS } from '../../../../test/fixtures/synthetic-documents.js';
import { Document } from '../../../shared/kernel/document.js';
import { Money } from '../../../shared/kernel/money.js';
import { Account, InvalidAccountError } from './account.js';

describe('Account', () => {
  it('is created with a display name defaulting to the institution and kind', () => {
    const account = anAccount().withInstitution('Banco Exemplo').withKind('credit_card').build();
    expect(account.displayName).toBe('Banco Exemplo · Cartão de crédito');
    expect(account.isCreditCard).toBe(true);
  });

  it('builds the initial name from the provider without repeating the institution', () => {
    expect(Account.nameFromProvider('Banco Exemplo', 'Platinum')).toBe('Banco Exemplo · Platinum');
    expect(Account.nameFromProvider('Carteira X', 'Carteira X')).toBe('Carteira X');
    expect(Account.nameFromProvider('Banco Exemplo', 'Banco Exemplo Empresas')).toBe('Banco Exemplo Empresas');
    expect(Account.nameFromProvider('Banco Exemplo', '  ')).toBe('');
  });

  it('can be renamed by the user, but not to a blank name', () => {
    const account = anAccount().build();
    account.rename('  Conta do dia a dia  ');
    expect(account.displayName).toBe('Conta do dia a dia');
    expect(() => account.rename('   ')).toThrow(InvalidAccountError);
  });

  it('knows whether a document belongs to its holder', () => {
    const account = anAccount().withHolderDocument(SYNTHETIC_CPF).build();
    expect(account.isHeldBy(Document.parse(SYNTHETIC_CPF_DIGITS))).toBe(true);
    expect(account.isHeldBy(Document.parse('98765432100'))).toBe(false);
  });

  it('derives the holder type from the document (CPF = individual, CNPJ = business)', () => {
    expect(anAccount().withHolderDocument(SYNTHETIC_CPF).build().holderType).toBe('individual');
    expect(anAccount().withHolderDocument(SYNTHETIC_CNPJ).build().holderType).toBe('business');
  });

  it('records the latest balance and when it was synced', () => {
    const account = anAccount().build();
    const at = new Date('2026-06-01T12:00:00Z');
    account.recordBalance(Money.fromCents(12345), at);
    expect(account.currentBalance.cents).toBe(12345);
    expect(account.lastSyncedAt).toEqual(at);
  });

  it('requires an external id and an institution name', () => {
    expect(() => anAccount().withExternalId('').build()).toThrow(InvalidAccountError);
    expect(() => anAccount().withInstitution(' ').build()).toThrow(InvalidAccountError);
  });
});
