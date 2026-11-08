import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import type { IncomeRecord } from '../../domain/income/income-record.js';
import type { IncomeSource } from '../../domain/income/income-source.js';

export abstract class IncomeSourceRepository {
  abstract findAll(): Promise<IncomeSource[]>;
  abstract findById(id: string): Promise<IncomeSource | undefined>;
  abstract save(source: IncomeSource): Promise<void>;
  abstract delete(id: string): Promise<boolean>;
}

/** O que entrou de verdade no período (vem do ledger). */
export abstract class IncomeLedger {
  abstract incomeBetween(from: LocalDate, to: LocalDate): Promise<IncomeRecord[]>;
}
