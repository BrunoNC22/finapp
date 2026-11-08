import { GoalRepository, HouseholdFinances } from '../../src/modules/planning/application/ports/goal-ports.js';
import { IncomeLedger, IncomeSourceRepository } from '../../src/modules/planning/application/ports/income-ports.js';
import type { Goal } from '../../src/modules/planning/domain/goals/goal.js';
import type { Baseline } from '../../src/modules/planning/domain/goals/plan-simulator.js';
import type { IncomeRecord } from '../../src/modules/planning/domain/income/income-record.js';
import type { IncomeSource } from '../../src/modules/planning/domain/income/income-source.js';
import type { LocalDate } from '../../src/shared/kernel/local-date.js';
import { Money } from '../../src/shared/kernel/money.js';

/** Fake em memória (a entidade é imutável: pode ser guardada como está). */
export class InMemoryIncomeSourceRepository extends IncomeSourceRepository {
  private readonly rows = new Map<string, IncomeSource>();
  async findAll() {
    return [...this.rows.values()].sort(
      (a, b) => a.props.startsOn.toString().localeCompare(b.props.startsOn.toString()) || a.name.localeCompare(b.name),
    );
  }
  async findById(id: string) {
    return this.rows.get(id);
  }
  async save(source: IncomeSource) {
    this.rows.set(source.id, source);
  }
  async delete(id: string) {
    return this.rows.delete(id);
  }
}

/** Stub + spy: devolve as entradas configuradas dentro do período e registra o período pedido. */
export class StubIncomeLedger extends IncomeLedger {
  readonly requested: { from: string; to: string }[] = [];
  constructor(public records: IncomeRecord[] = []) {
    super();
  }
  async incomeBetween(from: LocalDate, to: LocalDate) {
    this.requested.push({ from: from.toString(), to: to.toString() });
    return this.records.filter((r) => !r.occurredOn.isBefore(from) && !r.occurredOn.isAfter(to));
  }
}

export class InMemoryGoalRepository extends GoalRepository {
  private rows: Goal[] = [];
  async findAll() {
    return [...this.rows];
  }
  async findById(id: string) {
    return this.rows.find((g) => g.id === id);
  }
  async save(goal: Goal) {
    const index = this.rows.findIndex((g) => g.id === goal.id);
    if (index >= 0) this.rows[index] = goal;
    else this.rows.push(goal);
  }
  async delete(id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((g) => g.id !== id);
    return this.rows.length < before;
  }
  async reorder(ids: readonly string[]) {
    this.rows = ids.map((id) => this.rows.find((g) => g.id === id)).filter((g): g is Goal => !!g);
  }
}

/** Stub + spy das finanças reais: custo de vida e saldo configuráveis, período pedido registrado. */
export class StubHouseholdFinances extends HouseholdFinances {
  readonly requested: { from: string; to: string; months: number }[] = [];
  constructor(
    public baseline: Baseline = { monthlySpending: Money.zero(), byCategory: new Map() },
    public balance: Money = Money.zero(),
  ) {
    super();
  }
  async costOfLiving(from: LocalDate, to: LocalDate, months: number) {
    this.requested.push({ from: from.toString(), to: to.toString(), months });
    return this.baseline;
  }
  async availableBalance() {
    return this.balance;
  }
}
