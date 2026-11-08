import {
  type CreateIncomeSourceCommand,
  CreateIncomeSourceCommandSchema,
  type IncomeOverviewDto,
  IncomeOverviewQuerySchema,
  type IncomeSourceDto,
  type MoneyDto,
  type UpdateIncomeSourceCommand,
  UpdateIncomeSourceCommandSchema,
} from '@finapp/contracts';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { Money } from '../../../shared/kernel/money.js';
import { YearMonth } from '../../../shared/kernel/year-month.js';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import { IncomeSourceRepository } from '../application/ports/income-ports.js';
import {
  CreateIncomeSource,
  DeleteIncomeSource,
  GetIncomeOverview,
  UpdateIncomeSource,
} from '../application/use-cases/income.js';
import { DEFAULT_SCENARIOS } from '../domain/income/income-scenario.js';
import type { IncomeSource } from '../domain/income/income-source.js';

const money = (value: Money): MoneyDto => ({ cents: value.cents, currency: 'BRL' });

const toDto = (source: IncomeSource): IncomeSourceDto => {
  const p = source.props;
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    expectedMonthly: money(p.expectedMonthly),
    startsOn: p.startsOn.toString(),
    ...(p.endsOn ? { endsOn: p.endsOn.toString() } : {}),
    risk: p.risk,
    status: p.status,
    ...(p.matcher ? { matcher: { ...p.matcher } } : {}),
  };
};

const matcherOf = (m: CreateIncomeSourceCommand['matcher']) =>
  m
    ? {
        ...(m.counterpartyContains ? { counterpartyContains: m.counterpartyContains } : {}),
        ...(m.descriptionContains ? { descriptionContains: m.descriptionContains } : {}),
        ...(m.accountId ? { accountId: m.accountId } : {}),
      }
    : undefined;

@Controller('income')
export class IncomeController {
  constructor(
    @Inject(IncomeSourceRepository) private readonly sources: IncomeSourceRepository,
    @Inject(CreateIncomeSource) private readonly create: CreateIncomeSource,
    @Inject(UpdateIncomeSource) private readonly update: UpdateIncomeSource,
    @Inject(DeleteIncomeSource) private readonly remove: DeleteIncomeSource,
    @Inject(GetIncomeOverview) private readonly overview: GetIncomeOverview,
  ) {}

  @Get('sources')
  async list(): Promise<IncomeSourceDto[]> {
    return (await this.sources.findAll()).map(toDto);
  }

  @Post('sources')
  async add(
    @Body(new ZodPipe(CreateIncomeSourceCommandSchema)) body: CreateIncomeSourceCommand,
  ): Promise<IncomeSourceDto> {
    const matcher = matcherOf(body.matcher);
    return toDto(
      await this.create.execute({
        name: body.name,
        kind: body.kind,
        expectedMonthly: Money.fromCents(body.expectedMonthlyCents),
        startsOn: YearMonth.parse(body.startsOn),
        ...(body.endsOn ? { endsOn: YearMonth.parse(body.endsOn) } : {}),
        risk: body.risk,
        status: body.status,
        ...(matcher ? { matcher } : {}),
      }),
    );
  }

  @Patch('sources/:id')
  async change(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateIncomeSourceCommandSchema)) body: UpdateIncomeSourceCommand,
  ): Promise<IncomeSourceDto> {
    const matcher = body.matcher === null ? null : matcherOf(body.matcher);
    return toDto(
      await this.update.execute(id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(body.expectedMonthlyCents ? { expectedMonthly: Money.fromCents(body.expectedMonthlyCents) } : {}),
        ...(body.startsOn ? { startsOn: YearMonth.parse(body.startsOn) } : {}),
        ...(body.endsOn === null ? { endsOn: null } : body.endsOn ? { endsOn: YearMonth.parse(body.endsOn) } : {}),
        ...(body.risk ? { risk: body.risk } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(matcher !== undefined ? { matcher } : {}),
      }),
    );
  }

  @Delete('sources/:id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    await this.remove.execute(id);
  }

  @Get('overview')
  async get(
    @Query(new ZodPipe(IncomeOverviewQuerySchema)) query: { month?: string; months: number },
  ): Promise<IncomeOverviewDto> {
    const o = await this.overview.execute({
      ...(query.month ? { month: YearMonth.parse(query.month) } : {}),
      months: query.months,
    });
    return {
      month: o.month.toString(),
      projection: {
        months: o.projection.months.map(String),
        scenarios: o.projection.scenarios.map((s) => ({
          id: s.id,
          name: s.name,
          description: DEFAULT_SCENARIOS.find((d) => d.id === s.id)?.description ?? '',
          totals: s.totals.map(money),
          bySource: s.bySource.map((b) => ({ sourceId: b.sourceId, amounts: b.amounts.map(money) })),
        })),
      },
      tracking: {
        sources: o.tracking.sources.map((t) => ({
          sourceId: t.sourceId,
          expected: money(t.expected),
          observed: money(t.observed),
          status: t.status,
        })),
        unrecognized: money(o.tracking.unrecognized),
        suggestions: o.tracking.suggestions.map((s) => ({
          name: s.name,
          months: s.months,
          averageMonthly: money(s.averageMonthly),
        })),
      },
    };
  }
}
