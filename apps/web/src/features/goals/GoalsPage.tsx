import type { GoalCommand, GoalDto, GoalPlanDto, RequiredIncomeDto } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useServices } from '../../app/services';
import type { CategoryDirectory } from '../../lib/categories';
import { categoryAxis, dataset, LineChart, moneyAxis, monthLabels, useChartTheme } from '../../lib/charts';
import { formatCents, formatMonth } from '../../lib/format';
import { QueryState } from '../shared/QueryState';
import { financeKeys, useCategories } from '../shared/queries';
import { GoalForm } from './GoalForm';
import {
  ALERT_LABEL,
  FINANCING_LABEL,
  GOAL_KIND_LABEL,
  type GoalOutcome,
  monthlyEffect,
  outcomeLabel,
} from './goal-labels';

type ScenarioId = GoalPlanDto['scenarios'][number]['id'];
const SCENARIOS: { id: ScenarioId; name: string; hint: string }[] = [
  { id: 'floor', name: 'Piso', hint: 'só a renda segura que já paga' },
  { id: 'likely', name: 'Provável', hint: 'inclui o que está pendente, sem o que é de alto risco' },
  { id: 'optimistic', name: 'Otimista', hint: 'toda a renda que não acabou' },
];
const PLAN_MONTHS = 60;

