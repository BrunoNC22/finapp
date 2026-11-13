import type { FinancingDto, GoalCommand, GoalDto } from '@finapp/contracts';
import { type FormEvent, useState } from 'react';
import type { CategoryDirectory } from '../../lib/categories';
import { formatCents } from '../../lib/format';
import { centsToInput, parsePercent, parseReais } from '../../lib/money-input';
import { goalCost } from './goal-cost';
import { ASSET_CATEGORY_LABEL, FINANCING_LABEL, GOAL_KIND_LABEL } from './goal-labels';

interface CostRow {
  readonly key: number;
  name: string;
  amount: string;
  replaces: string;
}

/** Bem vendido na largada: `source` é o id da meta dona do bem ou "owned" (um bem que a pessoa já tem). */
interface TradeInRow {
  readonly key: number;
  source: string;
  name: string;
  value: string;
  rate: string;
}

type CategoryKind = NonNullable<GoalDto['category']>['kind'];

let rowKey = 0;
const row = (name = '', amount = '', replaces = ''): CostRow => ({ key: ++rowKey, name, amount, replaces });
const tradeInRow = (source: string, name = '', value = '', rate = ''): TradeInRow => ({
  key: ++rowKey,
  source,
  name,
  value,
  rate,
});
const percentToInput = (rate: number) => String(+(rate * 100).toFixed(2)).replace('.', ',');

/**
 * Cadastro/edição de meta, com a parcela e o custo total calculados na hora. `sellable`: metas cujo bem esta
 * pode vender na largada (de compra, antes na fila, que nenhuma outra vende).
 */
