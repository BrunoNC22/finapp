import type { CategoryDto } from '@finapp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { useServices } from '../../app/services';
import { financeKeys, useCategories } from '../shared/queries';

/** Categorias: criar grupos e subcategorias, renomear e arquivar (arquivar mantém o histórico). */
export function CategoriesPage() {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const [message, setMessage] = useState<string | undefined>();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: financeKeys.all });
  const create = useMutation({
    mutationFn: (c: { name: string; kind: CategoryDto['kind']; parentId?: string }) => finance.createCategory(c),
    onSuccess: (c) => {
      setMessage(`Categoria "${c.name}" criada.`);
      refresh();
    },
    onError: () => setMessage('Não foi possível criar a categoria (o nome já existe?).'),
  });
  const update = useMutation({
    mutationFn: ({ id, name, archived }: { id: string; name?: string; archived?: true }) =>
      finance.updateCategory(id, { ...(name ? { name } : {}), ...(archived ? { archived } : {}) }),
    onSuccess: (c) => {
      setMessage(c.archived ? `"${c.name}" arquivada.` : `Renomeada para "${c.name}".`);
      refresh();
    },
    onError: () => setMessage('Não foi possível salvar a categoria.'),
  });
  const merge = useMutation({
    mutationFn: ({ id, into }: { id: string; into: string }) => finance.mergeCategory(id, into),
    onSuccess: (r) => {
      const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
      setMessage(
        `Mesclada: ${plural(r.transactions, 'transação', 'transações')} e ${plural(r.rules, 'regra', 'regras')} mudaram de categoria.`,
      );
      refresh();
    },
    onError: () => setMessage('Não foi possível mesclar.'),
  });
  const busy = create.isPending || update.isPending || merge.isPending;
  const sameKind = (c: CategoryDto) =>
    categories
      .groups()
      .filter((g) => g.kind === c.kind)
      .flatMap((g) => g.children.map((x) => ({ id: x.id, label: `${g.name} › ${x.name}` })))
      .filter((x) => x.id !== c.id);

  return (
    <section className="page" aria-labelledby="categories-title">
      <header className="page-header">
        <h1 id="categories-title">Categorias</h1>
        <Link to="/regras">Regras</Link>
      </header>
      <p className="hint">
        Arquivar esconde a categoria das escolhas, mas mantém as transações antigas nela. Para mudar onde as transações
        caem, use as regras ou corrija na lista de transações.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <NewGroup busy={busy} onCreate={(name, kind) => create.mutate({ name, kind })} />
      {categories.groups().map((group) => (
        <article key={group.id} className="card" aria-label={group.name}>
          <h2>{group.name}</h2>
          <ul className="rule-list">
            {group.children.map((c) => (
              <CategoryItem
                key={c.id}
                category={c}
                busy={busy}
                onRename={(name) => update.mutate({ id: c.id, name })}
                onArchive={() => update.mutate({ id: c.id, archived: true })}
                mergeTargets={sameKind(c)}
                onMerge={(into) => merge.mutate({ id: c.id, into })}
              />
            ))}
          </ul>
          <AddChild
            busy={busy}
            groupName={group.name}
            onAdd={(name) => create.mutate({ name, kind: group.kind, parentId: group.id })}
          />
        </article>
      ))}
    </section>
  );
}

function CategoryItem({
  category,
  busy,
  onRename,
  onArchive,
  mergeTargets,
  onMerge,
}: {
  category: CategoryDto;
  busy: boolean;
  onRename: (name: string) => void;
  onArchive: () => void;
  mergeTargets: { id: string; label: string }[];
  onMerge: (into: string) => void;
}) {
  const [name, setName] = useState(category.name);
  const changed = name.trim() !== '' && name.trim() !== category.name;
  return (
    <li>
      <input aria-label={`Nome de ${category.name}`} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="rule-actions">
        <button type="button" disabled={busy || !changed} onClick={() => onRename(name.trim())}>
          Salvar
        </button>
        <button
          type="button"
          className="link"
          disabled={busy}
          onClick={() => window.confirm(`Arquivar "${category.name}"?`) && onArchive()}
        >
          Arquivar
        </button>
        <select
          aria-label={`Mesclar ${category.name} em`}
          value=""
          disabled={busy}
          onChange={(e) => {
            const target = mergeTargets.find((t) => t.id === e.target.value);
            if (
              target &&
              window.confirm(
                `Mesclar "${category.name}" em "${target.label}"? As transações e regras mudam de categoria.`,
              )
            )
              onMerge(target.id);
          }}
        >
          <option value="">Mesclar em…</option>
          {mergeTargets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

function AddChild({ busy, groupName, onAdd }: { busy: boolean; groupName: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim());
    setName('');
  };
  return (
    <form className="row" onSubmit={submit} aria-label={`Nova subcategoria em ${groupName}`}>
      <input
        aria-label={`Nova subcategoria em ${groupName}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nova subcategoria"
      />
      <button type="submit" disabled={busy || !name.trim()}>
        Adicionar
      </button>
    </form>
  );
}

function NewGroup({ busy, onCreate }: { busy: boolean; onCreate: (name: string, kind: CategoryDto['kind']) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryDto['kind']>('expense');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), kind);
    setName('');
  };
  return (
    <form className="card row" onSubmit={submit} aria-label="Novo grupo">
      <input
        aria-label="Nome do grupo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Novo grupo"
      />
      <select aria-label="Tipo do grupo" value={kind} onChange={(e) => setKind(e.target.value as CategoryDto['kind'])}>
        <option value="expense">Gasto</option>
        <option value="income">Entrada</option>
      </select>
      <button type="submit" disabled={busy || !name.trim()}>
        Criar grupo
      </button>
    </form>
  );
}
