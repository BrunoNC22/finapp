# 0007. Usar Chart.js com toda a configuração centralizada num arquivo

- Status: Aceito
- Data: 2026-11-07

## Contexto
O app é visual: gastos por categoria, evolução mensal, parcelas futuras, progresso de metas. Os
gráficos precisam ter aparência consistente, suportar tema claro e escuro e formatar moeda sempre do mesmo jeito.

## Decisão
- Chart.js v4 com o wrapper `react-chartjs-2`.
- **Um único arquivo**, `apps/web/src/lib/charts/chart-config.ts`, registra os componentes usados
  (tree-shaking) e define paletas por tema, fontes, legendas, tooltips e formatação de moeda via
  `Chart.defaults`. Ele expõe `applyChartTheme(mode)`.
- Os componentes de gráfico são importados de `@/lib/charts`, que garante a aplicação desse
  arquivo. Telas não definem cores nem formatação próprias.

## Consequências
- Mudar o visual de todos os gráficos é editar um arquivo.
- Exceções de estilo por gráfico precisam de justificativa e ficam documentadas no próprio arquivo de configuração.
