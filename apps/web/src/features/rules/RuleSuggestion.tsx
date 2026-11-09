import type { TransactionDto } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useServices } from '../../app/services';
import { financeKeys, useCategories } from '../shared/queries';
import { type ConditionKind, suggestCondition } from './rule-labels';

/**
 * Depois de corrigir uma categoria: "criar regra para parecidas", com a condição pré-preenchida e a prévia de
 * quantas transações dos últimos 12 meses ela pegaria. A regra também vale para os próximos lançamentos.
 */
export function RuleSuggestion({
  transaction,
  categoryId,
  onClose,
}: {
  transaction: TransactionDto;
  categoryId: string;
  onClose: () => void;
}) {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const initial = suggestCondition(transaction);
  const [kind, setKind] = useState<ConditionKind>(initial.kind);
  const [value, setValue] = useState(initial.value);
  const [typed, setTyped] = useState(initial.value);
  const [result, setResult] = useState<string | undefined>();
  useEffect(() => {
    const timer = setTimeout(() => setValue(typed.trim()), 400);
    return () => clearTimeout(timer);
  }, [typed]);

  const command = {
    name: `${value} → ${categories.path(categoryId)}`.slice(0, 80),
    categoryId,
    [kind]: value,
  };
  const preview = useQuery({
    queryKey: ['rule-preview', kind, value, categoryId],
    queryFn: () => finance.previewRule(command),
    enabled: value.length >= 3,
  });
  const create = useMutation({
    mutationFn: () => finance.createRule({ ...command, priority: 100, enabled: true, applyToExisting: true }),
    onSuccess: ({ affected }) => {
      setResult(
        affected === 1
          ? 'Regra criada: 1 transação recategorizada.'
          : `Regra criada: ${affected} transações recategorizadas.`,
      );
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });

  if (result) {
    return (
      <section className="card rule-suggestion" aria-label="Criar regra">
        <p role="status">{result} Ela também vale para os próximos lançamentos.</p>
        <button type="button" className="link" onClick={onClose}>
          Fechar
        </button>
      </section>
    );
  }

  return (
    <section className="card rule-suggestion" aria-label="Criar regra">
      <strong>Criar regra para parecidas → {categories.path(categoryId)}?</strong>
      <div className="form-row">
        <label>
          Quando
          <select value={kind} onChange={(e) => setKind(e.target.value as ConditionKind)}>
            <option value="descriptionContains">a descrição contém</option>
            <option value="counterpartyNameContains">a contraparte contém</option>
          </select>
        </label>
        <label>
          Texto
          <input value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
      </div>
      <p className="hint" aria-live="polite">
        {value.length < 3
          ? 'Digite pelo menos 3 letras.'
          : preview.isPending
            ? 'Calculando…'
            : preview.data
              ? `Mudaria ${preview.data.affected} transaç${preview.data.affected === 1 ? 'ão' : 'ões'} dos últimos 12 meses (as que você escolheu à mão ficam como estão).`
              : 'Não foi possível calcular a prévia.'}
      </p>
      {create.isError && (
        <p className="error" role="alert">
          Não foi possível criar a regra.
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={value.length < 3 || create.isPending}
          onClick={() => create.mutate()}
        >
          Criar regra
        </button>
        <button type="button" onClick={onClose}>
          Agora não
        </button>
      </div>
    </section>
  );
}
