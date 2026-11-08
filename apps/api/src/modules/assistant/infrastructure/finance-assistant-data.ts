import { LocalDate } from '../../../shared/kernel/local-date.js';
import { Money } from '../../../shared/kernel/money.js';
import { YearMonth } from '../../../shared/kernel/year-month.js';
import type { AccountRepository } from '../../ledger/application/ports/account-repository.js';
import type { CategoryRepository } from '../../ledger/application/ports/category-repository.js';
import type { TransactionQueries } from '../../ledger/application/ports/transaction-queries.js';
import type { GetInstallmentPurchases } from '../../ledger/application/use-cases/ledger-commands.js';
import type { GetMonthlyReport } from '../../ledger/application/use-cases/monthly-report.js';
import type { GoalRepository } from '../../planning/application/ports/goal-ports.js';
import type { IncomeSourceRepository } from '../../planning/application/ports/income-ports.js';
import type { GetGoalPlan, GetRequiredIncome } from '../../planning/application/use-cases/goals.js';
import type { GetIncomeOverview } from '../../planning/application/use-cases/income.js';
import { AssistantData, type Json, type TransactionQuery } from '../application/assistant-data.js';

const reais = (m: Money | undefined): number => (m ? m.cents / 100 : 0);
const positive = (m: Money): number => Math.abs(m.cents) / 100;
const MIN_SLACK_PERCENT = 10;
const PLAN_MONTHS = 60;

const TYPE: Record<string, string> = {
  income: 'entrada',
  expense: 'gasto',
  internal_transfer: 'entre_contas',
  ignored: 'ignorada',
};
const CLASSIFICATION: Record<
  NonNullable<TransactionQuery['tipo']>,
  'income' | 'expense' | 'internal_transfer' | 'ignored'
> = { gasto: 'expense', entrada: 'income', entre_contas: 'internal_transfer', ignorada: 'ignored' };
const SCENARIO: Record<string, string> = { floor: 'piso', likely: 'provavel', optimistic: 'otimista' };

export interface FinanceAssistantDeps {
  readonly report: GetMonthlyReport;
  readonly categories: CategoryRepository;
  readonly accounts: AccountRepository;
  readonly transactions: TransactionQueries;
  readonly installments: GetInstallmentPurchases;
  readonly incomeOverview: GetIncomeOverview;
  readonly incomeSources: IncomeSourceRepository;
  readonly goals: GoalRepository;
  readonly plan: GetGoalPlan;
  readonly requiredIncome: GetRequiredIncome;
}

/** Monta as respostas do assistente a partir dos casos de uso do ledger e do planejamento. */
export class FinanceAssistantData extends AssistantData {
  constructor(private readonly deps: FinanceAssistantDeps) {
    super();
  }

  private async names() {
    const [categories, accounts] = await Promise.all([this.deps.categories.findAll(), this.deps.accounts.findAll()]);
    const byId = new Map(categories.map((c) => [c.id, c]));
    const category = (id: string | null | undefined): string => {
      if (!id) return 'Sem categoria';
      const c = byId.get(id);
      if (!c) return id;
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      return parent ? `${parent.name} › ${c.name}` : c.name;
    };
    const accountNames = new Map(accounts.map((a) => [a.id, a.displayName]));
    return { category, account: (id: string) => accountNames.get(id) ?? 'Conta' };
  }

  async monthSummary(month?: string): Promise<Json> {
    const [r, n] = await Promise.all([this.deps.report.execute(month), this.names()]);
    const flow = r.cashFlow.find((m) => m.month === r.month);
    const previous = r.cashFlow.filter((m) => m.month < r.month).slice(-3);
    const avg = (pick: (m: (typeof previous)[number]) => Money) =>
      previous.length ? Math.round(previous.reduce((s, m) => s + pick(m).cents, 0) / previous.length) / 100 : null;
    const next = YearMonth.parse(r.month).addMonths(1).toString();
    return {
      mes: r.month,
      entrou: reais(flow?.income),
      saiu: reais(flow?.spending),
      sobrou: reais(flow?.net),
      media_3_meses_anteriores: { entrou: avg((m) => m.income), saiu: avg((m) => m.spending) },
      maiores_categorias: r.categories
        .filter((c) => c.spent.cents > 0)
        .slice(0, 8)
        .map((c) => ({
          categoria: n.category(c.categoryId),
          gasto: reais(c.spent),
          media_anterior: reais(c.previousAverage),
          variacao_percentual: c.changePercent,
        })),
      fontes_de_renda: r.incomeSources.map((s) => ({
        fonte:
          s.label ?? [n.category(s.categoryId), s.accountId ? n.account(s.accountId) : ''].filter(Boolean).join(' · '),
        valor: reais(s.total),
        vezes: s.count,
      })),
      ja_comprometido_no_mes_seguinte: positive(
        r.commitments.find((c) => c.month === next)?.total ?? r.commitments[0]?.total ?? Money.zero(),
      ),
    };
  }

