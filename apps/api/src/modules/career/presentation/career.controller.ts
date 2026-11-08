import {
  type CareerProfileDto,
  CareerProfileSchema,
  type CreateOpportunityCommand,
  CreateOpportunityCommandSchema,
  type MoneyDto,
  type OpportunityDto,
  type UpdateOpportunityCommand,
  UpdateOpportunityCommandSchema,
} from '@finapp/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { z } from 'zod';
import { Money } from '../../../shared/kernel/money.js';
import { withoutUndefined } from '../../../shared/presentation/without-undefined.js';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import {
  CareerProfileRepository,
  CreateOpportunity,
  DeleteOpportunity,
  OpportunityRepository,
  SaveCareerProfile,
  UpdateOpportunity,
} from '../application/career.js';
import type { CareerProfileProps, Opportunity } from '../domain/career.js';

const money = (value: Money): MoneyDto => ({ cents: value.cents, currency: 'BRL' });

export const toOpportunityDto = (o: Opportunity): OpportunityDto => {
  const p = o.props;
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    status: p.status,
    ...(p.estimatedMonthly ? { estimatedMonthly: money(p.estimatedMonthly) } : {}),
    ...(p.estimatedOneOff ? { estimatedOneOff: money(p.estimatedOneOff) } : {}),
    ...(p.link ? { link: p.link } : {}),
    notes: p.notes,
    updatedAt: p.updatedAt.toISOString(),
  };
};

@Controller('career')
export class CareerController {
  constructor(
    @Inject(CareerProfileRepository) private readonly profiles: CareerProfileRepository,
    @Inject(SaveCareerProfile) private readonly saveProfile: SaveCareerProfile,
    @Inject(OpportunityRepository) private readonly opportunities: OpportunityRepository,
    @Inject(CreateOpportunity) private readonly create: CreateOpportunity,
    @Inject(UpdateOpportunity) private readonly update: UpdateOpportunity,
    @Inject(DeleteOpportunity) private readonly remove: DeleteOpportunity,
  ) {}

  @Get('profile')
  async profile(): Promise<CareerProfileDto> {
    const profile = await this.profiles.get();
    if (!profile) throw new NotFoundException({ message: 'perfil ainda não preenchido' });
    return profile.props as CareerProfileDto;
  }

  @Put('profile')
  async save(@Body(new ZodPipe(CareerProfileSchema)) body: CareerProfileDto): Promise<CareerProfileDto> {
    return (await this.saveProfile.execute(withoutUndefined(body) as CareerProfileProps)).props as CareerProfileDto;
  }

  @Get('opportunities')
  async list(): Promise<OpportunityDto[]> {
    return (await this.opportunities.findAll()).map(toOpportunityDto);
  }

  @Post('opportunities')
  async add(
    @Body(new ZodPipe(CreateOpportunityCommandSchema)) body: CreateOpportunityCommand,
  ): Promise<OpportunityDto> {
    const c = body as z.output<typeof CreateOpportunityCommandSchema>;
    return toOpportunityDto(
      await this.create.execute({
        title: c.title,
        kind: c.kind,
        status: c.status,
        notes: c.notes,
        ...(c.estimatedMonthlyCents !== undefined
          ? { estimatedMonthly: Money.fromCents(c.estimatedMonthlyCents) }
          : {}),
        ...(c.estimatedOneOffCents !== undefined ? { estimatedOneOff: Money.fromCents(c.estimatedOneOffCents) } : {}),
        ...(c.link ? { link: c.link } : {}),
      }),
    );
  }

  @Patch('opportunities/:id')
  async change(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateOpportunityCommandSchema)) body: UpdateOpportunityCommand,
  ): Promise<OpportunityDto> {
    const toMoney = (cents: number | null | undefined) =>
      cents === null ? null : cents === undefined ? undefined : Money.fromCents(cents);
    const monthly = toMoney(body.estimatedMonthlyCents);
    const oneOff = toMoney(body.estimatedOneOffCents);
    return toOpportunityDto(
      await this.update.execute(id, {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(monthly !== undefined ? { estimatedMonthly: monthly } : {}),
        ...(oneOff !== undefined ? { estimatedOneOff: oneOff } : {}),
        ...(body.link !== undefined ? { link: body.link } : {}),
      }),
    );
  }

  @Delete('opportunities/:id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    await this.remove.execute(id);
  }
}