/** Metas em sequência: quando cada uma cabe, em cada cenário, o que precisa mudar e quanto é preciso ganhar. */
export function GoalsPage() {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const [scenario, setScenario] = useState<ScenarioId>('likely');
  const [deadline, setDeadline] = useState('');
  const [editing, setEditing] = useState<GoalDto | 'new' | undefined>();
  const goals = useQuery({ queryKey: financeKeys.goals, queryFn: () => finance.goals() });
  const plan = useQuery({ queryKey: financeKeys.goalPlan, queryFn: () => finance.goalPlan({ months: PLAN_MONTHS }) });
  const required = useQuery({
    queryKey: financeKeys.requiredIncome(deadline),
    queryFn: () => finance.requiredIncome({ months: PLAN_MONTHS, ...(deadline ? { deadline } : {}) }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: financeKeys.all });
  const save = useMutation({
    mutationFn: (command: GoalCommand) =>
      editing && editing !== 'new' ? finance.replaceGoal(editing.id, command) : finance.createGoal(command),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => finance.deleteGoal(id), onSuccess: refresh });
  const reorder = useMutation({ mutationFn: (ids: string[]) => finance.reorderGoals(ids), onSuccess: refresh });
  const move = (index: number, delta: number) => {
    const ids = (goals.data ?? []).map((g) => g.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    reorder.mutate(ids);
  };
  const selected = plan.data?.scenarios.find((s) => s.id === scenario);

  return (
    <section className="page" aria-labelledby="goals-title">
      <header className="page-header">
        <h1 id="goals-title">Metas</h1>
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          Nova meta
        </button>
      </header>

      {editing && (
        <GoalForm
          key={editing === 'new' ? 'nova' : editing.id}
          {...(editing !== 'new' ? { goal: editing } : {})}
          categories={categories}
          busy={save.isPending}
          onSubmit={(command) => save.mutate(command)}
          onCancel={() => setEditing(undefined)}
        />
      )}
      {save.isError && <p className="error">Não foi possível salvar a meta.</p>}

      <QueryState
        isPending={goals.isPending || plan.isPending}
        error={goals.error ?? plan.error}
        onRetry={() => {
          void goals.refetch();
          void plan.refetch();
        }}
        isEmpty={(goals.data ?? []).length === 0}
        empty={<p className="hint">Cadastre o que você quer conquistar, na ordem em que quer realizar.</p>}
      >
        {plan.data && goals.data && (
          <>
            <p className="hint">
              Custo de vida atual (média de {plan.data.baseline.months} meses):{' '}
              <strong>{formatCents(plan.data.baseline.monthlySpending.cents)}</strong> · guardado hoje:{' '}
              <strong>{formatCents(plan.data.startingSavings.cents)}</strong> · cada meta só começa se sobrar pelo menos{' '}
              {plan.data.minSlackPercent}% da renda todo mês.
            </p>
            <Comparison goals={goals.data} plan={plan.data} />

            <div className="tabs" role="tablist" aria-label="Cenário de renda">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={scenario === s.id}
                  className={scenario === s.id ? 'active' : ''}
                  onClick={() => setScenario(s.id)}
                  title={s.hint}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <p className="hint">{SCENARIOS.find((s) => s.id === scenario)?.hint}</p>

            <RequiredIncomeCard
              goals={goals.data}
              required={required.data}
              deadline={deadline}
              onDeadline={setDeadline}
            />

            <ol className="goal-list" aria-label="Metas em ordem">
              {goals.data.map((goal, index) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  outcome={selected?.goals.find((o) => o.goalId === goal.id)}
                  categories={categories}
                  first={index === 0}
                  last={index === goals.data.length - 1}
                  onUp={() => move(index, -1)}
                  onDown={() => move(index, 1)}
                  onEdit={() => setEditing(goal)}
                  onDelete={() => window.confirm(`Excluir a meta "${goal.name}"?`) && remove.mutate(goal.id)}
                />
              ))}
            </ol>
            {selected && <PlanChart scenario={selected} />}
          </>
        )}
      </QueryState>
    </section>
  );
}

function Comparison({ goals, plan }: { goals: GoalDto[]; plan: GoalPlanDto }) {
  return (
    <article className="card">
      <h2>Quando cada meta cabe</h2>
      <div className="table-scroll">
        <table className="table">
          <caption className="visually-hidden">Mês em que cada meta começa em cada cenário de renda</caption>
          <thead>
            <tr>
              <th scope="col">Meta</th>
              {SCENARIOS.map((s) => (
                <th scope="col" key={s.id}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => (
              <tr key={goal.id}>
                <th scope="row">{goal.name}</th>
                {SCENARIOS.map((s) => {
                  const label = outcomeLabel(
                    plan.scenarios.find((x) => x.id === s.id)?.goals.find((o) => o.goalId === goal.id),
                  );
                  return (
                    <td key={s.id}>
                      <span className={`badge badge-${label.tone}`}>{label.text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RequiredIncomeCard({
  goals,
  required,
  deadline,
  onDeadline,
}: {
  goals: GoalDto[];
  required: RequiredIncomeDto | undefined;
  deadline: string;
  onDeadline: (value: string) => void;
}) {
  const last = required?.steps.at(-1);
  return (
    <article className="card stat stat-income required-income">
      <div className="card-header">
        <h2>Quanto você precisa ganhar</h2>
        <label className="inline-field">
          Realizar até
          <input
            type="month"
            value={deadline}
            onChange={(e) => onDeadline(e.target.value)}
            aria-label="Prazo para as metas"
          />
        </label>
      </div>
      <p className="hint">
        Renda mensal estável mínima para cada meta caber, somando as anteriores, sobre o seu custo de vida real
        {deadline ? ` e começando até ${formatMonth(deadline)}` : ' (em até 5 anos)'}.
      </p>
      {last?.monthlyIncome && (
        <p>
          Para realizar todas: <strong className="stat-value">{formatCents(last.monthlyIncome.cents)}/mês</strong>
        </p>
      )}
      <ul className="rank-list" aria-label="Renda necessária por meta">
        {required?.steps.map((step) => (
          <li key={step.goalId}>
            <span className="rank-title">{goals.find((g) => g.id === step.goalId)?.name ?? 'Meta'}</span>
            <span className="amount">
              {step.monthlyIncome ? `${formatCents(step.monthlyIncome.cents)}/mês` : 'fora de alcance'}
              {step.startMonth ? ` · começa em ${formatMonth(step.startMonth)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function GoalCard({
  goal,
  outcome,
  categories,
  first,
  last,
  onUp,
  onDown,
  onEdit,
  onDelete,
}: {
  goal: GoalDto;
  outcome: GoalOutcome | undefined;
  categories: CategoryDirectory;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = outcomeLabel(outcome);
  const n = goal.financing.kind === 'cash' ? 0 : goal.financing.installments;
  return (
    <li className="card goal-card">
      <div className="goal-head">
        <div>
          <strong>{goal.name}</strong>
          <span className="hint">
            {GOAL_KIND_LABEL[goal.kind]} · {FINANCING_LABEL[goal.financing.kind]}
          </span>
        </div>
        <span className={`badge badge-${label.tone}`}>{label.text}</span>
      </div>
      <p className="hint">
        Guardar {formatCents(goal.upfront.cents)} para começar
        {n > 0 ? ` · ${n}x de ${formatCents(goal.installment.cents)}` : ''} · custo total{' '}
        {formatCents(goal.totalCost.cents)}
      </p>
      {outcome && (
        <p className="hint">
          No orçamento: {monthlyEffect(outcome.monthlyCost.cents)}
          {n > 0 ? ` enquanto paga, depois ${monthlyEffect(outcome.monthlyCostAfterPayments.cents)}` : ''}
          {goal.recurringCosts.some((c) => c.replacesCategoryId)
            ? ` (no lugar de ${goal.recurringCosts
                .flatMap((c) => (c.replacesCategoryId ? [categories.name(c.replacesCategoryId)] : []))
                .join(', ')})`
            : ''}
        </p>
      )}
      {outcome?.status !== 'blocked' &&
        outcome?.alerts.map((a) => (
          <p key={a} className="notice">
            {ALERT_LABEL[a]}
          </p>
        ))}
      {outcome && outcome.status === 'not_feasible' && outcome.monthlyGap && (
        <div className="levers">
          <p>
            Faltam <strong>{formatCents(outcome.monthlyGap.cents)}/mês</strong> para caber neste cenário. Caminhos:
          </p>
          <ul>
            {outcome.levers.map((l) => (
              <li key={l.kind === 'cut' ? l.categoryId : 'renda'}>
                {l.kind === 'extra_income'
                  ? `ganhar ${formatCents(l.amount.cents)} a mais por mês`
                  : `gastar ${formatCents(l.amount.cents)} a menos em ${categories.name(l.categoryId)}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="row goal-actions">
        <button type="button" onClick={onUp} disabled={first} aria-label={`Antecipar ${goal.name}`}>
          ↑
        </button>
        <button type="button" onClick={onDown} disabled={last} aria-label={`Adiar ${goal.name}`}>
          ↓
        </button>
        <button type="button" className="link" onClick={onEdit}>
          Editar
        </button>
        <button type="button" className="link" onClick={onDelete}>
          Excluir
        </button>
      </div>
    </li>
  );
}

function PlanChart({ scenario }: { scenario: GoalPlanDto['scenarios'][number] }) {
  const { palette } = useChartTheme();
  const t = scenario.timeline;
  return (
    <article className="card chart-card wide">
      <h2>O plano mês a mês ({scenario.name})</h2>
      <p className="hint">Renda do cenário × gasto com as metas, e quanto fica guardado</p>
      <div className="chart" role="img" aria-label={`Gráfico do plano no cenário ${scenario.name}`}>
        <LineChart
          data={{
            labels: monthLabels(t.map((m) => m.month)),
            datasets: [
              dataset.line(
                palette,
                'Renda',
                t.map((m) => m.income.cents),
                'income',
              ),
              dataset.area(
                palette,
                'Gasto com as metas',
                t.map((m) => m.spending.cents),
                'expense',
              ),
              {
                ...dataset.line(
                  palette,
                  'Guardado (eixo da direita)',
                  t.map((m) => m.savings.cents),
                  'goal',
                  { dashed: true },
                ),
                yAxisID: 'savings',
              },
            ],
          }}
          options={{
            scales: {
              x: categoryAxis,
              y: moneyAxis,
              // Guardado tem escala própria: pode crescer (ou ficar negativo) muito mais que renda e gasto.
              savings: { ...moneyAxis, position: 'right', beginAtZero: false, grid: { display: false } },
            },
          }}
        />
      </div>
    </article>
  );
}
