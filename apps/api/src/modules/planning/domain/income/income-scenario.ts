import type { IncomeSource } from './income-source.js';

export type ScenarioId = 'floor' | 'likely' | 'optimistic';

export interface IncomeScenario {
  readonly id: ScenarioId;
  readonly name: string;
  readonly description: string;
  includes(source: IncomeSource): boolean;
}

/**
 * Cenários padrão. Metas devem caber no PISO para serem seguras: é a renda que sobra se o que é
 * arriscado parar e o que está pendente não vier.
 */
export const DEFAULT_SCENARIOS: readonly IncomeScenario[] = [
  {
    id: 'floor',
    name: 'Piso',
    description: 'Só fontes de baixo risco que já estão pagando.',
    includes: (s) => s.risk === 'low' && s.status === 'active',
  },
  {
    id: 'likely',
    name: 'Provável',
    description: 'Baixo e médio risco, incluindo as pendentes (ex.: bolsa aguardando resultado).',
    includes: (s) => s.risk !== 'high' && s.status !== 'ended',
  },
  {
    id: 'optimistic',
    name: 'Otimista',
    description: 'Tudo que não acabou, inclusive o que é arriscado.',
    includes: (s) => s.status !== 'ended',
  },
];
