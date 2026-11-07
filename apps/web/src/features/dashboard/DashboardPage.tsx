import type { MonthlyReportDto } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useServices } from '../../app/services';
import type { CategoryDirectory } from '../../lib/categories';
import {
  BarChart,
  categoryAxis,
  categoryColors,
  DoughnutChart,
  dataset,
  moneyAxis,
  monthLabels,
  useChartTheme,
} from '../../lib/charts';
import { formatCents, formatDate, formatMonth } from '../../lib/format';
import { addMonths, currentMonth, formatMonthLong, isMonth, type Month } from '../../lib/months';
import { Amount } from '../shared/Amount';
import { MonthPicker } from '../shared/MonthPicker';
import { QueryState } from '../shared/QueryState';
import { financeKeys, useCategories } from '../shared/queries';
import { paymentBadge } from '../transactions/transaction-labels';
import { spendingByGroup, spendingHighlights } from './highlights';

/** Painel do mês: quanto entrou, quanto saiu, para onde foi e o que já está comprometido. */
export function DashboardPage() {
  const { finance } = useServices();
  const [params, setParams] = useSearchParams();
  const latest = currentMonth();
  const requested = params.get('mes');
  const month: Month = isMonth(requested) && requested <= latest ? requested : latest;
  const report = useQuery({ queryKey: financeKeys.report(month), queryFn: () => finance.monthlyReport(month) });
  const categories = useCategories();

  return (
    <section className="page" aria-labelledby="dashboard-title">
      <header className="page-header">
        <h1 id="dashboard-title">Painel</h1>
        <MonthPicker month={month} latest={latest} onChange={(m) => setParams({ mes: m })} />
      </header>
      <QueryState isPending={report.isPending} error={report.error} onRetry={() => void report.refetch()} skeletons={4}>
        {report.data && <Dashboard report={report.data} categories={categories} month={month} />}
      </QueryState>
    </section>
  );
}

function Dashboard({
  report,
  categories,
  month,
}: {
  report: MonthlyReportDto;
  categories: CategoryDirectory;
  month: Month;
}) {
  const flow = report.cashFlow.find((m) => m.month === month);
  const next = addMonths(month, 1);
  const committed = report.commitments.find((c) => c.month === next);
  const highlights = spendingHighlights(report, categories, { monthInProgress: month === currentMonth() });
  const hasData = report.cashFlow.some((m) => m.income.cents !== 0 || m.spending.cents !== 0);

  if (!hasData) {
    return (
      <div className="card state-empty">
        <p>Ainda não há transações. Conecte suas contas e sincronize em Contas.</p>
        <Link to="/contas">Ir para Contas</Link>
      </div>
    );
  }

  return (
    <>
      <div className="stats">
        <Stat label="Entrou" cents={flow?.income.cents ?? 0} tone="income" />
        <Stat label="Saiu" cents={Math.abs(flow?.spending.cents ?? 0)} tone="expense" />
        <Stat label="Sobrou" cents={flow?.net.cents ?? 0} tone={(flow?.net.cents ?? 0) >= 0 ? 'income' : 'expense'} />
        <Stat
          label={`Já comprometido em ${formatMonth(next)}`}
          cents={Math.abs(committed?.total.cents ?? 0)}
          tone="committed"
          hint="Parcelas e recorrências previstas"
        />
      </div>

      {highlights.length > 0 && (
        <ul className="highlights" aria-label="Destaques do mês">
          {highlights.map((h) => (
            <li key={h.categoryId} className={`highlight highlight-${h.tone}`}>
              <Link to={`/transacoes?periodo=${month}&categoria=${encodeURIComponent(h.categoryId)}`}>{h.text}</Link>
            </li>
          ))}
        </ul>
      )}

      <div className="chart-grid">
        <CashFlowChart report={report} />
        <CategoryChart report={report} categories={categories} month={month} />
        <TopExpenses report={report} categories={categories} month={month} />
        <Recurring report={report} />
      </div>
    </>
  );
}

