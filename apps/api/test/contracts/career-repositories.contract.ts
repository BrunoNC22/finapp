import { describe, expect, it } from 'vitest';
import type { CareerProfileRepository, OpportunityRepository } from '../../src/modules/career/application/career.js';
import { CareerProfile, Opportunity } from '../../src/modules/career/domain/career.js';
import { Money } from '../../src/shared/kernel/money.js';

export const SAMPLE_PROFILE = {
  headline: 'Desenvolvedora Full Stack',
  summary: 'Perfil fictício para testes.',
  location: 'Cidade Exemplo',
  preferences: { workModes: ['freela', 'pj'], remote: true, inPerson: false },
  english: { reading: 'fluente', listening: 'fluente', writing: 'avancado', speaking: 'intermediario' },
  skills: [{ name: 'TypeScript', level: 'avancado' }],
  experiences: [{ title: 'Dev', organization: 'Empresa A', start: '2025-01', description: 'Sistemas web' }],
  education: [{ title: 'Bacharelado', institution: 'Instituto X', start: '2020-03', end: '2027-12' }],
  links: [{ label: 'Portfólio', url: 'https://exemplo.dev' }],
  resumeMarkdown: '# Fulana de Tal\n\nDesenvolvedora.',
} as const;

/** Contratos dos repositórios de carreira (fake e MongoDB). */
export function careerRepositoriesContract(
  name: string,
  make: () => Promise<{ profiles: CareerProfileRepository; opportunities: OpportunityRepository }>,
) {
  describe(`career repositories (${name})`, () => {
    it('keeps a single profile, replaced on save', async () => {
      const { profiles } = await make();
      expect(await profiles.get()).toBeUndefined();
      await profiles.save(CareerProfile.create(structuredClone(SAMPLE_PROFILE) as never));
      await profiles.save(CareerProfile.create({ ...structuredClone(SAMPLE_PROFILE), hoursPerWeek: 10 } as never));
      const back = await profiles.get();
      expect(back?.props.hoursPerWeek).toBe(10);
      expect(back?.props.experiences[0]?.end).toBeUndefined();
      expect(back?.props.resumeMarkdown).toContain('Fulana');
    });

    it('stores opportunities with money as cents, newest first', async () => {
      const { opportunities } = await make();
      const opp = (id: string, day: string, cents?: number) =>
        Opportunity.create({
          id,
          title: `Oportunidade ${id}`,
          kind: 'recorrente',
          status: 'ideia',
          ...(cents ? { estimatedMonthly: Money.fromCents(cents) } : {}),
          notes: '',
          updatedAt: new Date(`${day}T12:00:00Z`),
        });
      await opportunities.save(opp('a', '2026-11-01', 80000));
      await opportunities.save(opp('b', '2026-11-05'));
      expect((await opportunities.findAll()).map((o) => o.id)).toEqual(['b', 'a']);
      expect((await opportunities.findById('a'))?.props.estimatedMonthly?.cents).toBe(80000);
      expect(await opportunities.delete('a')).toBe(true);
      expect(await opportunities.delete('a')).toBe(false);
    });
  });
}
