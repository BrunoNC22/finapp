import { describe, expect, it } from 'vitest';
import { FakeAssistantData } from '../../../../test/doubles/fake-assistant-data.js';
import { monthlyAnalysisPack, PACK_TRANSACTIONS } from './monthly-analysis.js';

describe('monthlyAnalysisPack', () => {
  it('gathers everything the monthly analysis looks at, for the month and the one before', async () => {
    const data = new FakeAssistantData();
    const pack = await monthlyAnalysisPack(data, '2026-10');
    expect(pack.mes).toBe('2026-10');
    expect(pack.mes_anterior).toBe('2026-09');
    expect(data.calls).toEqual(
      expect.arrayContaining([
        ['monthSummary', '2026-10'],
        ['monthSummary', '2026-09'],
        ['spendingByCategory', '2026-10', 'grupo'],
        ['spendingByCategory', '2026-10', 'categoria'],
        ['transactions', { de: '2026-10-01', ate: '2026-10-31', tipo: 'gasto', limite: PACK_TRANSACTIONS }],
        ['commitments'],
        ['recurring'],
        ['income', 12],
        ['goals', undefined],
        ['opportunities', true],
      ]),
    );
    expect(data.calls).toHaveLength(10);
    expect(Object.keys(pack)).toEqual([
      'mes',
      'mes_anterior',
      'resumo',
      'resumo_mes_anterior',
      'gastos_por_grupo',
      'gastos_por_categoria',
      'gastos_do_mes',
      'compromissos_futuros',
      'recorrencias',
      'renda_e_cenarios',
      'metas_e_viabilidade',
      'oportunidades_abertas',
    ]);
  });

  it('defaults to the last closed month (the one before the current)', async () => {
    const data = new FakeAssistantData();
    data.currentMonth = '2027-01';
    const pack = await monthlyAnalysisPack(data);
    expect(pack.mes).toBe('2026-12');
    expect(pack.mes_anterior).toBe('2026-11');
    expect(data.calls).toContainEqual([
      'transactions',
      expect.objectContaining({ de: '2026-12-01', ate: '2026-12-31' }),
    ]);
  });
});