function Stat({
  label,
  cents,
  tone,
  hint,
}: {
  label: string;
  cents: number;
  tone: 'income' | 'expense' | 'committed';
  hint?: string;
}) {
  return (
    <article className={`card stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{formatCents(cents)}</strong>
      {hint && <span className="hint">{hint}</span>}
    </article>
  );
}

function CashFlowChart({ report }: { report: MonthlyReportDto }) {
  const { palette } = useChartTheme();
  const months = report.cashFlow.map((m) => m.month);
  return (
    <article className="card chart-card wide">
      <h2>Entrou × saiu</h2>
      <p className="hint">Últimos {months.length} meses, sem contar transferências entre suas contas</p>
      <div className="chart" role="img" aria-label="Gráfico de barras: entradas e gastos por mês">
        <BarChart
          data={{
            labels: monthLabels(months),
            datasets: [
              dataset.bar(
                palette,
                'Entrou',
                report.cashFlow.map((m) => m.income.cents),
                'income',
              ),
              dataset.bar(
                palette,
                'Saiu',
                report.cashFlow.map((m) => Math.abs(m.spending.cents)),
                'expense',
              ),
            ],
          }}
          options={{ scales: { x: categoryAxis, y: moneyAxis } }}
        />
      </div>
    </article>
  );
}

function CategoryChart({
  report,
  categories,
  month,
}: {
  report: MonthlyReportDto;
  categories: CategoryDirectory;
  month: Month;
}) {
  const { palette } = useChartTheme();
  const slices = spendingByGroup(report, categories);
  if (slices.length === 0) return null;
  return (
    <article className="card chart-card">
      <h2>Para onde foi o dinheiro</h2>
      <p className="hint">Gasto por grupo em {formatMonthLong(month)}</p>
      <div className="chart" role="img" aria-label="Gráfico de rosca: gasto por grupo de categoria">
        <DoughnutChart
          data={{
            labels: slices.map((s) => s.label),
            datasets: [
              dataset.doughnut(
                'Gasto',
                slices.map((s) => s.cents),
                categoryColors(
                  slices.map((s) => s.groupId),
                  palette,
                ),
              ),
            ],
          }}
          options={{ cutout: '68%', plugins: { legend: { position: 'right' }, finappCenterText: { label: 'Total' } } }}
        />
      </div>
    </article>
  );
}

function TopExpenses({
  report,
  categories,
  month,
}: {
  report: MonthlyReportDto;
  categories: CategoryDirectory;
  month: Month;
}) {
  const top = report.topExpenses.slice(0, 5);
  return (
    <article className="card chart-card">
      <h2>Maiores gastos</h2>
      <p className="hint">Os 5 maiores de {formatMonthLong(month)}</p>
      {top.length === 0 ? (
        <p className="hint">Nenhum gasto no mês.</p>
      ) : (
        <ol className="rank-list">
          {top.map((t) => (
            <li key={t.id}>
              <div className="rank-main">
                <span className="rank-title">{t.description}</span>
                <span className="hint">
                  {formatDate(t.occurredOn)} · {categories.path(t.category?.id)} · <Badge transaction={t} />
                </span>
              </div>
              <Amount cents={t.amount.cents} classification={t.classification} />
            </li>
          ))}
        </ol>
      )}
      <Link to={`/transacoes?periodo=${month}&tipo=expense`} className="card-link">
        Ver todos os gastos
      </Link>
    </article>
  );
}

function Badge({ transaction }: { transaction: MonthlyReportDto['topExpenses'][number] }) {
  const badge = paymentBadge(transaction);
  return badge ? <span className={`badge badge-${badge.tone}`}>{badge.label}</span> : null;
}

function Recurring({ report }: { report: MonthlyReportDto }) {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: (key: string) => finance.dismissRecurring(key),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  });
  const monthly = report.recurring.reduce((sum, r) => sum + Math.abs(r.annualCost.cents), 0) / 12;
  return (
    <article className="card chart-card">
      <h2>Recorrências</h2>
      <p className="hint">
        Assinaturas e contas que se repetem
        {report.recurring.length > 0 && <> · cerca de {formatCents(Math.round(monthly))} por mês</>}
      </p>
      {report.recurring.length === 0 ? (
        <p className="hint">Nenhuma recorrência detectada ainda.</p>
      ) : (
        <ul className="rank-list">
          {report.recurring.map((r) => (
            <li key={r.key}>
              <div className="rank-main">
                <span className="rank-title">{r.label}</span>
                <span className="hint">
                  a cada {r.intervalDays} dias · próxima em {formatDate(r.nextExpectedOn)}
                </span>
              </div>
              <div className="rank-side">
                <strong className="amount">{formatCents(Math.abs(r.typicalAmount.cents))}</strong>
                <button
                  type="button"
                  className="link"
                  onClick={() => dismiss.mutate(r.key)}
                  disabled={dismiss.isPending}
                  aria-label={`${r.label} não é recorrente`}
                >
                  Não é recorrente
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
