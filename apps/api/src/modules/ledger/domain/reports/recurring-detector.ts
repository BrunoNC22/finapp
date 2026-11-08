import type { LocalDate } from '../../../../shared/kernel/local-date.js';
import { Money } from '../../../../shared/kernel/money.js';
import { foldText } from '../categorization/categorization-rule.js';
import { normalizeMerchant } from '../services/installment-grouper.js';
import type { Transaction } from '../transaction.js';

export interface Recurring {
  /** Identificador estável (para o usuário dispensar: "não é recorrente"). */
  readonly key: string;
  readonly label: string;
  readonly occurrences: number;
  /** Valor típico (mediana), positivo. */
  readonly typicalAmount: Money;
  readonly intervalDays: number;
  readonly lastOn: LocalDate;
  readonly nextExpectedOn: LocalDate;
  readonly annualCost: Money;
  readonly categoryId?: string;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};

/**
 * Encontra gastos que se repetem todo mês (assinaturas, contas, aluguel por Pix…).
 * Critérios: mesmo estabelecimento (ou mesma pessoa, em Pix/TED), valor estável (±10% da mediana),
 * ritmo consistente na sequência mais recente (de 1 semana a ~3 meses), pelo menos 3 ocorrências
 * e ainda ativo (última ocorrência recente). Custo anual proporcional ao intervalo.
 */
export class RecurringDetector {
  constructor(
    private readonly options = {
      minOccurrences: 3,
      /** Variação de valor aceita em torno da mediana. */
      tolerance: 0.1,
      /** Periodicidades aceitas: de semanal a trimestral. */
      minDays: 6,
      maxDays: 95,
      /** Variação de intervalo aceita dentro da sequência recente. */
      rhythmTolerance: 0.35,
    },
  ) {}

  detect(
    transactions: readonly Transaction[],
    asOf: LocalDate,
    dismissed: ReadonlySet<string> = new Set(),
  ): Recurring[] {
    const groups = new Map<string, { label: string; txs: Transaction[] }>();
    for (const t of transactions) {
      if (t.classification !== 'expense' || !t.amount.isNegative()) continue;
      const identity = this.identity(t);
      if (!identity) continue;
      const group = groups.get(identity.key) ?? { label: identity.label, txs: [] };
      group.txs.push(t);
      groups.set(identity.key, group);
    }

    this.mergeVariantDescriptors(groups);

    const found: Recurring[] = [];
    for (const [key, { label, txs }] of groups) {
      if (dismissed.has(key) || txs.length < this.options.minOccurrences) continue;
      const amounts = txs.map((t) => -t.amount.cents);
      const typical = median(amounts);
      const stable = txs
        .filter((t) => Math.abs(-t.amount.cents - typical) <= typical * this.options.tolerance)
        .sort((a, b) => a.occurredOn.toString().localeCompare(b.occurredOn.toString()));
      if (stable.length < this.options.minOccurrences) continue;

      const run = this.latestConsistentRun(stable);
      if (run.length < this.options.minOccurrences) continue;
      const intervals = run.slice(1).map((t, i) => t.occurredOn.daysBetween((run[i] as Transaction).occurredOn));
      const interval = median(intervals);
      if (interval < this.options.minDays || interval > this.options.maxDays) continue;

      const last = run.at(-1) as Transaction;
      if (asOf.daysBetween(last.occurredOn) > interval * 1.5) continue; // parou
      const monthly = interval >= 25 && interval <= 35;

      const categoryId = mostCommon(run.map((t) => t.category?.categoryId).filter((c): c is string => !!c));
      found.push({
        key,
        label,
        occurrences: run.length,
        typicalAmount: Money.fromCents(typical),
        intervalDays: interval,
        lastOn: last.occurredOn,
        nextExpectedOn: monthly ? last.occurredOn.addMonths(1) : last.occurredOn.addDays(interval),
        annualCost: Money.fromCents(monthly ? typical * 12 : Math.round((typical * 365) / interval)),
        ...(categoryId ? { categoryId } : {}),
      });
    }
    return found.sort((a, b) => b.annualCost.cents - a.annualCost.cents);
  }

