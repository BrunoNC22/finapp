import type { InstallmentPurchaseDto, MonthlyReportDto } from '@finapp/contracts';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { BarChart, categoryAxis, dataset, moneyAxis, monthLabels, useChartTheme } from '../../lib/charts';
import { formatCents, formatDate, formatMonth } from '../../lib/format';
import { currentMonth } from '../../lib/months';
import { QueryState } from '../shared/QueryState';
import { financeKeys, useAccountNames } from '../shared/queries';
import { installmentProgress, summarizeInstallments } from './installment-summary';

/** Compras parceladas em andamento e quanto das próximas faturas já está comprometido. */
export function InstallmentsPage() {
  const { finance } = useServices();
  const month = currentMonth();
  const purchases = useQuery({ queryKey: financeKeys.installments, queryFn: () => finance.installments() });
  const report = useQuery({ queryKey: financeKeys.report(month), queryFn: () => finance.monthlyReport(month) });
  const accountName = useAccountNames();
  const active = (purchases.data ?? []).filter((p) => p.remainingCount > 0);
  const summary = summarizeInstallments(active);

  return (
    <section className="page" aria-labelledby="installments-title">
      <header className="page-header">
        <h1 id="installments-title">Parcelas</h1>
      </header>
      <QueryState
        isPending={purchases.isPending}
        error={purchases.error}
        onRetry={() => void purchases.refetch()}
        isEmpty={active.length === 0}
        empty={<p className="hint">Nenhuma compra parcelada em andamento.</p>}
      >
        <div className="stats">
          <article className="card stat stat-committed">
            <span className="stat-label">Compras em andamento</span>
            <strong className="stat-value">{active.length}</strong>
          </article>
          <article className="card stat stat-expense">
            <span className="stat-label">Ainda falta pagar</span>
            <strong className="stat-value">{formatCents(summary.remainingCents)}</strong>
            <span className="hint">{summary.remainingInstallments} parcelas</span>
          </article>
          {summary.lastMonth && (
            <article className="card stat stat-income">
              <span className="stat-label">Livre de parcelas em</span>
              <strong className="stat-value">{formatMonth(summary.lastMonth)}</strong>
              <span className="hint">se não fizer novas compras parceladas</span>
            </article>
          )}
        </div>

        {report.data && <CommitmentsChart report={report.data} />}

        <ul className="installment-list" aria-label="Compras parceladas">
          {active.map((p) => (
            <Purchase
              key={`${p.accountId}-${p.merchant}-${p.firstInstallmentMonth}`}
              purchase={p}
              accountName={accountName(p.accountId)}
            />
          ))}
        </ul>
      </QueryState>
    </section>
  );
}

function CommitmentsChart({ report }: { report: MonthlyReportDto }) {
  const { palette } = useChartTheme();
  const months = report.commitments.map((c) => c.month);
  return (
    <article className="card chart-card wide">
      <h2>Comprometido nos próximos meses</h2>
      <p className="hint">Parcelas já assumidas + recorrências (assinaturas, contas) previstas</p>
      <div className="chart" role="img" aria-label="Gráfico de barras: valor comprometido por mês">
        <BarChart
          data={{
            labels: monthLabels(months),
            datasets: [
              {
                ...dataset.bar(
                  palette,
                  'Parcelas',
                  report.commitments.map((c) => Math.abs(c.installments.cents)),
                  'committed',
                ),
                stack: 'total',
              },
              {
                ...dataset.bar(
                  palette,
                  'Recorrências',
                  report.commitments.map((c) => Math.abs(c.recurring.cents)),
                  'goal',
                ),
                stack: 'total',
              },
            ],
          }}
          options={{ scales: { x: { ...categoryAxis, stacked: true }, y: { ...moneyAxis, stacked: true } } }}
        />
      </div>
    </article>
  );
}

function Purchase({ purchase: p, accountName }: { purchase: InstallmentPurchaseDto; accountName: string }) {
  const progress = installmentProgress(p);
  return (
    <li className="card installment">
      <div className="installment-head">
        <div>
          <strong>{p.merchant}</strong>
          <span className="hint">
            {accountName}
            {p.purchaseDate ? ` · comprado em ${formatDate(p.purchaseDate)}` : ''}
          </span>
        </div>
        <div className="installment-amount">
          <strong>{formatCents(progress.installmentCents)}</strong>
          <span className="hint">por mês</span>
        </div>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label={`${p.merchant}: ${progress.paid} de ${p.total} parcelas pagas`}
        aria-valuemin={0}
        aria-valuemax={p.total}
        aria-valuenow={progress.paid}
      >
        <span style={{ width: `${(progress.paid / p.total) * 100}%` }} />
      </div>
      <div className="installment-foot hint">
        <span>
          {progress.paid}/{p.total} pagas · faltam {formatCents(progress.remainingCents)}
        </span>
        <span>
          total {formatCents(Math.abs(p.totalAmount.cents))}
          {p.totalAmountIsEstimated ? ' (estimado)' : ''}
          {progress.lastMonth ? ` · termina em ${formatMonth(progress.lastMonth)}` : ''}
        </span>
      </div>
    </li>
  );
}
