import { describe, expect, it } from 'vitest';
import { Money } from '../../../shared/kernel/money.js';
import { CareerProfile, InvalidCareerDataError, Opportunity } from './career.js';

const profile = (extra: Partial<Parameters<typeof CareerProfile.create>[0]> = {}) =>
  CareerProfile.create({
    headline: 'Desenvolvedora Full Stack',
    summary: 'Perfil fictício.',
    location: 'Cidade Exemplo',
    preferences: { workModes: ['freela', 'pj'], remote: true, inPerson: false },
    english: { reading: 'fluente', listening: 'fluente', writing: 'avancado', speaking: 'intermediario' },
    skills: [{ name: 'TypeScript', level: 'avancado' }],
    experiences: [
      { title: 'Dev', organization: 'Empresa A', start: '2025-01', end: '2026-11', description: '' },
      { title: 'Social media', organization: 'Empresa B', start: '2026-11', description: '' },
    ],
    education: [{ title: 'Bacharelado', institution: 'Instituto X', start: '2020-03' }],
    links: [{ label: 'Portfólio', url: 'https://exemplo.dev' }],
    resumeMarkdown: '# Fulana',
    ...extra,
  });

describe('CareerProfile', () => {
  it('knows what is current and validates periods, hours and links', () => {
    expect(profile().current.map((e) => e.organization)).toEqual(['Empresa B']);
    expect(() => profile({ hoursPerWeek: 120 })).toThrow(InvalidCareerDataError);
    expect(() =>
      profile({ experiences: [{ title: 'X', organization: 'Y', start: '2026-05', end: '2026-01', description: '' }] }),
    ).toThrow(InvalidCareerDataError);
    expect(() => profile({ links: [{ label: 'x', url: 'javascript:alert(1)' }] })).toThrow(InvalidCareerDataError);
    expect(() => profile({ headline: ' ' })).toThrow(InvalidCareerDataError);
  });
});

describe('Opportunity', () => {
  const opp = () =>
    Opportunity.create({
      id: 'o1',
      title: 'Agente de IA no WhatsApp',
      kind: 'recorrente',
      status: 'ideia',
      estimatedMonthly: Money.fromReais(800),
      notes: '',
      updatedAt: new Date('2026-11-08T12:00:00Z'),
    });

  it('moves along the board and records when', () => {
    const later = new Date('2026-11-20T12:00:00Z');
    const moved = opp().withChanges({ status: 'conversa' }, later);
    expect(moved.props.status).toBe('conversa');
    expect(moved.props.updatedAt).toBe(later);
    expect(moved.isOpen).toBe(true);
    expect(moved.withChanges({ status: 'perdida' }, later).isOpen).toBe(false);
  });

  it('refuses negative estimates and unsafe links', () => {
    expect(() => opp().withChanges({ estimatedMonthly: Money.fromReais(-1) }, new Date())).toThrow(
      InvalidCareerDataError,
    );
    expect(() => opp().withChanges({ link: 'ftp://x' }, new Date())).toThrow(InvalidCareerDataError);
  });
});