  async spendingByCategory(month: string | undefined, level: 'grupo' | 'categoria'): Promise<Json> {
    const [r, n] = await Promise.all([this.deps.report.execute(month), this.names()]);
    if (level === 'categoria') {
      return {
        mes: r.month,
        categorias: r.categories.map((c) => ({
          categoria: n.category(c.categoryId),
          id: c.categoryId,
          gasto: reais(c.spent),
          transacoes: c.count,
          media_anterior: reais(c.previousAverage),
          variacao_percentual: c.changePercent,
        })),
      };
    }
    const groups = new Map<string, { gasto: number; media: number; transacoes: number }>();
    for (const c of r.categories) {
      const key = c.groupId ?? 'sem-categoria';
      const g = groups.get(key) ?? { gasto: 0, media: 0, transacoes: 0 };
      g.gasto += c.spent.cents;
      g.media += c.previousAverage.cents;
      g.transacoes += c.count;
      groups.set(key, g);
    }
    return {
      mes: r.month,
      grupos: [...groups]
        .sort((a, b) => b[1].gasto - a[1].gasto)
        .map(([id, g]) => ({
          grupo: id === 'sem-categoria' ? 'Sem categoria' : n.category(id),
          id,
          gasto: g.gasto / 100,
          transacoes: g.transacoes,
          media_anterior: g.media / 100,
        })),
    };
  }

  async transactions(query: TransactionQuery): Promise<Json> {
    const n = await this.names();
    const page = await this.deps.transactions.search(
      {
        ...(query.de ? { from: LocalDate.parse(query.de) } : {}),
        ...(query.ate ? { to: LocalDate.parse(query.ate) } : {}),
        ...(query.categoria ? { categoryId: query.categoria } : {}),
        ...(query.tipo ? { classification: CLASSIFICATION[query.tipo] } : {}),
        ...(query.busca ? { text: query.busca } : {}),
      },
      { limit: query.limite },
    );
    return {
      transacoes: page.items.map((t) => ({
        data: t.occurredOn.toString(),
        descricao: t.description,
        ...(t.counterparty?.name ? { contraparte: t.counterparty.name } : {}),
        valor: reais(t.amount),
        categoria: n.category(t.category?.categoryId),
        tipo: TYPE[t.classification] ?? t.classification,
        forma: t.paymentMethod,
        conta: n.account(t.accountId),
        ...(t.installment ? { parcela: `${t.installment.number}/${t.installment.total}` } : {}),
      })),
      tem_mais: Boolean(page.next),
    };
  }

  async commitments(): Promise<Json> {
    const [purchases, r, n] = await Promise.all([
      this.deps.installments.execute(),
      this.deps.report.execute(),
      this.names(),
    ]);
    return {
      compras_parceladas: purchases
        .filter((p) => p.remainingCount > 0)
        .map((p) => {
          const remaining = p.projectRemaining();
          return {
            loja: p.merchant,
            conta: n.account(p.accountId),
            parcelas: p.total,
            faltam: p.remainingCount,
            valor_da_parcela: remaining[0] ? positive(remaining[0].amount) : null,
            ainda_falta_pagar: remaining.reduce((s, i) => s + Math.abs(i.amount.cents), 0) / 100,
            termina_em: remaining.at(-1)?.expectedMonth ?? null,
          };
        }),
      comprometido_por_mes: r.commitments.map((c) => ({
        mes: c.month,
        parcelas: positive(c.installments),
        recorrencias: positive(c.recurring),
        total: positive(c.total),
      })),
    };
  }

