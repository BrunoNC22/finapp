import type { Clock } from '../../../../shared/application/clock.js';
import type { McpTokenInfo, McpTokenStore, SecretTokens } from '../ports/identity-ports.js';

/**
 * Acesso de leitura do assistente (Claude Code via MCP) aos dados financeiros. É separado do login:
 * a sessão de login expira em minutos (como app de banco); o token MCP vale até ser revogado, só lê,
 * e é gerado no servidor (CLI), mostrado uma única vez.
 */
export class McpAccess {
  constructor(
    private readonly store: McpTokenStore,
    private readonly tokens: SecretTokens,
    private readonly clock: Clock,
  ) {}

  async issue(label: string): Promise<string> {
    const { token, hash } = this.tokens.generate();
    await this.store.add(hash, label.trim() || 'Claude Code', this.clock.now());
    return token;
  }

  async verify(token: string | undefined): Promise<boolean> {
    if (!token) return false;
    return this.store.use(this.tokens.hashOf(token), this.clock.now());
  }

  list(): Promise<McpTokenInfo[]> {
    return this.store.list();
  }

  revokeAll(): Promise<number> {
    return this.store.revokeAll();
  }
}
