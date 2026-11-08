/**
 * O que o assistente (Claude Code, via MCP) pode LER. Tudo pronto para leitura por um modelo:
 * valores em reais (número com centavos), chaves em português, sem documentos (CPF/CNPJ) e sem dados brutos.
 * Gastos aparecem como valores positivos; em transações, negativo = saiu da conta.
 */
export type Json = Record<string, unknown>;

export interface TransactionQuery {
  readonly de?: string | undefined;
  readonly ate?: string | undefined;
  readonly categoria?: string | undefined;
  readonly tipo?: 'gasto' | 'entrada' | 'entre_contas' | 'ignorada' | undefined;
  readonly busca?: string | undefined;
  readonly limite: number;
}

export abstract class AssistantData {
  /** Mês (AAAA-MM; padrão: o corrente): entrou, saiu, sobrou, comparação, maiores categorias, fontes de renda. */
  abstract monthSummary(month?: string): Promise<Json>;
  abstract spendingByCategory(month: string | undefined, level: 'grupo' | 'categoria'): Promise<Json>;
  abstract transactions(query: TransactionQuery): Promise<Json>;
  abstract commitments(): Promise<Json>;
  abstract recurring(): Promise<Json>;
  abstract income(months: number): Promise<Json>;
  abstract goals(deadline?: string): Promise<Json>;
}
