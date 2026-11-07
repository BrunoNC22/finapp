import { useEffect } from 'react';
import {
  BarChart,
  categoryAxis,
  categoryColors,
  DoughnutChart,
  dataset,
  LineChart,
  moneyAxis,
  monthLabels,
  previewHover,
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
const spending = [240000, 310000, 230000, 260000, 280000, 250000, 300000, 265000, 240000, 295000, 275000, 160000];
const balance = income.map(
  (_, i) =>
    income.slice(0, i + 1).reduce((a, b) => a + b, 0) - spending.slice(0, i + 1).reduce((a, b) => a + b, 0) + 40000,
);
const categories = [
  ['moradia.aluguel', 'Aluguel', 65000],
  ['transporte.app', 'Transporte por app', 62000],
  ['alimentacao.mercado', 'Mercado', 48000],
  ['lazer.outros', 'Lazer', 26000],
  ['assinaturas.streaming', 'Assinaturas', 12990],
  ['saude.farmacia', 'Farmácia', 9000],
  [null, 'Sem categoria', 8000],
] as const;

/** Página interna para revisar TODOS os tipos de gráfico nos dois temas (#18). Aceita ?theme=dark|light. */
export function ChartsPreview() {
  const { palette } = useChartTheme();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('theme');
    if (requested === 'dark' || requested === 'light') theme.set(requested);
    // ?hover=N: ativa o hover no item N depois das animações de entrada (revisão visual).
    const hover = new URLSearchParams(window.location.search).get('hover');
    if (hover !== null) setTimeout(() => previewHover(Number(hover) || 3), 2500);
  }, []);
  const set = (t: ThemePreference) => theme.set(t);
  const colors = categoryColors(
    categories.map(([id]) => id),
    palette,
  );

  return (
    <main className="content preview">
      <header className="preview-header">
        <div>
          <h1>Gráficos do finapp</h1>
          <p className="hint">Pré-visualização com dados fictícios. Passe o mouse sobre os gráficos.</p>
        </div>
        <div className="row">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button key={t} type="button" onClick={() => set(t)}>
              {t === 'light' ? 'Claro' : t === 'dark' ? 'Escuro' : 'Sistema'}
            </button>
          ))}
        </div>
      </header>

      <div className="chart-grid">
        <article className="card chart-card wide">
          <h2>Renda × gasto</h2>
          <p className="hint">Últimos 12 meses</p>
          <div className="chart">
            <BarChart
              data={{
                labels: monthLabels(months),
                datasets: [
                  dataset.bar(palette, 'Renda', income, 'income'),
                  dataset.bar(palette, 'Gasto', spending, 'expense'),
                ],
              }}
              options={{ scales: { x: categoryAxis, y: moneyAxis } }}
            />
          </div>
        </article>

        <article className="card chart-card">
          <h2>Gasto por categoria</h2>
          <p className="hint">Outubro</p>
          <div className="chart">
            <DoughnutChart
              data={{
                labels: categories.map(([, name]) => name),
                datasets: [
                  dataset.doughnut(
                    'Gasto',
                    categories.map(([, , v]) => v),
                    colors,
                  ),
                ],
              }}
              options={{
                cutout: '68%',
                plugins: { legend: { position: 'right' }, finappCenterText: { label: 'Total do mês' } },
              }}
            />
          </div>
        </article>

        <article className="card chart-card">
          <h2>Maiores gastos</h2>
          <p className="hint">Por categoria, em outubro</p>
          <div className="chart">
            <BarChart
              data={{
                labels: categories.map(([, name]) => name),
                datasets: [
                  dataset.ranking(
                    'Gasto',
                    categories.map(([, , v]) => v),
                    colors,
                  ),
                ],
              }}
              options={{
                indexAxis: 'y',
                interaction: { mode: 'nearest', axis: 'y', intersect: false },
                layout: { padding: { right: 56 } },
                plugins: { legend: { display: false }, finappValueLabels: true },
                scales: { x: { display: false, beginAtZero: true }, y: categoryAxis },
              }}
            />
          </div>
        </article>

        <article className="card chart-card">
          <h2>Saldo acumulado</h2>
          <p className="hint">Quanto sobrou ao longo do ano</p>
          <div className="chart">
            <LineChart
              data={{ labels: monthLabels(months), datasets: [dataset.area(palette, 'Saldo', balance, 'income')] }}
              options={{ plugins: { legend: { display: false } }, scales: { x: categoryAxis, y: moneyAxis } }}
            />
          </div>
        </article>

        <article className="card chart-card">
          <h2>Compromissos × meta</h2>
          <p className="hint">Parcelas e recorrências nos próximos meses</p>
          <div className="chart">
            <LineChart
              data={{
                labels: monthLabels(months),
                datasets: [
                  dataset.area(
                    palette,
                    'Comprometido',
                    spending.map((v) => Math.round(v * 0.42)),
                    'committed',
                  ),
                  dataset.line(
                    palette,
                    'Limite saudável',
                    months.map(() => 110000),
                    'goal',
                    { dashed: true },
                  ),
                ],
              }}
              options={{ scales: { x: categoryAxis, y: moneyAxis } }}
            />
          </div>
        </article>
      </div>
    </main>
  );
}
