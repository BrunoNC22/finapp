import { describe, expect, it } from 'vitest';
import { careerRepositoriesContract, SAMPLE_PROFILE } from '../../../../test/contracts/career-repositories.contract.js';
import { FixedClock } from '../../../../test/doubles/fixed-clock.js';
import {
  InMemoryCareerProfileRepository,
  InMemoryOpportunityRepository,
} from '../../../../test/doubles/in-memory-career.js';
import { SequentialIdGenerator } from '../../../../test/doubles/sequential-id-generator.js';
import { Money } from '../../../shared/kernel/money.js';
import { InvalidCareerDataError } from '../domain/career.js';
import {
  CreateOpportunity,
  DeleteOpportunity,
  SaveCareerProfile,
  UnknownOpportunityError,
  UpdateOpportunity,
} from './career.js';

careerRepositoriesContract('em memória', async () => ({
  profiles: new InMemoryCareerProfileRepository(),
  opportunities: new InMemoryOpportunityRepository(),
}));

describe('career use cases', () => {
  it('saves a valid profile and refuses an invalid one', async () => {
    const profiles = new InMemoryCareerProfileRepository();
    await new SaveCareerProfile(profiles).execute(structuredClone(SAMPLE_PROFILE) as never);
    expect((await profiles.get())?.props.headline).toBe('Desenvolvedora Full Stack');
    await expect(
      new SaveCareerProfile(profiles).execute({ ...structuredClone(SAMPLE_PROFILE), hoursPerWeek: 200 } as never),
    ).rejects.toThrow(InvalidCareerDataError);
  });

  it('creates, moves on the board (clearing the estimate) and deletes an opportunity', async () => {
    const repo = new InMemoryOpportunityRepository();
    const clock = new FixedClock(new Date('2026-11-08T12:00:00Z'));
    const created = await new CreateOpportunity(repo, new SequentialIdGenerator('op'), clock).execute({
      title: 'Agente de IA no WhatsApp',
      kind: 'recorrente',
      status: 'ideia',
      estimatedMonthly: Money.fromReais(800),
      link: 'https://exemplo.dev/proposta',
      notes: '',
    });
    clock.advanceMinutes(60);
    const moved = await new UpdateOpportunity(repo, clock).execute(created.id, {
      status: 'conversa',
      link: null,
      estimatedOneOff: Money.fromReais(700),
    });
    expect(moved.props).toMatchObject({ status: 'conversa', title: 'Agente de IA no WhatsApp' });
    expect(moved.props.link).toBeUndefined();
    expect(moved.props.estimatedMonthly?.cents).toBe(80000);
    expect(moved.props.estimatedOneOff?.cents).toBe(70000);
    expect(moved.props.updatedAt).toEqual(clock.now());

    await new DeleteOpportunity(repo).execute(created.id);
    await expect(new DeleteOpportunity(repo).execute(created.id)).rejects.toThrow(UnknownOpportunityError);
    await expect(new UpdateOpportunity(repo, clock).execute('nope', { status: 'aplicada' })).rejects.toThrow(
      UnknownOpportunityError,
    );
  });
});
