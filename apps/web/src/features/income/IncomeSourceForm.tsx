import type { CreateIncomeSourceCommand, IncomeSourceDto } from '@finapp/contracts';
import { type FormEvent, useState } from 'react';
import { centsToInput, parseReais } from '../../lib/money-input';
import { KIND_LABEL, RISK_LABEL, STATUS_LABEL } from './income-labels';

export interface IncomeSourceDraft {
  readonly name?: string;
  readonly expectedMonthlyCents?: number;
  readonly counterpartyContains?: string;
}

/** Cadastro/edição de uma fonte de renda. Valores digitados em reais; datas por mês. */
export function IncomeSourceForm({
  source,
  draft,
  onSubmit,
  onCancel,
  busy,
}: {
  source?: IncomeSourceDto;
  draft?: IncomeSourceDraft;
  onSubmit: (command: CreateIncomeSourceCommand) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(source?.name ?? draft?.name ?? '');
  const [kind, setKind] = useState<IncomeSourceDto['kind']>(source?.kind ?? 'other');
  const [amount, setAmount] = useState(
    source
      ? centsToInput(source.expectedMonthly.cents)
      : draft?.expectedMonthlyCents
        ? centsToInput(draft.expectedMonthlyCents)
        : '',
  );
  const [startsOn, setStartsOn] = useState(source?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(source?.endsOn ?? '');
  const [risk, setRisk] = useState<IncomeSourceDto['risk']>(source?.risk ?? 'medium');
  const [status, setStatus] = useState<IncomeSourceDto['status']>(source?.status ?? 'active');
  const [counterparty, setCounterparty] = useState(
    source?.matcher?.counterpartyContains ?? draft?.counterpartyContains ?? '',
  );
  const [description, setDescription] = useState(source?.matcher?.descriptionContains ?? '');
  const [error, setError] = useState<string | undefined>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cents = parseReais(amount);
    if (!name.trim()) return setError('Dê um nome à fonte.');
    if (!cents) return setError('Informe o valor mensal (ex.: 1.500,00).');
    if (!startsOn) return setError('Informe o mês de início.');
    if (endsOn && endsOn < startsOn) return setError('O fim não pode ser antes do início.');
    setError(undefined);
    const matcher = {
      ...(counterparty.trim() ? { counterpartyContains: counterparty.trim() } : {}),
      ...(description.trim() ? { descriptionContains: description.trim() } : {}),
    };
    onSubmit({
      name: name.trim(),
      kind,
      expectedMonthlyCents: cents,
      startsOn,
      ...(endsOn ? { endsOn } : {}),
      risk,
      status,
      ...(Object.keys(matcher).length ? { matcher } : {}),
    });
  };

  return (
    <form
      className="card form-grid"
      onSubmit={submit}
      aria-label={source ? `Editar ${source.name}` : 'Nova fonte de renda'}
    >
      <h2 className="span-all">{source ? `Editar ${source.name}` : 'Nova fonte de renda'}</h2>
      <label className="span-all">
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Bolsa da faculdade" />
      </label>
      <label>
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value as IncomeSourceDto['kind'])}>
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valor por mês (R$)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.500,00" />
      </label>
      <label>
        Começa em
        <input type="month" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </label>
      <label>
        Termina em (opcional)
        <input type="month" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
      </label>
      <label>
        Risco de parar
        <select value={risk} onChange={(e) => setRisk(e.target.value as IncomeSourceDto['risk'])}>
          {Object.entries(RISK_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Situação
        <select value={status} onChange={(e) => setStatus(e.target.value as IncomeSourceDto['status'])}>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="span-all">
        <legend>Como reconhecer os pagamentos (opcional)</legend>
        <p className="hint">Sem isso, a fonte entra nas projeções mas não é conferida com o que entrou de verdade.</p>
        <div className="form-row">
          <label>
            Nome de quem paga contém
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Ex.: fundação" />
          </label>
          <label>
            Descrição contém
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: bolsa" />
          </label>
        </div>
      </fieldset>
      {error && (
        <p className="error span-all" role="alert">
          {error}
        </p>
      )}
      <div className="row span-all">
        <button type="submit" className="primary" disabled={busy}>
          {source ? 'Salvar' : 'Adicionar fonte'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