  /**
   * Maior sequência FINAL com ritmo consistente: o ritmo pode mudar com o tempo
   * (ex.: recarga a cada ~52 dias que virou mensal). Vale o comportamento recente.
   */
  private latestConsistentRun(sorted: readonly Transaction[]): Transaction[] {
    if (sorted.length < 2) return [...sorted];
    const gap = (i: number) =>
      (sorted[i] as Transaction).occurredOn.daysBetween((sorted[i - 1] as Transaction).occurredOn);
    const reference = gap(sorted.length - 1);
    let start = sorted.length - 2;
    while (start > 0 && Math.abs(gap(start) - reference) <= reference * this.options.rhythmTolerance) start--;
    return sorted.slice(start);
  }

  /** Pix/TED: a contraparte define a recorrência (a descrição é genérica: "Pix enviado"). */
  private identity(t: Transaction): { key: string; label: string } | undefined {
    if (t.paymentMethod === 'pix' || t.paymentMethod === 'ted_doc') {
      const name = t.counterparty?.name;
      if (name) return { key: `to:${foldText(name)}`, label: foldText(name) };
      const document = t.counterparty?.document;
      // A chave sai na API: nunca o número do documento, só um hash dele.
      return document && !document.isMasked
        ? { key: `doc:${fnv1a(document.value)}`, label: 'pix recorrente' }
        : undefined;
    }
    const merchant = withoutGatewayPrefix(normalizeMerchant(t.description));
    return merchant ? { key: `m:${merchant}`, label: merchant } : undefined;
  }

  /**
   * O descritor do cartão pode mudar de um mês para o outro (outro gateway, outro código). Grupos
   * pequenos demais para serem detectados sozinhos, da MESMA categoria, são unidos quando a palavra
   * principal ("marca") de um aparece no texto do outro. Grupos já grandes nunca são misturados.
   */
  private mergeVariantDescriptors(groups: Map<string, { label: string; txs: Transaction[] }>): void {
    const small = () =>
      [...groups.entries()]
        .filter(([key, g]) => key.startsWith('m:') && g.txs.length < this.options.minOccurrences)
        .map(([key, g]) => ({ key, group: g, category: mostCommon(categoriesOf(g.txs)), letters: lettersOf(key) }));
    let merged = true;
    while (merged) {
      merged = false;
      const candidates = small();
      outer: for (const a of candidates) {
        if (!a.category) continue;
        for (const b of candidates) {
          if (a.key === b.key || a.category !== b.category) continue;
          if (!sameBrand(a.key, b.letters) && !sameBrand(b.key, a.letters)) continue;
          // Fica a chave/rótulo do grupo maior (empate: o mais recente).
          const [keep, drop] =
            a.group.txs.length > b.group.txs.length ||
            (a.group.txs.length === b.group.txs.length && latest(a.group.txs) >= latest(b.group.txs))
              ? [a, b]
              : [b, a];
          keep.group.txs.push(...drop.group.txs);
          groups.delete(drop.key);
          merged = true;
          break outer;
        }
      }
    }
  }
}

/** Códigos de 1–2 letras que gateways põem antes do nome ("EC LOJA", "DL LOJA"). */
function withoutGatewayPrefix(merchant: string): string {
  const words = merchant.split(' ');
  return words.length >= 3 && (words[0]?.length ?? 0) <= 2 ? words.slice(1).join(' ') : merchant;
}

/** Palavras de localização comuns em descritores: não identificam o estabelecimento. */
const PLACE_WORDS = new Set([
  'sao',
  'paulo',
  'rio',
  'janeiro',
  'brasil',
  'bra',
  'barueri',
  'osasco',
  'campinas',
  'curitiba',
  'belo',
  'horizonte',
  'internet',
]);

/** A palavra mais longa (≥ 6 letras, fora localização) do descritor. */
function brandOf(key: string): string | undefined {
  return key
    .slice(2)
    .split(' ')
    .filter((w) => w.length >= 6 && !PLACE_WORDS.has(w))
    .sort((a, b) => b.length - a.length)[0];
}

const lettersOf = (key: string) => key.slice(2).replace(/[^a-z]/g, '');

function sameBrand(key: string, otherLetters: string): boolean {
  const brand = brandOf(key);
  return !!brand && otherLetters.includes(brand.slice(0, 6));
}

const categoriesOf = (txs: readonly Transaction[]) =>
  txs.map((t) => t.category?.categoryId).filter((c): c is string => !!c);

const latest = (txs: readonly Transaction[]) =>
  txs
    .map((t) => t.occurredOn.toString())
    .sort()
    .at(-1) ?? '';

function mostCommon(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Hash FNV-1a de 32 bits (estável, sem dependências): identifica sem expor o valor original. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
