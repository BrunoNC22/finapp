import type { TransactionDto } from '@finapp/contracts';
import { formatCents } from '../../lib/format';

/** Valor com cor pelo significado: entrada verde, gasto neutro, entre contas/ignorada esmaecido. */
export function Amount({
  cents,
  classification,
}: {
  readonly cents: number;
  readonly classification?: TransactionDto['classification'];
}) {
  const tone =
    classification === 'internal_transfer' || classification === 'ignored'
      ? 'muted'
      : cents > 0
        ? 'positive'
        : 'negative';
  return <span className={`amount amount-${tone}`}>{formatCents(cents)}</span>;
}
