/**
 * Registro de toda chamada a ferramenta MCP de ESCRITA (ADR 0014): quando, por qual token (rótulo), qual ferramenta,
 * com quais argumentos e se deu certo. Serve para saber o que o assistente mudou e desfazer à mão se preciso.
 */
export interface McpAuditEntry {
  readonly at: Date;
  /** Rótulo do token que fez a chamada. */
  readonly token: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly outcome: 'ok' | 'erro';
  /** Mensagem devolvida ao assistente quando deu erro (nunca detalhe interno). */
  readonly error?: string;
}

export abstract class McpAuditLog {
  abstract record(entry: McpAuditEntry): Promise<void>;
  /** As mais recentes primeiro. */
  abstract recent(limit: number): Promise<McpAuditEntry[]>;
}

/** Argumentos grandes (ex.: currículo) não precisam ir inteiros para a auditoria. */
export const MAX_AUDITED_ARGS_CHARS = 4000;

export function auditableArgs(args: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(args);
  return json.length <= MAX_AUDITED_ARGS_CHARS ? args : { truncado: json.slice(0, MAX_AUDITED_ARGS_CHARS) };
}
