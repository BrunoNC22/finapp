import type { Clock } from '../../../../shared/application/clock.js';
import { NotFoundError } from '../../../../shared/application/errors.js';
import type { IdGenerator } from '../../../../shared/application/id-generator.js';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { type IncomeProjection, projectIncome } from '../../domain/income/income-projection.js';
import { DEFAULT_SCENARIOS } from '../../domain/income/income-scenario.js';
import { IncomeSource, type IncomeSourceProps } from '../../domain/income/income-source.js';
import { type IncomeTracking, trackIncome } from '../../domain/income/income-tracker.js';
import type { IncomeLedger, IncomeSourceRepository } from '../ports/income-ports.js';

export class UnknownIncomeSourceError extends NotFoundError {
  constructor(id: string) {
    super(`fonte de renda inexistente: ${id}`);
  }
}

export class CreateIncomeSource {
  constructor(
    private readonly sources: IncomeSourceRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: Omit<IncomeSourceProps, 'id'>): Promise<IncomeSource> {
    const source = IncomeSource.create({ id: this.ids.next(), ...input });
    await this.sources.save(source);
    return source;
  }
}

/** `endsOn`/`matcher` = null removem o campo. */
export type IncomeSourceChanges = Partial<Omit<IncomeSourceProps, 'id' | 'endsOn' | 'matcher'>> & {
  readonly endsOn?: IncomeSourceProps['endsOn'] | null;
  readonly matcher?: IncomeSourceProps['matcher'] | null;
};

export class UpdateIncomeSource {
  constructor(private readonly sources: IncomeSourceRepository) {}

  async execute(id: string, changes: IncomeSourceChanges): Promise<IncomeSource> {
    const current = await this.sources.findById(id);
    if (!current) throw new UnknownIncomeSourceError(id);
    const { endsOn, matcher, ...rest } = changes;
    const { endsOn: currentEnd, matcher: currentMatcher, ...base } = current.props;
    const nextEnd = endsOn === null ? undefined : (endsOn ?? currentEnd);
    const nextMatcher = matcher === null ? undefined : (matcher ?? currentMatcher);
    const updated = IncomeSource.create({
      ...base,
      ...rest,
      ...(nextEnd ? { endsOn: nextEnd } : {}),
      ...(nextMatcher ? { matcher: nextMatcher } : {}),
    });
    await this.sources.save(updated);
    return updated;
  }
}

export class DeleteIncomeSource {
  constructor(private readonly sources: IncomeSourceRepository) {}

  async execute(id: string): Promise<void> {
    if (!(await this.sources.delete(id))) throw new UnknownIncomeSourceError(id);
  }
}

export interface IncomeOverview {
  readonly month: YearMonth;
  readonly projection: IncomeProjection;
  readonly tracking: IncomeTracking;
}

/**
 * Visão de renda: projeção por cenário a partir do mês corrente e acompanhamento do mês pedido
 * (o que cada fonte pagou × o esperado, renda não reconhecida e sugestões de fontes novas).
 */
export class GetIncomeOverview {
  constructor(
    private readonly sources: IncomeSourceRepository,
    private readonly ledger: IncomeLedger,
    private readonly clock: Clock,
    private readonly timeZone = 'America/Sao_Paulo',
  ) {}

  async execute(input: { month?: YearMonth; months?: number } = {}): Promise<IncomeOverview> {
    const today = LocalDate.fromInstant(this.clock.now(), this.timeZone);
    const current = YearMonth.of(today);
    const month = input.month ?? current;
    const sources = await this.sources.findAll();
    // Mês pedido + 2 anteriores: janela das sugestões de fontes novas.
    const records = await this.ledger.incomeBetween(month.addMonths(-2).firstDay(), month.lastDay());
    return {
      month,
      projection: projectIncome(sources, DEFAULT_SCENARIOS, current, input.months ?? 24),
      tracking: trackIncome(sources, records, month, today),
    };
  }
}
