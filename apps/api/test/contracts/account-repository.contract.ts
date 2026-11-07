import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountRepository } from '../../src/modules/ledger/application/ports/account-repository.js';
import { Money } from '../../src/shared/kernel/money.js';
import { anAccount } from '../builders/account.builder.js';

/** Comportamento que TODO adapter de AccountRepository deve ter. */
export function accountRepositoryContract(name: string, makeRepository: () => Promise<AccountRepository>) {
  describe(`AccountRepository contract: ${name}`, () => {
    let repository: AccountRepository;
    beforeEach(async () => {
      repository = await makeRepository();
    });

    it('returns what was saved', async () => {
      const account = anAccount().withId('acc-1').withKind('credit_card').withDisplayName('Cartão principal').build();
      account.recordBalance(Money.fromCents(-25000), new Date('2026-05-01T10:00:00Z'), Money.fromCents(300000));
      await repository.save(account);

      const found = await repository.findById('acc-1');
      expect(found?.snapshot()).toEqual(account.snapshot());
      expect(found?.holderDocument.isSameAs(account.holderDocument)).toBe(true);
    });

    it('finds by external id and lists all', async () => {
      await repository.save(anAccount().withId('acc-a').withExternalId('ext-a').build());
      await repository.save(anAccount().withId('acc-b').withExternalId('ext-b').build());

      expect((await repository.findByExternalId('ext-b'))?.id).toBe('acc-b');
      expect((await repository.findAll()).map((a) => a.id).sort()).toEqual(['acc-a', 'acc-b']);
      expect(await repository.findByExternalId('missing')).toBeUndefined();
    });

    it('save is an upsert and returns copies', async () => {
      const account = anAccount().withId('acc-up').build();
      await repository.save(account);
      account.rename('Novo nome');
      await repository.save(account);
      const loaded = await repository.findById('acc-up');
      loaded?.rename('Não salvo');

      expect((await repository.findById('acc-up'))?.displayName).toBe('Novo nome');
    });
  });
}
