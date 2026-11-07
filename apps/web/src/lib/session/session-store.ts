/**
 * Sessão como app de banco: o token vive SÓ EM MEMÓRIA (nada de cookie, localStorage ou
 * sessionStorage). Fechou ou recarregou o app, precisa entrar de novo.
 * Também espelha a regra do servidor: sem uso por `idleMinutes`, a sessão acaba.
 */
export type SessionState = { status: 'signed-out'; reason?: 'expired' | 'logout' } | { status: 'signed-in' };

export class SessionStore {
  private token: string | undefined;
  private idleMs = 10 * 60_000;
  private lastActivity = 0;
  private state: SessionState = { status: 'signed-out' };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  signIn(token: string, idleMinutes: number): void {
    this.token = token;
    this.idleMs = idleMinutes * 60_000;
    this.lastActivity = this.now();
    this.set({ status: 'signed-in' });
  }

  /** Token para a próxima requisição, ou undefined se a sessão acabou por inatividade. */
  currentToken(): string | undefined {
    if (this.token && this.now() - this.lastActivity >= this.idleMs) this.expire();
    return this.token;
  }

  /** Uma requisição bem-sucedida renova a janela (o servidor faz o mesmo). */
  touch(): void {
    if (this.token) this.lastActivity = this.now();
  }

  /** Chamado num 401 do servidor ou quando a inatividade passa do limite. */
  expire(): void {
    this.clear({ status: 'signed-out', reason: 'expired' });
  }

  signOut(): void {
    this.clear({ status: 'signed-out', reason: 'logout' });
  }

  /** Verificação periódica (a tela trava sozinha, mesmo sem requisições). */
  checkIdle(): void {
    this.currentToken();
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private clear(state: SessionState): void {
    if (!this.token && this.state.status === 'signed-out') return;
    this.token = undefined;
    this.set(state);
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
