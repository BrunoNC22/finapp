import type { TransactionDto } from '@finapp/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useServices } from '../../app/services';
import { accountLabel } from '../../lib/accounts';
import type { CategoryDirectory } from '../../lib/categories';
import { formatDate } from '../../lib/format';
import { addMonths, currentMonth, formatMonthLong } from '../../lib/months';
import { Amount } from '../shared/Amount';
import { QueryState } from '../shared/QueryState';
import { financeKeys, useAccountNames, useAccounts, useCategories } from '../shared/queries';
import { filtersFromParams, filtersToParams, type TransactionFilters, toSearch } from './filters';
import { CLASSIFICATION_LABEL, explain, PAYMENT_METHOD_LABEL, paymentBadge } from './transaction-labels';

const PAGE_SIZE = 50;

/** Todas as transações de todas as contas, com filtros na URL e categoria editável na própria linha. */
export function TransactionsPage() {
  const { finance } = useServices();
  const [params, setParams] = useSearchParams();
  const latest = currentMonth();
  const filters = useMemo(() => filtersFromParams(params, latest), [params, latest]);
  const search = useMemo(() => toSearch(filters), [filters]);
  const categories = useCategories();
  const accountName = useAccountNames();

  const query = useInfiniteQuery({
    queryKey: financeKeys.transactions(search),
    queryFn: ({ pageParam }) =>
      finance.transactions({ ...search, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const update = useCallback(
    (next: TransactionFilters) => setParams(filtersToParams(next), { replace: true }),
    [setParams],
  );

  return (
    <section className="page" aria-labelledby="transactions-title">
      <header className="page-header">
        <h1 id="transactions-title">Transações</h1>
      </header>
      <Filters filters={filters} latest={latest} categories={categories} onChange={update} />
      <QueryState
        isPending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={items.length === 0}
        empty={<p className="hint">Nenhuma transação com estes filtros.</p>}
        skeletons={6}
      >
        <ul className="tx-list" aria-label="Transações">
          {items.map((t) => (
            <TransactionRow key={t.id} transaction={t} categories={categories} accountName={accountName(t.accountId)} />
          ))}
        </ul>
        {query.hasNextPage && (
          <button
            type="button"
            className="load-more"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </button>
        )}
      </QueryState>
    </section>
  );
}

function Filters({
  filters,
  latest,
  categories,
  onChange,
}: {
  filters: TransactionFilters;
  latest: string;
  categories: CategoryDirectory;
  onChange: (filters: TransactionFilters) => void;
}) {
  const accounts = useAccounts();
  // A busca por texto espera a pessoa parar de digitar antes de ir para a URL (e para a API).
  const [text, setText] = useState(filters.q ?? '');
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.q ?? '') !== text.trim()) onChange(withValue(filters, 'q', text.trim()));
    }, 350);
    return () => clearTimeout(timer);
  }, [text, filters, onChange]);
  const months = Array.from({ length: 24 }, (_, i) => addMonths(latest, -i));

  return (
    <form className="filters" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
      <label>
        Buscar
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Descrição…" />
      </label>
      <label>
        Período
        <select value={filters.period} onChange={(e) => onChange({ ...filters, period: e.target.value })}>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonthLong(m)}
            </option>
          ))}
          <option value="all">Todos os meses</option>
        </select>
      </label>
      <label>
        Conta
        <select
          value={filters.accountId ?? ''}
          onChange={(e) => onChange(withValue(filters, 'accountId', e.target.value))}
        >
          <option value="">Todas</option>
          {accounts.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Categoria
        <select
          value={filters.categoryId ?? ''}
          onChange={(e) => onChange(withValue(filters, 'categoryId', e.target.value))}
        >
          <option value="">Todas</option>
          <option value="none">Sem categoria</option>
          <CategoryOptions categories={categories} />
        </select>
      </label>
      <label>
        Tipo
        <select
          value={filters.classification ?? ''}
          onChange={(e) => onChange(withValue(filters, 'classification', e.target.value))}
        >
          <option value="">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Entradas</option>
          <option value="internal_transfer">Entre suas contas</option>
          <option value="ignored">Ignoradas</option>
        </select>
      </label>
      <label>
        Forma
        <select
          value={filters.paymentMethod ?? ''}
          onChange={(e) => onChange(withValue(filters, 'paymentMethod', e.target.value))}
        >
          <option value="">Todas</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

/** Troca um filtro; valor vazio remove o filtro. */
function withValue(filters: TransactionFilters, key: keyof TransactionFilters, value: string): TransactionFilters {
  const { [key]: _removed, ...rest } = filters;
  return (value ? { ...rest, [key]: value } : rest) as TransactionFilters;
}

function CategoryOptions({ categories }: { categories: CategoryDirectory }) {
  return (
    <>
      {categories.groups().map((group) => (
        <optgroup key={group.id} label={group.name}>
          <option value={group.id}>{group.name} (grupo)</option>
          {group.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** A contraparte só aparece quando acrescenta algo (não repete a descrição nem a própria conta). */
function showCounterparty(t: TransactionDto, accountName: string): boolean {
  const name = t.counterpartyName?.trim().toLowerCase();
  if (!name) return false;
  return !t.description.toLowerCase().includes(name) && !accountName.toLowerCase().includes(name);
}

function TransactionRow({
  transaction: t,
  categories,
  accountName,
}: {
  transaction: TransactionDto;
  categories: CategoryDirectory;
  accountName: string;
}) {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState(false);
  const [open, setOpen] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: financeKeys.all });
  const categorize = useMutation({
    mutationFn: (categoryId: string) => finance.categorize(t.id, categoryId),
    onSuccess: () => {
      setEditingCategory(false);
      refresh();
    },
  });
  const classify = useMutation({
    mutationFn: (classification: TransactionDto['classification']) => finance.classify(t.id, classification),
    onSuccess: refresh,
  });
  const badge = paymentBadge(t);
  const detailId = `tx-detail-${t.id}`;

  return (
    <li className={`tx-row${open ? ' open' : ''}`}>
      <button
        type="button"
        className="tx-summary"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen(!open)}
      >
        <span className="tx-date">{formatDate(t.occurredOn)}</span>
        <span className="tx-main">
          <span className="tx-description">{t.description}</span>
          <span className="hint">
            {showCounterparty(t, accountName) ? `${t.counterpartyName} · ` : ''}
            {accountName}
          </span>
        </span>
        {badge ? <span className={`badge badge-${badge.tone}`}>{badge.label}</span> : <span />}
        <Amount cents={t.amount.cents} classification={t.classification} />
      </button>
      <div className="tx-category">
        {editingCategory ? (
          <select
            aria-label={`Categoria de ${t.description}`}
            defaultValue={t.category?.id ?? ''}
            // biome-ignore lint/a11y/noAutofocus: o seletor aparece por ação explícita da pessoa
            autoFocus
            onBlur={() => !categorize.isPending && setEditingCategory(false)}
            onChange={(e) => e.target.value && categorize.mutate(e.target.value)}
            disabled={categorize.isPending}
          >
            <option value="" disabled>
              Escolha…
            </option>
            <CategoryOptions categories={categories} />
          </select>
        ) : (
          <button
            type="button"
            className={`chip${t.category ? '' : ' chip-empty'}`}
            onClick={() => setEditingCategory(true)}
            aria-label={`Mudar categoria de ${t.description}: ${categories.path(t.category?.id)}`}
          >
            {categories.path(t.category?.id)}
          </button>
        )}
        {categorize.isError && <span className="error">Não foi possível salvar.</span>}
      </div>
      {open && (
        <div className="tx-detail" id={detailId}>
          <ul className="reasons">
            {explain(t).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <dl className="facts">
            <dt>Forma</dt>
            <dd>{PAYMENT_METHOD_LABEL[t.paymentMethod]}</dd>
            {t.installment && (
              <>
                <dt>Compra parcelada</dt>
                <dd>
                  parcela {t.installment.number} de {t.installment.total} · total{' '}
                  <Amount cents={t.installment.totalAmount.cents} />
                  {t.installment.totalAmountIsEstimated ? ' (estimado)' : ''}
                </dd>
              </>
            )}
            <dt>Situação</dt>
            <dd>{t.status === 'pending' ? 'Pendente' : 'Confirmada'}</dd>
          </dl>
          <label className="inline-field">
            Contar como
            <select
              value={t.classification}
              onChange={(e) => classify.mutate(e.target.value as TransactionDto['classification'])}
              disabled={classify.isPending}
            >
              <option value="expense">{CLASSIFICATION_LABEL.expense}</option>
              <option value="income">{CLASSIFICATION_LABEL.income}</option>
              <option value="ignored">{CLASSIFICATION_LABEL.ignored}</option>
              {t.classification === 'internal_transfer' && (
                <option value="internal_transfer">{CLASSIFICATION_LABEL.internal_transfer}</option>
              )}
            </select>
          </label>
          {classify.isError && <p className="error">Não foi possível salvar.</p>}
        </div>
      )}
    </li>
  );
}
