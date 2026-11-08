import type { CreateOpportunityCommand, OpportunityDto } from '@finapp/contracts';
import { type FormEvent, useState } from 'react';
import { formatCents } from '../../lib/format';
import { parseReais } from '../../lib/money-input';
import { KIND_LABEL, STATUS_COLUMNS } from './career-labels';

/** Quadro de oportunidades: ideia → aplicada → em conversa → fechada / perdida. */
export function OpportunityBoard({
  opportunities,
  onCreate,
  onMove,
  onDelete,
  busy,
}: {
  opportunities: OpportunityDto[];
  onCreate: (command: CreateOpportunityCommand) => void;
  onMove: (id: string, status: OpportunityDto['status']) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const flow = STATUS_COLUMNS.map((c) => c.status);
  const openMonthly = opportunities
    .filter((o) => o.status !== 'perdida' && o.status !== 'fechada')
    .reduce((sum, o) => sum + (o.estimatedMonthly?.cents ?? 0), 0);
  const closedMonthly = opportunities
    .filter((o) => o.status === 'fechada')
    .reduce((sum, o) => sum + (o.estimatedMonthly?.cents ?? 0), 0);

  return (
    <article className="card">
      <div className="card-header">
        <h2>Oportunidades de renda</h2>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Nova oportunidade
        </button>
      </div>
      <p className="hint">
        Em aberto: até {formatCents(openMonthly)}/mês em potencial · fechadas: {formatCents(closedMonthly)}/mês
      </p>
      {adding && (
        <OpportunityForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={(command) => {
            onCreate(command);
            setAdding(false);
          }}
        />
      )}
      <div className="board">
        {STATUS_COLUMNS.map((column) => {
          const cards = opportunities.filter((o) => o.status === column.status);
          return (
            <section key={column.status} className="board-column" aria-label={column.label}>
              <h3>
                {column.label} <span className="hint">({cards.length})</span>
              </h3>
              {cards.map((o) => {
                const index = flow.indexOf(o.status);
                return (
                  <div key={o.id} className="board-card">
                    <strong>{o.title}</strong>
                    <span className="hint">{KIND_LABEL[o.kind]}</span>
                    {(o.estimatedMonthly || o.estimatedOneOff) && (
                      <span className="amount">
                        {o.estimatedMonthly ? `${formatCents(o.estimatedMonthly.cents)}/mês` : ''}
                        {o.estimatedMonthly && o.estimatedOneOff ? ' + ' : ''}
                        {o.estimatedOneOff ? `${formatCents(o.estimatedOneOff.cents)} de uma vez` : ''}
                      </span>
                    )}
                    {o.notes && <p className="hint">{o.notes}</p>}
                    {o.link && (
                      <a href={o.link} target="_blank" rel="noreferrer noopener">
                        Abrir link
                      </a>
                    )}
                    <div className="row">
                      <button
                        type="button"
                        disabled={index <= 0}
                        onClick={() => onMove(o.id, flow[index - 1] as OpportunityDto['status'])}
                        aria-label={`Voltar ${o.title}`}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={index >= flow.length - 1}
                        onClick={() => onMove(o.id, flow[index + 1] as OpportunityDto['status'])}
                        aria-label={`Avançar ${o.title}`}
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => window.confirm(`Excluir "${o.title}"?`) && onDelete(o.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </article>
  );
}

function OpportunityForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (command: CreateOpportunityCommand) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<OpportunityDto['kind']>('freela');
  const [monthly, setMonthly] = useState('');
  const [oneOff, setOneOff] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError('Dê um título.');
    const monthlyCents = monthly.trim() ? parseReais(monthly) : undefined;
    const oneOffCents = oneOff.trim() ? parseReais(oneOff) : undefined;
    if ((monthly.trim() && monthlyCents === undefined) || (oneOff.trim() && oneOffCents === undefined)) {
      return setError('Confira os valores (ex.: 1.500,00).');
    }
    if (link && !/^https?:\/\//.test(link)) return setError('O link precisa começar com https://');
    setError(undefined);
    onSubmit({
      title: title.trim(),
      kind,
      notes: notes.trim(),
      ...(monthlyCents !== undefined ? { estimatedMonthlyCents: monthlyCents } : {}),
      ...(oneOffCents !== undefined ? { estimatedOneOffCents: oneOffCents } : {}),
      ...(link ? { link } : {}),
    });
  };
  return (
    <form className="form-grid nested" onSubmit={submit} aria-label="Nova oportunidade">
      <label className="span-all">
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Site para clínica" />
      </label>
      <label>
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value as OpportunityDto['kind'])}>
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Por mês (R$)
        <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
      </label>
      <label>
        De uma vez (R$)
        <input inputMode="decimal" value={oneOff} onChange={(e) => setOneOff(e.target.value)} />
      </label>
      <label>
        Link
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
      </label>
      <label className="span-all">
        Notas
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && (
        <p className="error span-all" role="alert">
          {error}
        </p>
      )}
      <div className="row span-all">
        <button type="submit" className="primary" disabled={busy}>
          Adicionar
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
