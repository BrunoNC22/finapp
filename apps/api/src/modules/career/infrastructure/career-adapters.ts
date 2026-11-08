import { type Collection, type Db, Long } from 'mongodb';
import { Money } from '../../../shared/kernel/money.js';
import { CareerProfileRepository, OpportunityRepository } from '../application/career.js';
import {
  CareerProfile,
  type CareerProfileProps,
  Opportunity,
  type OpportunityKind,
  type OpportunityStatus,
} from '../domain/career.js';

export const CAREER_COLLECTIONS = { profile: 'career_profile', opportunities: 'opportunities' } as const;

type ProfileDocument = CareerProfileProps & { _id: 'owner' };

/** Um único documento: o perfil do dono da instância. */
export class MongoCareerProfileRepository extends CareerProfileRepository {
  private readonly collection: Collection<ProfileDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<ProfileDocument>(CAREER_COLLECTIONS.profile);
  }
  async get(): Promise<CareerProfile | undefined> {
    const doc = await this.collection.findOne({ _id: 'owner' });
    if (!doc) return undefined;
    const { _id, ...props } = doc;
    return CareerProfile.create(props);
  }
  async save(profile: CareerProfile): Promise<void> {
    await this.collection.replaceOne({ _id: 'owner' }, { ...structuredClone(profile.props) }, { upsert: true });
  }
}

interface OpportunityDocument {
  _id: string;
  title: string;
  kind: OpportunityKind;
  status: OpportunityStatus;
  estimatedMonthlyCents?: Long;
  estimatedOneOffCents?: Long;
  link?: string;
  notes: string;
  updatedAt: Date;
}

export class MongoOpportunityRepository extends OpportunityRepository {
  private readonly collection: Collection<OpportunityDocument>;
  constructor(db: Db) {
    super();
    this.collection = db.collection<OpportunityDocument>(CAREER_COLLECTIONS.opportunities);
  }
  async findAll(): Promise<Opportunity[]> {
    return (await this.collection.find().sort({ updatedAt: -1 }).toArray()).map(toEntity);
  }
  async findById(id: string): Promise<Opportunity | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toEntity(doc) : undefined;
  }
  async save(o: Opportunity): Promise<void> {
    const p = o.props;
    await this.collection.replaceOne(
      { _id: p.id },
      {
        title: p.title,
        kind: p.kind,
        status: p.status,
        ...(p.estimatedMonthly ? { estimatedMonthlyCents: Long.fromNumber(p.estimatedMonthly.cents) } : {}),
        ...(p.estimatedOneOff ? { estimatedOneOffCents: Long.fromNumber(p.estimatedOneOff.cents) } : {}),
        ...(p.link ? { link: p.link } : {}),
        notes: p.notes,
        updatedAt: p.updatedAt,
      },
      { upsert: true },
    );
  }
  async delete(id: string): Promise<boolean> {
    return (await this.collection.deleteOne({ _id: id })).deletedCount === 1;
  }
}

function toEntity(d: OpportunityDocument): Opportunity {
  return Opportunity.create({
    id: d._id,
    title: d.title,
    kind: d.kind,
    status: d.status,
    ...(d.estimatedMonthlyCents !== undefined
      ? { estimatedMonthly: Money.fromCents(Number(d.estimatedMonthlyCents)) }
      : {}),
    ...(d.estimatedOneOffCents !== undefined
      ? { estimatedOneOff: Money.fromCents(Number(d.estimatedOneOffCents)) }
      : {}),
    ...(d.link ? { link: d.link } : {}),
    notes: d.notes,
    updatedAt: d.updatedAt,
  });
}
