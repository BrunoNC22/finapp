import {
  BarChart,
  categoryColor,
  DoughnutChart,
  LineChart,
  moneyAxis,
  monthLabels,
  useChartTheme,
} from '../../lib/charts';
import { type ThemePreference, theme } from '../../lib/theme';

// Dados FICTÍCIOS, só para revisar o visual (rota disponível apenas em desenvolvimento).
const months = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
];
const income = [270000, 270000, 255000, 270000, 300000, 270000, 270000, 285000, 270000, 270000, 290000, 270000];
const spending = [240000, 310000, 230000, 260000, 280000, 250000, 300000, 265000, 240000, 295000, 275000, 120000];
const categories = [
  ['transporte.app', 'Transporte por app', 62000],
  ['alimentacao.mercado', 'Mercado', 48000],
  ['moradia.aluguel', 'Aluguel', 65000],
  ['alimentacao.delivery', 'Delivery', 21000],
  ['assinaturas.streaming', 'Streaming', 3990],
  [null, 'Sem categoria', 8000],
] as const;

/** Página interna para revisar TODOS os tipos de gráfico nos dois temas (#18). */
export function ChartsPreview() {
  const { palette } = useChartTheme();
  const set = (t: ThemePreference) => theme.set(t);
  return (
    <section className="page">
      <h1>Pré-visualização dos gráficos</h1>
      <div className="row">
        {(['light', 'dark', 'system'] as const).map((t) => (
          <button key={t} type="button" onClick={() => set(t)}>
            {t === 'light' ? 'Claro' : t === 'dark' ? 'Escuro' : 'Sistema'}
          </button>
        ))}
      </div>

      <article className="card chart-card">
        <h2>Renda × gasto (barras)</h2>
        <div className="chart">
          <BarChart
            data={{
              labels: monthLabels(months),
              datasets: [
                { label: 'Renda', data: income, backgroundColor: palette.income },
                { label: 'Gasto', data: spending, backgroundColor: palette.expense },
              ],
            }}
            options={{ scales: { y: moneyAxis } }}
          />
        </div>
      </article>

      <article className="card chart-card">
        <h2>Gasto por categoria (rosca)</h2>
        <div className="chart">
          <DoughnutChart
            data={{
              labels: categories.map(([, name]) => name),
              datasets: [
                {
                  label: 'Gasto',
                  data: categories.map(([, , v]) => v),
                  backgroundColor: categories.map(([id]) => categoryColor(id, palette)),
                },
              ],
            }}
            options={{ cutout: '62%', plugins: { legend: { position: 'right' } } }}
          />
        </div>
      </article>

      <article className="card chart-card">
        <h2>Compromissos futuros (linha)</h2>
        <div className="chart">
          <LineChart
            data={{
              labels: monthLabels(months),
              datasets: [
                {
                  label: 'Comprometido',
                  data: spending.map((v) => Math.round(v * 0.4)),
                  borderColor: palette.committed,
                  backgroundColor: palette.committed,
                  fill: false,
                },
                {
                  label: 'Meta',
                  data: months.map(() => 90000),
                  borderColor: palette.goal,
                  borderDash: [6, 4],
                  pointRadius: 0,
                },
              ],
            }}
            options={{ scales: { y: moneyAxis } }}
          />
        </div>
      </article>
    </section>
  );
}
