import { type Collection, type Db, Long } from 'mongodb';
import type { LocalDate } from '../../../shared/kernel/local-date.js';
import { Money } from '../../../shared/kernel/money.js';
import { YearMonth } from '../../../shared/kernel/year-month.js';
import type { ListIncomeEntries } from '../../ledger/application/use-cases/list-income-entries.js';
import { IncomeLedger, IncomeSourceRepository } from '../application/ports/income-ports.js';
import type { IncomeRecord } from '../domain/income/income-record.js';
import {
  type IncomeKind,
  type IncomeMatcher,
  type IncomeRisk,
  IncomeSource,
  type IncomeStatus,
} from '../domain/income/income-source.js';

export const PLANNING_COLLECTIONS = { incomeSources: 'income_sources' } as const;

interface IncomeSourceDocument {
  _id: string;
  name: string;
  kind: IncomeKind;
  /** Centavos como Int64 (nunca ponto flutuante). */
  expectedMonthlyCents: Long;
  startsOn: string;
  endsOn?: string;
  risk: IncomeRisk;
  status: IncomeStatus;
  matcher?: IncomeMatcher;
}

export class MongoIncomeSourceRepository extends IncomeSourceRepository {
  private readonly collection: Collection<IncomeSourceDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<IncomeSourceDocument>(PLANNING_COLLECTIONS.incomeSources);
  }

  async findAll(): Promise<IncomeSource[]> {
    return (await this.collection.find().sort({ startsOn: 1, name: 1 }).toArray()).map(toEntity);
  }
  async findById(id: string): Promise<IncomeSource | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toEntity(doc) : undefined;
  }
  async save(source: IncomeSource): Promise<void> {
    const p = source.props;
    await this.collection.replaceOne(
      { _id: p.id },
      {
        name: p.name,
        kind: p.kind,
        expectedMonthlyCents: Long.fromNumber(p.expectedMonthly.cents),
        startsOn: p.startsOn.toString(),
        ...(p.endsOn ? { endsOn: p.endsOn.toString() } : {}),
        risk: p.risk,
        status: p.status,
        ...(p.matcher ? { matcher: { ...p.matcher } } : {}),
      },
      { upsert: true },
    );
  }
  async delete(id: string): Promise<boolean> {
    return (await this.collection.deleteOne({ _id: id })).deletedCount === 1;
  }
}

function toEntity(doc: IncomeSourceDocument): IncomeSource {
  return IncomeSource.create({
    id: doc._id,
    name: doc.name,
    kind: doc.kind,
    expectedMonthly: Money.fromCents(Number(doc.expectedMonthlyCents)),
    startsOn: YearMonth.parse(doc.startsOn),
    ...(doc.endsOn ? { endsOn: YearMonth.parse(doc.endsOn) } : {}),
    risk: doc.risk,
    status: doc.status,
    ...(doc.matcher ? { matcher: doc.matcher } : {}),
  });
}

/** Lê a renda real pela fachada do ledger (camada de aplicação dele). */
export class LedgerIncomeAdapter extends IncomeLedger {
  constructor(private readonly entries: ListIncomeEntries) {
    super();
  }
  async incomeBetween(from: LocalDate, to: LocalDate): Promise<IncomeRecord[]> {
    return this.entries.execute(from, to);
  }
}
