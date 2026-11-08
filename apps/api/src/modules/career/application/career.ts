import type { Clock } from '../../../shared/application/clock.js';
import { NotFoundError } from '../../../shared/application/errors.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import { CareerProfile, type CareerProfileProps, Opportunity, type OpportunityProps } from '../domain/career.js';

export abstract class CareerProfileRepository {
  abstract get(): Promise<CareerProfile | undefined>;
  abstract save(profile: CareerProfile): Promise<void>;
}

export abstract class OpportunityRepository {
  /** Mais recentes primeiro. */
  abstract findAll(): Promise<Opportunity[]>;
  abstract findById(id: string): Promise<Opportunity | undefined>;
  abstract save(opportunity: Opportunity): Promise<void>;
  abstract delete(id: string): Promise<boolean>;
}

export class UnknownOpportunityError extends NotFoundError {
  constructor(id: string) {
    super(`oportunidade inexistente: ${id}`);
  }
}

export class SaveCareerProfile {
  constructor(private readonly profiles: CareerProfileRepository) {}

  async execute(props: CareerProfileProps): Promise<CareerProfile> {
    const profile = CareerProfile.create(props);
    await this.profiles.save(profile);
    return profile;
  }
}

export type OpportunityInput = Omit<OpportunityProps, 'id' | 'updatedAt'>;
/** `null` limpa o campo. */
export type OpportunityChanges = Partial<Omit<OpportunityInput, 'estimatedMonthly' | 'estimatedOneOff' | 'link'>> & {
  readonly estimatedMonthly?: OpportunityProps['estimatedMonthly'] | null;
  readonly estimatedOneOff?: OpportunityProps['estimatedOneOff'] | null;
  readonly link?: string | null;
};

export class CreateOpportunity {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: OpportunityInput): Promise<Opportunity> {
    const opportunity = Opportunity.create({ id: this.ids.next(), ...input, updatedAt: this.clock.now() });
    await this.opportunities.save(opportunity);
    return opportunity;
  }
}

export class UpdateOpportunity {
  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, changes: OpportunityChanges): Promise<Opportunity> {
    const current = await this.opportunities.findById(id);
    if (!current) throw new UnknownOpportunityError(id);
    const { estimatedMonthly, estimatedOneOff, link, ...rest } = changes;
    const { estimatedMonthly: m, estimatedOneOff: o, link: l, id: _id, updatedAt: _at, ...base } = current.props;
    const pick = <T>(change: T | null | undefined, previous: T | undefined) =>
      change === null ? undefined : (change ?? previous);
    const nextMonthly = pick(estimatedMonthly, m);
    const nextOneOff = pick(estimatedOneOff, o);
    const nextLink = pick(link, l);
    const updated = Opportunity.create({
      id,
      ...base,
      ...rest,
      ...(nextMonthly ? { estimatedMonthly: nextMonthly } : {}),
      ...(nextOneOff ? { estimatedOneOff: nextOneOff } : {}),
      ...(nextLink ? { link: nextLink } : {}),
      updatedAt: this.clock.now(),
    });
    await this.opportunities.save(updated);
    return updated;
  }
}

export class DeleteOpportunity {
  constructor(private readonly opportunities: OpportunityRepository) {}

  async execute(id: string): Promise<void> {
    if (!(await this.opportunities.delete(id))) throw new UnknownOpportunityError(id);
  }
}
