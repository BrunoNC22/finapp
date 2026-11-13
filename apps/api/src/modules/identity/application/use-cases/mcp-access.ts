import type { Clock } from '../../../../shared/application/clock.js';
import type { McpGrant, McpScope, McpTokenInfo, McpTokenStore, SecretTokens } from '../ports/identity-ports.js';

/**
 * Acesso do assistente (Claude Code via MCP) ao app. É separado do login: a sessão de login expira em minutos
 * (como app de banco); o token MCP vale até ser revogado e é gerado no servidor (CLI), mostrado uma única vez.
 * Escopo `leitura` (padrão) só enxerga as ferramentas de leitura; `escrita` também as que alteram dados (ADR 0014).
 */
export class McpAccess {
  constructor(
    private readonly store: McpTokenStore,
    private readonly tokens: SecretTokens,
    private readonly clock: Clock,
  ) {}

  async issue(label: string, scope: McpScope = 'leitura'): Promise<string> {
    const { token, hash } = this.tokens.generate();
    await this.store.add(hash, label.trim() || 'Claude Code', this.clock.now(), scope);
    return token;
  }

  async verify(token: string | undefined): Promise<McpGrant | undefined> {
    if (!token) return undefined;
    return this.store.use(this.tokens.hashOf(token), this.clock.now());
  }

  list(): Promise<McpTokenInfo[]> {
    return this.store.list();
  }

  revokeAll(): Promise<number> {
    return this.store.revokeAll();
  }
}
