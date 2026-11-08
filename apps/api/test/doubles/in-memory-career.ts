import { CareerProfileRepository, OpportunityRepository } from '../../src/modules/career/application/career.js';
import type { CareerProfile, Opportunity } from '../../src/modules/career/domain/career.js';

export class InMemoryCareerProfileRepository extends CareerProfileRepository {
  private profile: CareerProfile | undefined;
  async get() {
    return this.profile;
  }
  async save(profile: CareerProfile) {
    this.profile = profile;
  }
}

export class InMemoryOpportunityRepository extends OpportunityRepository {
  private rows = new Map<string, Opportunity>();
  async findAll() {
    return [...this.rows.values()].sort((a, b) => b.props.updatedAt.getTime() - a.props.updatedAt.getTime());
  }
  async findById(id: string) {
    return this.rows.get(id);
  }
  async save(o: Opportunity) {
    this.rows.set(o.id, o);
  }
  async delete(id: string) {
    return this.rows.delete(id);
  }
}
