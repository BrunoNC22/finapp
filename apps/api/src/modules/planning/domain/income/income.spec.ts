import { describe, expect, it } from 'vitest';
import { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { YearMonth } from '../../../../shared/kernel/year-month.js';
import { projectIncome } from './income-projection.js';
import type { IncomeRecord } from './income-record.js';
import { DEFAULT_SCENARIOS } from './income-scenario.js';
import { IncomeSource, InvalidIncomeSourceError } from './income-source.js';
import { trackIncome } from './income-tracker.js';

// Cenário SINTÉTICO com a estrutura de uma renda instável: bolsa que acaba, freela arriscado, bolsa pendente.
const ym = YearMonth.parse;
const scholarship = IncomeSource.create({
  id: 'bolsa-a',
  name: 'Bolsa A',
  kind: 'scholarship',
  expectedMonthly: Money.fromReais(900),
  startsOn: ym('2026-01'),
  endsOn: ym('2027-04'),
  risk: 'low',
  status: 'active',
  matcher: { counterpartyContains: 'fundacao exemplo' },
});
const freelance = IncomeSource.create({
  id: 'freela',
  name: 'Freela',
  kind: 'freelance',
  expectedMonthly: Money.fromReais(1500),
  startsOn: ym('2025-07'),
  risk: 'high',
  status: 'active',
  matcher: { counterpartyContains: 'agencia exemplo' },
});
const pending = IncomeSource.create({
  id: 'bolsa-b',
  name: 'Bolsa B',
  kind: 'scholarship',
  expectedMonthly: Money.fromReais(1232),
  startsOn: ym('2026-11'),
  endsOn: ym('2028-04'),
  risk: 'low',
  status: 'pending',
});
const sources = [scholarship, freelance, pending];

const record = (day: string, reais: number, counterpartyName?: string, description = 'Pix recebido'): IncomeRecord => ({
  id: `${day}-${reais}`,
  occurredOn: LocalDate.parse(day),
  amount: Money.fromReais(reais),
  accountId: 'conta',
  description,
  ...(counterpartyName ? { counterpartyName } : {}),
});

describe('IncomeSource', () => {
  it('is active only between its start and end months, and never when ended', () => {
    expect(scholarship.activeIn(ym('2025-12'))).toBe(false);
    expect(scholarship.activeIn(ym('2026-01'))).toBe(true);
    expect(scholarship.activeIn(ym('2027-04'))).toBe(true);
    expect(scholarship.activeIn(ym('2027-05'))).toBe(false);
    expect(freelance.activeIn(ym('2030-01'))).toBe(true);
    expect(freelance.withChanges({ status: 'ended' }).activeIn(ym('2026-11'))).toBe(false);
  });

  it('validates what makes no sense', () => {
    const base = { id: 'x', name: 'X', kind: 'other', risk: 'low', status: 'active', startsOn: ym('2026-01') } as const;
    expect(() => IncomeSource.create({ ...base, name: ' ', expectedMonthly: Money.fromReais(1) })).toThrow(
      InvalidIncomeSourceError,
    );
    expect(() => IncomeSource.create({ ...base, expectedMonthly: Money.zero() })).toThrow(InvalidIncomeSourceError);
    expect(() => IncomeSource.create({ ...base, expectedMonthly: Money.fromReais(1), endsOn: ym('2025-12') })).toThrow(
      InvalidIncomeSourceError,
    );
  });

  it('recognizes its credits by counterparty, description or account (no accents, any case)', () => {
    expect(scholarship.matches(record('2026-10-05', 900, 'FUNDAÇÃO EXEMPLO DE AMPARO'))).toBe(true);
    expect(scholarship.matches(record('2026-10-05', 900, 'Outra pessoa'))).toBe(false);
    expect(pending.matches(record('2026-10-05', 900, 'Fundação Exemplo'))).toBe(false); // sem matcher
  });
});

describe('projectIncome (conferido à mão)', () => {
  const projection = projectIncome(sources, DEFAULT_SCENARIOS, ym('2026-10'), 20);
  const totals = (id: string) => projection.scenarios.find((s) => s.id === id)?.totals.map((m) => m.cents / 100);

  it('Piso: só o que é de baixo risco e já ativo (a bolsa A, que acaba em abril/2027)', () => {
    // out/26..abr/27 = 7 meses de 900; mai/27 em diante = 0
    expect(totals('floor')).toEqual([...Array(7).fill(900), ...Array(13).fill(0)]);
  });

  it('Provável: + pendentes de baixo/médio risco (a bolsa B entra em nov/26 e vai até abr/28)', () => {
    // out/26: 900 | nov/26..abr/27: 900 + 1232 = 2132 (6 meses) | mai/27..mai/28 (fim da projeção em mai/28): 1232 até abr/28
    expect(totals('likely')).toEqual([900, ...Array(6).fill(2132), ...Array(12).fill(1232), 0]);
  });

  it('Otimista: tudo que não acabou, inclusive o freela de alto risco', () => {
    expect(totals('optimistic')).toEqual([2400, ...Array(6).fill(3632), ...Array(12).fill(2732), 1500]);
  });

  it('lists the months and the share of each source', () => {
    expect(projection.months[0]?.toString()).toBe('2026-10');
    expect(projection.months.at(-1)?.toString()).toBe('2028-05');
    const optimistic = projection.scenarios.find((s) => s.id === 'optimistic');
    expect(optimistic?.bySource.find((s) => s.sourceId === 'freela')?.amounts[0]?.cents).toBe(150000);
  });
});

describe('trackIncome: o que entrou × o que era esperado', () => {
  const records = [
    record('2026-10-05', 900, 'Fundação Exemplo'),
    record('2026-10-12', 700, 'Agência Exemplo LTDA'),
    record('2026-10-20', 300, 'Fulano de Tal'),
    record('2026-09-20', 280, 'Fulano de Tal'),
    record('2026-08-21', 320, 'Fulano de Tal'),
    record('2026-10-30', 3, undefined, 'Rendimento'),
  ];

  it('shows per source whether it paid, paid less, or did not pay', () => {
    const october = trackIncome(sources, records, ym('2026-10'), LocalDate.parse('2026-11-08'));
    expect(october.sources.map((s) => [s.sourceId, s.status, s.observed.cents])).toEqual([
      ['bolsa-a', 'paid', 90000],
      ['freela', 'partial', 70000],
      ['bolsa-b', 'not_expected', 0],
    ]);
  });

  it('in the current month a source that did not pay yet is waiting, not missing', () => {
    const november = trackIncome(sources, [], ym('2026-11'), LocalDate.parse('2026-11-08'));
    expect(november.sources.find((s) => s.sourceId === 'bolsa-a')?.status).toBe('waiting');
    const september = trackIncome(sources, [], ym('2026-09'), LocalDate.parse('2026-11-08'));
    expect(september.sources.find((s) => s.sourceId === 'bolsa-a')?.status).toBe('missing');
  });

  it('suggests a new source for unrecognized income that repeats in different months', () => {
    const october = trackIncome(sources, records, ym('2026-10'), LocalDate.parse('2026-11-08'));
    expect(october.unrecognized.cents).toBe(30300);
    expect(october.suggestions).toEqual([{ name: 'Fulano de Tal', months: 3, averageMonthly: Money.fromReais(300) }]);
  });
});
