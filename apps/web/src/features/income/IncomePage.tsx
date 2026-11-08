import type { CreateIncomeSourceCommand, IncomeOverviewDto, IncomeSourceDto } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useServices } from '../../app/services';
import { categoryAxis, dataset, LineChart, moneyAxis, monthLabels, useChartTheme } from '../../lib/charts';
import { formatCents, formatMonth } from '../../lib/format';
import { currentMonth, isMonth, type Month } from '../../lib/months';
import { MonthPicker } from '../shared/MonthPicker';
import { QueryState } from '../shared/QueryState';
import { financeKeys } from '../shared/queries';
import { type IncomeSourceDraft, IncomeSourceForm } from './IncomeSourceForm';
import { KIND_LABEL, periodLabel, RISK_LABEL, STATUS_LABEL, TRACKING_LABEL } from './income-labels';

type Editing = { mode: 'new'; draft?: IncomeSourceDraft } | { mode: 'edit'; source: IncomeSourceDto };

/** Renda: o que entrou × o esperado, de onde vem e quanto se projeta em cada cenário. */
export function IncomePage() {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const latest = currentMonth();
  const requested = params.get('mes');
  const month: Month = isMonth(requested) && requested <= latest ? requested : latest;
  const sources = useQuery({ queryKey: financeKeys.incomeSources, queryFn: () => finance.incomeSources() });
  const overview = useQuery({
    queryKey: financeKeys.incomeOverview(month),
    queryFn: () => finance.incomeOverview(month),
  });
  const [editing, setEditing] = useState<Editing | undefined>();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: financeKeys.all });

  const save = useMutation({
    mutationFn: async (command: CreateIncomeSourceCommand) => {
      if (editing?.mode === 'edit') {
        const s = editing.source;
        await finance.updateIncomeSource(s.id, {
          ...command,
          endsOn: command.endsOn ?? null,
          matcher: command.matcher ?? null,
        });
      } else await finance.createIncomeSource(command);
    },
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => finance.deleteIncomeSource(id), onSuccess: refresh });
  const nameOf = (id: string) => sources.data?.find((s) => s.id === id)?.name ?? 'Fonte';

  return (
    <section className="page" aria-labelledby="income-title">
      <header className="page-header">
        <h1 id="income-title">Renda</h1>
        <MonthPicker month={month} latest={latest} onChange={(m) => setParams({ mes: m })} />
      </header>

      {editing && (
        <IncomeSourceForm
          key={editing.mode === 'edit' ? editing.source.id : (editing.draft?.name ?? 'nova')}
          {...(editing.mode === 'edit' ? { source: editing.source } : editing.draft ? { draft: editing.draft } : {})}
          busy={save.isPending}
          onSubmit={(command) => save.mutate(command)}
          onCancel={() => setEditing(undefined)}
        />
      )}
      {save.isError && <p className="error">Não foi possível salvar a fonte.</p>}

      <QueryState
        isPending={overview.isPending}
        error={overview.error}
        onRetry={() => void overview.refetch()}
        skeletons={2}
      >
        {overview.data && (
          <>
            <Tracking
              overview={overview.data}
              nameOf={nameOf}
              month={month}
              onCreate={(draft) => setEditing({ mode: 'new', draft })}
            />
            <Projection overview={overview.data} />
          </>
        )}
      </QueryState>

      <article className="card">
        <div className="card-header">
          <h2>Fontes de renda</h2>
          <button type="button" className="primary" onClick={() => setEditing({ mode: 'new' })}>
            Nova fonte
          </button>
        </div>
        <QueryState
          isPending={sources.isPending}
          error={sources.error}
          isEmpty={(sources.data ?? []).length === 0}
          empty={<p className="hint">Cadastre de onde vem o seu dinheiro: bolsas, freelas, salário.</p>}
          skeletons={2}
        >
          <ul className="rank-list" aria-label="Fontes de renda">
            {sources.data?.map((s) => (
              <li key={s.id}>
                <div className="rank-main">
                  <span className="rank-title">{s.name}</span>
                  <span className="hint">
                    {KIND_LABEL[s.kind]} · {periodLabel(s)} · {RISK_LABEL[s.risk]} · {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <div className="rank-side">
                  <strong className="amount">{formatCents(s.expectedMonthly.cents)}/mês</strong>
                  <span className="row">
                    <button type="button" className="link" onClick={() => setEditing({ mode: 'edit', source: s })}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="link"
                      onClick={() => window.confirm(`Excluir "${s.name}"?`) && remove.mutate(s.id)}
                    >
                      Excluir
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </QueryState>
      </article>
    </section>
  );
}

function Tracking({
  overview,
  nameOf,
  month,
  onCreate,
}: {
  overview: IncomeOverviewDto;
  nameOf: (id: string) => string;
  month: Month;
  onCreate: (draft: IncomeSourceDraft) => void;
}) {
  const { tracking } = overview;
  return (
    <article className="card">
      <h2>O que entrou em {formatMonth(month)}</h2>
      {tracking.sources.length === 0 ? (
        <p className="hint">Nenhuma fonte cadastrada para acompanhar.</p>
      ) : (
        <ul className="rank-list" aria-label="Acompanhamento das fontes">
          {tracking.sources.map((t) => (
            <li key={t.sourceId}>
              <div className="rank-main">
                <span className="rank-title">{nameOf(t.sourceId)}</span>
                <span className="hint">
                  esperado {formatCents(t.expected.cents)} · entrou {formatCents(t.observed.cents)}
                </span>
              </div>
              <span className={`badge badge-${TRACKING_LABEL[t.status].tone}`}>{TRACKING_LABEL[t.status].label}</span>
            </li>
          ))}
        </ul>
      )}
      {tracking.unrecognized.cents > 0 && (
        <p className="hint">Entradas que nenhuma fonte reconhece: {formatCents(tracking.unrecognized.cents)}.</p>
      )}
      {tracking.suggestions.length > 0 && (
        <div className="suggestions">
          <h3>Pagamentos que se repetem e ainda não são uma fonte</h3>
          <ul className="rank-list" aria-label="Sugestões de fontes">
            {tracking.suggestions.map((s) => (
              <li key={s.name}>
                <div className="rank-main">
                  <span className="rank-title">{s.name}</span>
                  <span className="hint">
                    em {s.months} dos últimos 3 meses · média {formatCents(s.averageMonthly.cents)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onCreate({
                      name: s.name,
                      expectedMonthlyCents: s.averageMonthly.cents,
                      counterpartyContains: s.name,
                    })
                  }
                >
                  Criar fonte
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

const SCENARIO_COLOR = { floor: 'expense', likely: 'committed', optimistic: 'income' } as const;

function Projection({ overview }: { overview: IncomeOverviewDto }) {
  const { palette } = useChartTheme();
  const { months, scenarios } = overview.projection;
  if (months.length === 0) return null;
  return (
    <article className="card chart-card wide">
      <h2>Renda projetada</h2>
      <p className="hint">
        Piso: só o que é seguro e já paga · Provável: inclui pendentes, sem o que é de alto risco · Otimista: tudo
      </p>
      <div className="chart" role="img" aria-label="Gráfico de linhas: renda projetada em cada cenário">
        <LineChart
          data={{
            labels: monthLabels(months),
            datasets: scenarios.map((s) =>
              dataset.line(
                palette,
                s.name,
                s.totals.map((m) => m.cents),
                SCENARIO_COLOR[s.id],
                { dashed: s.id === 'floor' },
              ),
            ),
          }}
          options={{ scales: { x: categoryAxis, y: moneyAxis } }}
        />
      </div>
    </article>
  );
}
