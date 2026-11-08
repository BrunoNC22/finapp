import { type Collection, type Db, Long } from 'mongodb';
import type { LocalDate } from '../../../shared/kernel/local-date.js';
import { Money } from '../../../shared/kernel/money.js';
import type { GetAvailableBalance, GetCostOfLiving } from '../../ledger/application/use-cases/cost-of-living.js';
import { GoalRepository, HouseholdFinances } from '../application/ports/goal-ports.js';
import { type Financing, Goal, type GoalKind } from '../domain/goals/goal.js';
import type { Baseline } from '../domain/goals/plan-simulator.js';

export const GOAL_COLLECTION = 'goals';

interface GoalDocument {
  _id: string;
  position: number;
  name: string;
  kind: GoalKind;
  priceCents: Long;
  downPaymentCents: Long;
  oneTimeCostsCents: Long;
  financing: Financing;
  recurringCosts: { name: string; monthlyCents: Long; replacesCategoryId?: string }[];
}

const long = (m: Money) => Long.fromNumber(m.cents);
const money = (l: Long | number) => Money.fromCents(Number(l));

export class MongoGoalRepository extends GoalRepository {
  private readonly collection: Collection<GoalDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<GoalDocument>(GOAL_COLLECTION);
  }

  async findAll(): Promise<Goal[]> {
    return (await this.collection.find().sort({ position: 1, _id: 1 }).toArray()).map(toEntity);
  }
  async findById(id: string): Promise<Goal | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toEntity(doc) : undefined;
  }
  async save(goal: Goal): Promise<void> {
    const existing = await this.collection.findOne({ _id: goal.id }, { projection: { position: 1 } });
    const last = await this.collection.find().sort({ position: -1 }).limit(1).next();
    const p = goal.props;
    await this.collection.replaceOne(
      { _id: goal.id },
      {
        position: existing?.position ?? (last ? last.position + 1 : 0),
        name: p.name,
        kind: p.kind,
        priceCents: long(p.price),
        downPaymentCents: long(p.downPayment),
        oneTimeCostsCents: long(p.oneTimeCosts),
        financing: { ...p.financing },
        recurringCosts: p.recurringCosts.map((c) => ({
          name: c.name,
          monthlyCents: long(c.monthly),
          ...(c.replacesCategoryId ? { replacesCategoryId: c.replacesCategoryId } : {}),
        })),
      },
      { upsert: true },
    );
  }
  async delete(id: string): Promise<boolean> {
    return (await this.collection.deleteOne({ _id: id })).deletedCount === 1;
  }
  async reorder(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.collection.bulkWrite(
      ids.map((id, position) => ({ updateOne: { filter: { _id: id }, update: { $set: { position } } } })),
    );
  }
}

function toEntity(doc: GoalDocument): Goal {
  return Goal.create({
    id: doc._id,
    name: doc.name,
    kind: doc.kind,
    price: money(doc.priceCents),
    downPayment: money(doc.downPaymentCents),
    oneTimeCosts: money(doc.oneTimeCostsCents),
    financing: doc.financing,
    recurringCosts: doc.recurringCosts.map((c) => ({
      name: c.name,
      monthly: money(c.monthlyCents),
      ...(c.replacesCategoryId ? { replacesCategoryId: c.replacesCategoryId } : {}),
    })),
  });
}

/** Custo de vida e saldo reais, pelas fachadas do ledger (camada de aplicação dele). */
export class LedgerHouseholdFinances extends HouseholdFinances {
  constructor(
    private readonly costs: GetCostOfLiving,
    private readonly balance: GetAvailableBalance,
  ) {
    super();
  }
  async costOfLiving(from: LocalDate, to: LocalDate, months: number): Promise<Baseline> {
    const { monthlySpending, byCategory } = await this.costs.execute(from, to, months);
    return { monthlySpending, byCategory };
  }
  availableBalance(): Promise<Money> {
    return this.balance.execute();
  }
}