  async recurring(): Promise<Json> {
    const [r, n] = await Promise.all([this.deps.report.execute(), this.names()]);
    return {
      recorrencias: r.recurring.map((x) => ({
        nome: x.label,
        valor_tipico: positive(x.typicalAmount),
        a_cada_dias: x.intervalDays,
        proxima_em: x.nextExpectedOn.toString(),
        custo_anual: positive(x.annualCost),
        categoria: n.category(x.categoryId),
      })),
    };
  }

  async income(months: number): Promise<Json> {
    const [overview, sources] = await Promise.all([
      this.deps.incomeOverview.execute({ months }),
      this.deps.incomeSources.findAll(),
    ]);
    const name = (id: string) => sources.find((s) => s.id === id)?.name ?? 'Fonte';
    return {
      fontes: sources.map((s) => ({
        nome: s.name,
        tipo: s.props.kind,
        valor_mensal: reais(s.expectedMonthly),
        inicio: s.props.startsOn.toString(),
        fim: s.props.endsOn?.toString() ?? null,
        risco: s.risk,
        situacao: s.status,
      })),
      mes_corrente: {
        mes: overview.month.toString(),
        por_fonte: overview.tracking.sources.map((t) => ({
          fonte: name(t.sourceId),
          esperado: reais(t.expected),
          entrou: reais(t.observed),
          situacao: t.status,
        })),
        renda_sem_fonte: reais(overview.tracking.unrecognized),
      },
      projecao: overview.projection.scenarios.map((s) => ({
        cenario: SCENARIO[s.id] ?? s.id,
        meses: overview.projection.months.map((m, i) => ({ mes: m.toString(), renda: reais(s.totals[i]) })),
      })),
    };
  }

  async goals(deadline?: string): Promise<Json> {
    const [goals, plan, required, n] = await Promise.all([
      this.deps.goals.findAll(),
      this.deps.plan.execute({ months: PLAN_MONTHS, minSlackPercent: MIN_SLACK_PERCENT }),
      this.deps.requiredIncome.execute({
        months: PLAN_MONTHS,
        minSlackPercent: MIN_SLACK_PERCENT,
        ...(deadline ? { deadline: YearMonth.parse(deadline) } : {}),
      }),
      this.names(),
    ]);
    return {
      custo_de_vida_atual: reais(plan.baseline.monthlySpending),
      guardado_hoje: reais(plan.startingSavings),
      folga_minima_percentual: MIN_SLACK_PERCENT,
      metas: goals.map((g, index) => ({
        ordem: index + 1,
        nome: g.name,
        tipo: g.props.kind,
        guardar_para_comecar: reais(g.upfront()),
        parcelas: g.installments(),
        valor_da_parcela: reais(g.installment()),
        custo_total: reais(g.totalCost()),
        substitui: g.replacedCategories().map((c) => n.category(c)),
        por_cenario: Object.fromEntries(
          plan.scenarios.map((s) => {
            const o = s.goals.find((x) => x.goalId === g.id);
            return [
              SCENARIO[s.id] ?? s.id,
              o
                ? {
                    situacao:
                      o.status === 'scheduled' ? 'cabe' : o.status === 'blocked' ? 'espera_a_anterior' : 'nao_cabe',
                    comeca_em: o.startMonth?.toString() ?? null,
                    efeito_mensal_enquanto_paga: reais(o.monthlyCost),
                    efeito_mensal_depois: reais(o.monthlyCostAfterPayments),
                    alertas: o.alerts,
                    falta_por_mes: o.monthlyGap ? reais(o.monthlyGap) : null,
                    alavancas: o.levers.map((l) =>
                      l.kind === 'cut'
                        ? { cortar_em: n.category(l.categoryId), valor: reais(l.amount) }
                        : { renda_extra: reais(l.amount) },
                    ),
                  }
                : null,
            ];
          }),
        ),
      })),
      renda_alvo: {
        prazo: deadline ?? null,
        por_meta: required.steps.map((step) => ({
          meta: goals.find((g) => g.id === step.goalId)?.name ?? step.goalId,
          renda_mensal_estavel: step.monthlyIncome ? reais(step.monthlyIncome) : null,
          comeca_em: step.startMonth?.toString() ?? null,
        })),
      },
    };
  }
}
