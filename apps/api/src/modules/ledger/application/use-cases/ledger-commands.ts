import type { Clock } from '../../../../shared/application/clock.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { foldText } from '../../domain/categorization/categorization-rule.js';
import { Category, type CategoryKind, InvalidCategoryError } from '../../domain/categorization/category.js';
import { InstallmentGrouper, type InstallmentPurchase } from '../../domain/services/installment-grouper.js';
import type { Classification } from '../../domain/transaction.js';
import type { CategoryRepository } from '../ports/category-repository.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';
import { UnknownCategoryError, UnknownTransactionError } from './categorization.js';

/**
 * Decisão do usuário sobre a classificação de uma transação.
 * Declarar uma transferência interna liga as duas pontas; desfazer libera a outra ponta.
 */
export class ClassifyTransactionManually {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(input: {
    transactionId: string;
    classification: Classification;
    counterpartId?: string;
  }): Promise<void> {
    const transaction = await this.require(input.transactionId);
    const previousLink = transaction.transferLink;
    const changed = [transaction];

    if (input.classification === 'internal_transfer' && input.counterpartId) {
      const counterpart = await this.require(input.counterpartId);
      counterpart.classifyManually('internal_transfer', transaction.id);
      changed.push(counterpart);
    }
    transaction.classifyManually(input.classification, input.counterpartId);

    if (previousLink && previousLink !== transaction.transferLink) {
      const released = await this.transactions.findById(previousLink);
      if (released?.transferLink === transaction.id) {
        released.releaseTransfer();
        changed.push(released);
      }
    }
    await this.transactions.saveMany(changed);
  }

  private async require(id: string) {
    const transaction = await this.transactions.findById(id);
    if (!transaction) throw new UnknownTransactionError(id);
    return transaction;
  }
}

const slug = (name: string) =>
  foldText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'categoria';

/** Cria um grupo ou subcategoria (dois níveis), com id derivado do nome e nunca repetido. */
export class CreateCategory {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: { name: string; kind: CategoryKind; parentId?: string }): Promise<Category> {
    if (input.parentId) {
      const parent = await this.categories.findById(input.parentId);
      if (!parent || parent.archived) throw new UnknownCategoryError(input.parentId);
      if (!parent.isGroup) throw new InvalidCategoryError('subcategorias só podem ficar dentro de um grupo');
    }
    const base = input.parentId ? `${input.parentId}.${slug(input.name)}` : slug(input.name);
    let id = base;
    for (let n = 2; await this.categories.findById(id); n++) id = `${base}-${n}`;
    const category = Category.create({
      id,
      name: input.name,
      kind: input.kind,
      ...(input.parentId ? { parentId: input.parentId } : {}),
    });
    await this.categories.save(category);
    return category;
  }
}

export class UpdateCategory {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(id: string, input: { name?: string; archived?: true }): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) throw new UnknownCategoryError(id);
    if (input.name !== undefined) category.rename(input.name);
    if (input.archived) category.archive();
    await this.categories.save(category);
    return category;
  }
}

/** Compras parceladas dos últimos meses, com as parcelas que ainda vão vencer. */
export class GetInstallmentPurchases {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly clock: Clock,
    private readonly timeZone = 'America/Sao_Paulo',
    /** Parcelamentos de até 24x ainda aparecem. */
    private readonly lookbackMonths = 24,
  ) {}

  async execute(): Promise<InstallmentPurchase[]> {
    const today = LocalDate.fromInstant(this.clock.now(), this.timeZone);
    const transactions = await this.transactions.findInPeriod({
      from: today.addMonths(-this.lookbackMonths),
      to: today,
    });
    return new InstallmentGrouper().group(transactions.filter((t) => t.isInstallment));
  }
}
