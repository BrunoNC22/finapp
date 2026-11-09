import type { RecordAnalysisCommand } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { formatMonthLong, isMonth } from '../../lib/months';
import { financeKeys } from '../shared/queries';

/**
 * Lembrete da rotina mensal: enquanto a análise do último mês fechado não for feita (pela skill do Claude Code,
 * que marca sozinha) ou pulada, o Painel avisa. Some sem alarde se a API falhar.
 */
export function AnalysisReminder() {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const reminder = useQuery({ queryKey: financeKeys.analysisReminder, queryFn: () => finance.analysisReminder() });
  const mark = useMutation({
    mutationFn: (outcome: RecordAnalysisCommand['outcome']) =>
      finance.recordAnalysis(reminder.data?.month ?? '', outcome),
    onSuccess: (updated) => queryClient.setQueryData(financeKeys.analysisReminder, updated),
  });
  const data = reminder.data;
  if (!data?.pending || !isMonth(data.month)) return null;
  const month = formatMonthLong(data.month);

  return (
    <aside className="card reminder" aria-label="Análise do mês">
      <div>
        <strong>A análise de {month} ainda não foi feita.</strong>
        <p className="hint">
          No Claude Code, rode <code>/analise-financeira</code>: ela compara com o mês anterior, revê as metas e propõe
          3 ações. Ao registrar, este aviso some sozinho.
        </p>
        {mark.isError && (
          <p className="error" role="alert">
            Não foi possível salvar. Tente de novo.
          </p>
        )}
      </div>
      <div className="row">
        <button type="button" className="primary" disabled={mark.isPending} onClick={() => mark.mutate('feita')}>
          Já fiz
        </button>
        <button type="button" disabled={mark.isPending} onClick={() => mark.mutate('pulada')}>
          Pular este mês
        </button>
      </div>
    </aside>
  );
}
