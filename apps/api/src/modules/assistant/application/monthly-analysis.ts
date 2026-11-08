import { YearMonth } from '../../../shared/kernel/year-month.js';
import type { AssistantData, Json } from './assistant-data.js';

/** Quantos gastos do mês entram no pacote (detalhe para explicar o que puxou cada categoria). */
export const PACK_TRANSACTIONS = 100;

/**
 * Tudo o que a análise mensal olha, numa chamada: o mês e o anterior, categorias, gastos do mês, compromissos,
 * recorrências, renda por cenário, metas e oportunidades abertas. Sem mês: o último mês fechado.
 */
export async function monthlyAnalysisPack(data: AssistantData, month?: string): Promise<Json> {
  const target = month
    ? YearMonth.parse(month)
    : YearMonth.parse(String((await data.monthSummary()).mes)).addMonths(-1);
  const previous = target.addMonths(-1);
  const [resumo, resumoAnterior, grupos, categorias, gastos, compromissos, recorrencias, renda, metas, oportunidades] =
    await Promise.all([
      data.monthSummary(target.toString()),
      data.monthSummary(previous.toString()),
      data.spendingByCategory(target.toString(), 'grupo'),
      data.spendingByCategory(target.toString(), 'categoria'),
      data.transactions({
        de: target.firstDay().toString(),
        ate: target.lastDay().toString(),
        tipo: 'gasto',
        limite: PACK_TRANSACTIONS,
      }),
      data.commitments(),
      data.recurring(),
      data.income(12),
      data.goals(undefined),
      data.opportunities(true),
    ]);
  return {
    mes: target.toString(),
    mes_anterior: previous.toString(),
    resumo,
    resumo_mes_anterior: resumoAnterior,
    gastos_por_grupo: grupos,
    gastos_por_categoria: categorias,
    gastos_do_mes: gastos,
    compromissos_futuros: compromissos,
    recorrencias,
    renda_e_cenarios: renda,
    metas_e_viabilidade: metas,
    oportunidades_abertas: oportunidades,
  };
}
