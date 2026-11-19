import type { TransactionDto } from '@finapp/contracts';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { formatDate } from '../../lib/format';
import { Amount } from '../shared/Amount';
import { financeKeys, useAccountNames } from '../shared/queries';

/** Dias antes e depois em que a outra ponta costuma cair (Pix na hora, TED e fatura em alguns dias). */
const WINDOW_DAYS = 7;

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const distanceInDays = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/** Candidatas a outra ponta: outra conta, valor oposto; as mais próximas na data primeiro. */
export function transferCandidates(t: TransactionDto, items: readonly TransactionDto[]): TransactionDto[] {
  return items
    .filter((c) => c.id !== t.id && c.accountId !== t.accountId && c.amount.cents === -t.amount.cents)
    .sort((a, b) => distanceInDays(a.occurredOn, t.occurredOn) - distanceInDays(b.occurredOn, t.occurredOn));
}

/**
 * Conciliação manual (#20): liga uma transação à outra ponta da transferência entre as contas da pessoa.
 * As duas deixam de contar como renda e gasto. Se a outra conta não está conectada, marca sem a outra ponta.
 */
export function TransferPairPicker({
  transaction: t,
  busy,
  onPick,
  onCancel,
}: {
  readonly transaction: TransactionDto;
  readonly busy: boolean;
  readonly onPick: (counterpartId?: string) => void;
  readonly onCancel: () => void;
}) {
  const { finance } = useServices();
  const accountName = useAccountNames();
  const search = {
    from: shiftDate(t.occurredOn, -WINDOW_DAYS),
    to: shiftDate(t.occurredOn, WINDOW_DAYS),
    limit: 200,
  };
  const query = useQuery({
    queryKey: financeKeys.transactions(search),
    queryFn: () => finance.transactions(search),
  });
  const candidates = transferCandidates(t, query.data?.items ?? []);

  return (
    <fieldset className="pair-picker">
      <legend>Outra ponta da transferência</legend>
      <p className="hint">
        Escolha a transação da outra conta, com o mesmo valor e até {WINDOW_DAYS} dias de diferença. As duas deixam de
        contar como entrada ou gasto.
      </p>
      {query.isPending && <p className="hint">Procurando…</p>}
      {query.isError && <p className="error">Não foi possível buscar as transações.</p>}
      {query.isSuccess && candidates.length === 0 && (
        <p className="hint">Nenhuma transação de outra conta com o valor oposto nesses dias.</p>
      )}
      {candidates.length > 0 && (
        <ul className="pair-candidates">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(c.id)}
                aria-label={`Ligar a ${c.description}, ${accountName(c.accountId)}, ${formatDate(c.occurredOn)}`}
              >
                <span className="tx-date">{formatDate(c.occurredOn)}</span>
                <span className="tx-main">
                  <span className="tx-description">{c.description}</span>
                  <span className="hint">
                    {accountName(c.accountId)}
                    {c.classification === 'internal_transfer' ? ' · já ligada a outra (será trocada)' : ''}
                  </span>
                </span>
                <Amount cents={c.amount.cents} classification={c.classification} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pair-actions">
        <button type="button" disabled={busy} onClick={() => onPick(undefined)}>
          A outra conta não está no app
        </button>
        <button type="button" className="link" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </fieldset>
  );
}