export function GoalForm({
  goal,
  categories,
  sellable,
  onSubmit,
  onCancel,
  busy,
}: {
  goal?: GoalDto;
  categories: CategoryDirectory;
  sellable: readonly GoalDto[];
  onSubmit: (command: GoalCommand) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const f = goal?.financing;
  const [name, setName] = useState(goal?.name ?? '');
  const [kind, setKind] = useState<GoalDto['kind']>(goal?.kind ?? 'purchase');
  const [price, setPrice] = useState(goal ? centsToInput(goal.price.cents) : '');
  const [down, setDown] = useState(goal && goal.downPayment.cents > 0 ? centsToInput(goal.downPayment.cents) : '');
  const [oneTime, setOneTime] = useState(
    goal && goal.oneTimeCosts.cents > 0 ? centsToInput(goal.oneTimeCosts.cents) : '',
  );
  const [financingKind, setFinancingKind] = useState<FinancingDto['kind']>(f?.kind ?? 'cash');
  const [installments, setInstallments] = useState(f && f.kind !== 'cash' ? String(f.installments) : '12');
  const [rate, setRate] = useState(
    f?.kind === 'loan' ? String(+(f.monthlyRate * 100).toFixed(4)).replace('.', ',') : '1,99',
  );
  const [fee, setFee] = useState(
    f?.kind === 'consortium' ? String(+(f.adminFeeRate * 100).toFixed(2)).replace('.', ',') : '15',
  );
  const [costs, setCosts] = useState<CostRow[]>(
    goal?.recurringCosts.map((c) => row(c.name, centsToInput(c.monthly.cents), c.replacesCategoryId ?? '')) ?? [],
  );
  const [category, setCategory] = useState<CategoryKind | ''>(goal?.category?.kind ?? '');
  const [categoryName, setCategoryName] = useState(goal?.category?.label ?? '');
  const [sales, setSales] = useState<TradeInRow[]>(
    goal?.tradeIns.map((t) =>
      t.source.kind === 'goal'
        ? tradeInRow(t.source.goalId, '', '', percentToInput(t.annualDepreciationRate))
        : tradeInRow(
            'owned',
            t.source.name,
            centsToInput(t.source.currentValue.cents),
            percentToInput(t.annualDepreciationRate),
          ),
    ) ?? [],
  );
  const [error, setError] = useState<string | undefined>();

  const financing = ((): FinancingDto | undefined => {
    const n = Number(installments);
    if (financingKind === 'cash') return { kind: 'cash' };
    if (!Number.isInteger(n) || n < 1 || n > 480) return undefined;
    if (financingKind === 'interest_free') return { kind: 'interest_free', installments: n };
    if (financingKind === 'loan') {
      const monthlyRate = parsePercent(rate);
      return monthlyRate === undefined ? undefined : { kind: 'loan', installments: n, monthlyRate };
    }
    const adminFeeRate = parsePercent(fee);
    return adminFeeRate === undefined ? undefined : { kind: 'consortium', installments: n, adminFeeRate };
  })();
  const priceCents = parseReais(price) ?? 0;
  const downCents = financingKind === 'cash' ? 0 : (parseReais(down) ?? 0);
  const oneTimeCents = parseReais(oneTime) ?? 0;
  const preview = financing
    ? goalCost({ priceCents, downPaymentCents: downCents, oneTimeCostsCents: oneTimeCents, financing })
    : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Dê um nome à meta.');
    if (!financing) return setError('Confira o número de parcelas e as taxas.');
    if (downCents > priceCents) return setError('A entrada não pode passar do valor.');
    const recurring = costs.filter((c) => c.name.trim() || c.amount.trim() || c.replaces);
    const parsed = recurring.map((c) => ({ ...c, cents: parseReais(c.amount) ?? (c.amount.trim() ? undefined : 0) }));
    if (parsed.some((c) => c.cents === undefined || !c.name.trim())) {
      return setError('Cada custo mensal precisa de nome e valor (use 0 quando só substitui um gasto).');
    }
    const tradeIns = sales.map((t) => ({ ...t, parsedRate: parsePercent(t.rate), cents: parseReais(t.value) }));
    const incomplete = tradeIns.some(
      (t) =>
        t.parsedRate === undefined ||
        t.parsedRate >= 1 ||
        (t.source === 'owned' && (!t.name.trim() || t.cents === undefined)),
    );
    if (incomplete) {
      return setError(
        'Em cada bem vendido, informe a desvalorização ao ano (de 0 a 99%) e, se for um bem que você já tem, o nome e o valor de hoje.',
      );
    }
    const goalSources = tradeIns.filter((t) => t.source !== 'owned').map((t) => t.source);
    if (new Set(goalSources).size !== goalSources.length) return setError('O mesmo bem aparece duas vezes na venda.');
    setError(undefined);
    onSubmit({
      name: name.trim(),
      kind,
      priceCents,
      downPaymentCents: downCents,
      oneTimeCostsCents: oneTimeCents,
      financing,
      recurringCosts: parsed.map((c) => ({
        name: c.name.trim(),
        monthlyCents: c.cents ?? 0,
        ...(c.replaces ? { replacesCategoryId: c.replaces } : {}),
      })),
      ...(kind === 'purchase' && category
        ? {
            category:
              category === 'other' && categoryName.trim()
                ? { kind: category, label: categoryName.trim() }
                : { kind: category },
          }
        : {}),
      tradeIns: tradeIns.map((t) => ({
        source:
          t.source === 'owned'
            ? { kind: 'owned' as const, name: t.name.trim(), currentValueCents: t.cents ?? 0 }
            : { kind: 'goal' as const, goalId: t.source },
        annualDepreciationRate: t.parsedRate ?? 0,
      })),
    });
  };
  const updateSale = (key: number, change: Partial<TradeInRow>) =>
    setSales((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const updateRow = (key: number, change: Partial<CostRow>) =>
    setCosts((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  return (
    <form className="card form-grid" onSubmit={submit} aria-label={goal ? `Editar ${goal.name}` : 'Nova meta'}>
      <h2 className="span-all">{goal ? `Editar ${goal.name}` : 'Nova meta'}</h2>
      <label className="span-all">
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Bicicleta elétrica" />
      </label>
      <label>
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value as GoalDto['kind'])}>
          {Object.entries(GOAL_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {kind === 'purchase' && (
        <label>
          Categoria do bem
          <select value={category} onChange={(e) => setCategory(e.target.value as CategoryKind | '')}>
            <option value="">Sem categoria</option>
            {Object.entries(ASSET_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'purchase' && category === 'other' && (
        <label>
          Qual categoria?
          <input
            value={categoryName}
            maxLength={40}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Opcional"
          />
        </label>
      )}
      <label>
        Valor (R$)
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0 para estilo de vida"
        />
      </label>
      <label>
        Como pagar
        <select value={financingKind} onChange={(e) => setFinancingKind(e.target.value as FinancingDto['kind'])}>
          {Object.entries(FINANCING_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Custos únicos (R$)
        <input
          inputMode="decimal"
          value={oneTime}
          onChange={(e) => setOneTime(e.target.value)}
          placeholder="CNH, equipamento, caução…"
        />
      </label>
      {financingKind !== 'cash' && (
        <>
          <label>
            Entrada (R$)
            <input inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} placeholder="0" />
          </label>
          <label>
            Parcelas
            <input inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value)} />
          </label>
        </>
      )}
      {financingKind === 'loan' && (
        <label>
          Juros ao mês (%)
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
      )}
      {financingKind === 'consortium' && (
        <label>
          Taxa de administração (%)
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
      )}

      <fieldset className="span-all">
        <legend>Custos por mês que a meta traz</legend>
        <p className="hint">
          Ex.: manutenção, seguro, aluguel. Em "substitui", escolha um gasto que deixa de existir (ex.: a bike elétrica
          no lugar do transporte por app).
        </p>
        {costs.map((c) => (
          <div className="form-row cost-row" key={c.key}>
            <input
              aria-label="Nome do custo"
              value={c.name}
              onChange={(e) => updateRow(c.key, { name: e.target.value })}
              placeholder="Nome"
            />
            <input
              aria-label="Valor por mês"
              inputMode="decimal"
              value={c.amount}
              onChange={(e) => updateRow(c.key, { amount: e.target.value })}
              placeholder="R$/mês"
            />
            <select
              aria-label="Substitui o gasto com"
              value={c.replaces}
              onChange={(e) => updateRow(c.key, { replaces: e.target.value })}
            >
              <option value="">Não substitui nada</option>
              {categories.groups().map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      Substitui: {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="link"
              onClick={() => setCosts((rows) => rows.filter((r) => r.key !== c.key))}
            >
              Remover
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setCosts((rows) => [...rows, row()])}>
          Adicionar custo mensal
        </button>
      </fieldset>

      <fieldset className="span-all">
        <legend>Vender um bem para ajudar a pagar</legend>
        <p className="hint">
          O valor da venda entra no dinheiro para começar, já descontado o que o bem ainda deve, e ele sai do seu
          orçamento. O plano estima esse valor no mês em que a meta começa, em cada cenário, com a desvalorização ao
          ano. Dá para vender o bem de uma meta de compra que vem antes na fila ou um bem que você já tem.
        </p>
        {sales.map((t) => (
          <div className="form-row trade-in-row" key={t.key}>
            <select
              aria-label="Bem vendido"
              value={t.source}
              onChange={(e) => updateSale(t.key, { source: e.target.value })}
            >
              {sellable.map((g) => (
                <option key={g.id} value={g.id}>
                  Bem da meta: {g.name}
                </option>
              ))}
              <option value="owned">Um bem que já tenho</option>
            </select>
            {t.source === 'owned' && (
              <>
                <input
                  aria-label="Nome do bem"
                  value={t.name}
                  maxLength={60}
                  onChange={(e) => updateSale(t.key, { name: e.target.value })}
                  placeholder="Ex.: notebook atual"
                />
                <input
                  aria-label="Valor hoje (R$)"
                  inputMode="decimal"
                  value={t.value}
                  onChange={(e) => updateSale(t.key, { value: e.target.value })}
                  placeholder="Valor hoje (R$)"
                />
              </>
            )}
            <input
              aria-label="Desvalorização ao ano (%)"
              inputMode="decimal"
              value={t.rate}
              onChange={(e) => updateSale(t.key, { rate: e.target.value })}
              placeholder="Perde % ao ano"
            />
            <button
              type="button"
              className="link"
              onClick={() => setSales((rows) => rows.filter((r) => r.key !== t.key))}
            >
              Remover
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setSales((rows) => [...rows, tradeInRow(sellable[0]?.id ?? 'owned')])}>
          Adicionar bem vendido
        </button>
      </fieldset>

      <output className="span-all goal-preview" aria-live="polite">
        {preview ? (
          <>
            Precisa guardar <strong>{formatCents(preview.upfrontCents)}</strong> para começar
            {preview.installments > 0 && (
              <>
                {' '}
                ·{' '}
                <strong>
                  {preview.installments}x de {formatCents(preview.installmentCents)}
                </strong>
              </>
            )}{' '}
            · custo total <strong>{formatCents(preview.totalCents)}</strong>
          </>
        ) : (
          'Confira parcelas e taxas.'
        )}
      </output>
      {error && (
        <p className="error span-all" role="alert">
          {error}
        </p>
      )}
      <div className="row span-all">
        <button type="submit" className="primary" disabled={busy}>
          {goal ? 'Salvar' : 'Adicionar meta'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
