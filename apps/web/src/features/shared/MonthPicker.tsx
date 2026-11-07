import { addMonths, formatMonthLong, type Month } from '../../lib/months';

/** ‹ outubro de 2026 › — não deixa avançar além do mês corrente. */
export function MonthPicker({
  month,
  latest,
  onChange,
}: {
  readonly month: Month;
  readonly latest: Month;
  readonly onChange: (month: Month) => void;
}) {
  return (
    <div className="month-picker">
      <button type="button" aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>
        ‹
      </button>
      <strong aria-live="polite">{formatMonthLong(month)}</strong>
      <button
        type="button"
        aria-label="Próximo mês"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={month >= latest}
      >
        ›
      </button>
    </div>
  );
}
