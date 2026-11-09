import type { CategorizationRuleDto, UpdateRuleCommand } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { useServices } from '../../app/services';
import type { CategoryDirectory } from '../../lib/categories';
import { QueryState } from '../shared/QueryState';
import { financeKeys, useCategories } from '../shared/queries';
import { type ConditionKind, isDefaultRule, ruleSummary } from './rule-labels';

const recategorized = (n: number) =>
  n === 0
    ? 'Nenhuma transação mudou de categoria.'
    : n === 1
      ? '1 transação recategorizada.'
      : `${n} transações recategorizadas.`;

function CategorySelect({
  categories,
  value,
  onChange,
  label,
}: {
  categories: CategoryDirectory;
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        Escolha…
      </option>
      {categories.groups().map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Regras de categorização: valem para os próximos lançamentos e, ao mudar, são reaplicadas aos últimos 12 meses. */
export function RulesPage() {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const rules = useQuery({ queryKey: financeKeys.rules, queryFn: () => finance.rules() });
  const [message, setMessage] = useState<string | undefined>();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: financeKeys.all });
  const update = useMutation({
    mutationFn: async (changes: { id: string; command: UpdateRuleCommand }[]) => {
      let affected = 0;
      for (const c of changes) affected += (await finance.updateRule(c.id, c.command)).affected;
      return affected;
    },
    onSuccess: (affected) => {
      setMessage(recategorized(affected));
      refresh();
    },
    onError: () => setMessage('Não foi possível salvar a regra.'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => finance.deleteRule(id),
    onSuccess: ({ affected }) => {
      setMessage(`Regra excluída. ${recategorized(affected)}`);
      refresh();
    },
  });
  const list = rules.data ?? [];
  const move = (index: number, delta: -1 | 1) => {
    const a = list[index];
    const b = list[index + delta];
    if (!a || !b) return;
    // Troca as prioridades; se forem iguais, passa à frente por uma unidade.
    const aPriority = a.priority === b.priority ? b.priority - delta : b.priority;
    update.mutate([
      { id: a.id, command: { priority: Math.max(0, aPriority) } },
      { id: b.id, command: { priority: a.priority } },
    ]);
  };

  return (
    <section className="page" aria-labelledby="rules-title">
      <header className="page-header">
        <h1 id="rules-title">Regras de categorização</h1>
        <Link to="/categorias">Categorias</Link>
      </header>
      <p className="hint">
        A primeira regra que combinar decide (de cima para baixo). Mudanças são reaplicadas aos últimos 12 meses;
        escolhas feitas à mão nunca mudam. As regras padrão podem ser desligadas, mas não excluídas.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <NewRule
        categories={categories}
        onCreated={(affected) => setMessage(`Regra criada. ${recategorized(affected)}`)}
      />
      <article className="card">
        <QueryState
          isPending={rules.isPending}
          error={rules.error}
          onRetry={() => void rules.refetch()}
          isEmpty={list.length === 0}
          empty={<p className="hint">Nenhuma regra ainda.</p>}
          skeletons={3}
        >
          <ul className="rule-list" aria-label="Regras">
            {list.map((rule, index) => (
              <RuleItem
                key={rule.id}
                rule={rule}
                categories={categories}
                busy={update.isPending || remove.isPending}
                first={index === 0}
                last={index === list.length - 1}
                onMove={(delta) => move(index, delta)}
                onChange={(command) => update.mutate([{ id: rule.id, command }])}
                onDelete={() => remove.mutate(rule.id)}
              />
            ))}
          </ul>
        </QueryState>
      </article>
    </section>
  );
}

function RuleItem({
  rule,
  categories,
  busy,
  first,
  last,
  onMove,
  onChange,
  onDelete,
}: {
  rule: CategorizationRuleDto;
  categories: CategoryDirectory;
  busy: boolean;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onChange: (command: UpdateRuleCommand) => void;
  onDelete: () => void;
}) {
  return (
    <li className={rule.enabled ? '' : 'off'}>
      <div>
        <strong>{rule.name}</strong>
        {isDefaultRule(rule) && <span className="hint"> · padrão</span>}
        <span className="hint" style={{ display: 'block' }}>
          {ruleSummary(rule)} → {categories.path(rule.categoryId)}
        </span>
      </div>
      <div className="rule-actions">
        <label className="check">
          <input
            type="checkbox"
            checked={rule.enabled}
            disabled={busy}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          Ligada
        </label>
        <CategorySelect
          categories={categories}
          label={`Categoria de ${rule.name}`}
          value={rule.categoryId}
          onChange={(categoryId) => onChange({ categoryId })}
        />
        <button type="button" disabled={busy || first} onClick={() => onMove(-1)} aria-label={`Subir ${rule.name}`}>
          ↑
        </button>
        <button type="button" disabled={busy || last} onClick={() => onMove(1)} aria-label={`Descer ${rule.name}`}>
          ↓
        </button>
        {!isDefaultRule(rule) && (
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => window.confirm(`Excluir a regra "${rule.name}"?`) && onDelete()}
          >
            Excluir
          </button>
        )}
      </div>
    </li>
  );
}

function NewRule({ categories, onCreated }: { categories: CategoryDirectory; onCreated: (affected: number) => void }) {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ConditionKind>('descriptionContains');
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const ready = text.trim().length >= 3 && categoryId !== '';
  const command = {
    name: (name.trim() || `${text.trim()} → ${categories.path(categoryId)}`).slice(0, 80),
    categoryId,
    [kind]: text.trim(),
  };
  const preview = useMutation({ mutationFn: () => finance.previewRule(command) });
  const create = useMutation({
    mutationFn: () => finance.createRule({ ...command, priority: 100, enabled: true, applyToExisting: true }),
    onSuccess: ({ affected }) => {
      onCreated(affected);
      setOpen(false);
      setText('');
      setName('');
      preview.reset();
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        Nova regra
      </button>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) create.mutate();
  };
  return (
    <form className="card form-grid" aria-label="Nova regra" onSubmit={submit}>
      <label>
        Quando
        <select value={kind} onChange={(e) => setKind(e.target.value as ConditionKind)}>
          <option value="descriptionContains">a descrição contém</option>
          <option value="counterpartyNameContains">a contraparte contém</option>
        </select>
      </label>
      <label>
        Texto
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {/* O seletor já tem rótulo acessível próprio (aria-label); o texto é só visual. */}
      <div className="field">
        <span aria-hidden="true">Categoria</span>
        <CategorySelect
          categories={categories}
          label="Categoria da regra"
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>
      <label>
        Nome (opcional)
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {preview.data && (
        <p className="hint span-all" role="status">
          Mudaria {preview.data.affected} transaç{preview.data.affected === 1 ? 'ão' : 'ões'} dos últimos 12 meses
          {preview.data.examples[0] ? `, como "${preview.data.examples[0].description}"` : ''}.
        </p>
      )}
      <div className="row span-all">
        <button type="button" disabled={!ready || preview.isPending} onClick={() => preview.mutate()}>
          Ver impacto
        </button>
        <button type="submit" className="primary" disabled={!ready || create.isPending}>
          Criar regra
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
