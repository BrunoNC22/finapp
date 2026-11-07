import { beforeEach, describe, expect, it } from 'vitest';
import type { TransactionRepository } from '../../src/modules/ledger/application/ports/transaction-repository.js';
import { Installment } from '../../src/modules/ledger/domain/installment.js';
import { Document } from '../../src/shared/kernel/document.js';
import { LocalDate } from '../../src/shared/kernel/local-date.js';
import { Money } from '../../src/shared/kernel/money.js';
import { aTransaction } from '../builders/transaction.builder.js';
import { SYNTHETIC_CNPJ, SYNTHETIC_CNPJ_DIGITS } from '../fixtures/synthetic-documents.js';

/**
 * Comportamento que TODO adapter de TransactionRepository deve ter.
 * Roda contra o fake em memória e contra o MongoDB (Testcontainers).
 */
export function transactionRepositoryContract(name: string, makeRepository: () => Promise<TransactionRepository>) {
  describe(`TransactionRepository contract: ${name}`, () => {
    let repository: TransactionRepository;
    beforeEach(async () => {
      repository = await makeRepository();
    });

    it('returns what was saved, including classification, category, link, installment and counterparty', async () => {
      const tx = aTransaction()
        .withId('tx-full')
        .withAccount('acc-card')
        .on('2026-04-10')
        .withAmount(-3334)
        .withPaymentMethod('card_purchase')
        .withStatus('pending')
        .withCounterparty('Loja Fictícia', SYNTHETIC_CNPJ)
        .withProviderCategory('prov-123')
        .withInstallment(
          Installment.of({
            number: 2,
            total: 3,
            installmentAmount: Money.fromCents(3334),
            purchaseDate: LocalDate.parse('2026-03-10'),
          }),
        )
        .build();
      tx.categorize('cat-shopping', 'rule');
      tx.markAsInternalTransfer('tx-other');
      await repository.save(tx);

      const found = await repository.findById('tx-full');
      expect(found).toBeDefined();
      expect(found?.snapshot()).toEqual(tx.snapshot());
      expect(found?.counterparty?.document?.isSameAs(Document.parse(SYNTHETIC_CNPJ_DIGITS))).toBe(true);
      expect(found?.installment?.purchaseDate?.toString()).toBe('2026-03-10');
      expect(found?.amount.cents).toBe(-3334);
    });

    it('returns undefined for unknown ids', async () => {
      expect(await repository.findById('missing')).toBeUndefined();
      expect(await repository.findByExternalId('acc-x', 'missing')).toBeUndefined();
    });

    it('save is an upsert by id', async () => {
      const tx = aTransaction().withId('tx-upsert').build();
      await repository.save(tx);
      tx.categorize('cat-a', 'manual');
      await repository.save(tx);

      expect((await repository.findById('tx-upsert'))?.category).toEqual({ categoryId: 'cat-a', source: 'manual' });
    });

    it('returns copies: changing a loaded entity without saving does not change the store', async () => {
      await repository.save(aTransaction().withId('tx-copy').build());
      const loaded = await repository.findById('tx-copy');
      loaded?.categorize('cat-changed', 'manual');

      expect((await repository.findById('tx-copy'))?.category).toBeUndefined();
    });

    it('deletes by id', async () => {
      await repository.saveMany([aTransaction().withId('tx-del').build(), aTransaction().withId('tx-keep').build()]);
      await repository.deleteMany(['tx-del', 'missing']);
      expect(await repository.findById('tx-del')).toBeUndefined();
      expect(await repository.findById('tx-keep')).toBeDefined();
    });

    it('finds by external id within an account only', async () => {
      await repository.saveMany([
        aTransaction().withId('tx-a').withAccount('acc-a').withExternalId('same').build(),
        aTransaction().withId('tx-b').withAccount('acc-b').withExternalId('same').build(),
      ]);

      expect((await repository.findByExternalId('acc-b', 'same'))?.id).toBe('tx-b');
    });

    it('finds by period (inclusive), optionally filtered by account, oldest first', async () => {
      await repository.saveMany([
        aTransaction().withId('tx-3').withAccount('acc-a').on('2026-02-28').build(),
        aTransaction().withId('tx-1').withAccount('acc-a').on('2026-02-01').build(),
        aTransaction().withId('tx-2').withAccount('acc-b').on('2026-02-10').build(),
        aTransaction().withId('tx-out').withAccount('acc-a').on('2026-03-01').build(),
      ]);
      const from = LocalDate.parse('2026-02-01');
      const to = LocalDate.parse('2026-02-28');

      expect((await repository.findInPeriod({ from, to })).map((t) => t.id)).toEqual(['tx-1', 'tx-2', 'tx-3']);
      expect((await repository.findInPeriod({ from, to, accountIds: ['acc-a'] })).map((t) => t.id)).toEqual([
        'tx-1',
        'tx-3',
      ]);
    });
  });
}
