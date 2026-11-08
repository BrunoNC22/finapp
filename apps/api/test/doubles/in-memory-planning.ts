import { IncomeLedger, IncomeSourceRepository } from '../../src/modules/planning/application/ports/income-ports.js';
import type { IncomeRecord } from '../../src/modules/planning/domain/income/income-record.js';
import type { IncomeSource } from '../../src/modules/planning/domain/income/income-source.js';
import type { LocalDate } from '../../src/shared/kernel/local-date.js';

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
