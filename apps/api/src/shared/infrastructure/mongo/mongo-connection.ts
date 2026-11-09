import type { MongoClient } from 'mongodb';

/**
 * Mantém o cliente do MongoDB conectável. No driver, se a PRIMEIRA conexão falha (ex.: a API subiu antes do cofre
 * ser aberto), o cliente fica fechado para sempre ("Topology is closed"). Aqui a conexão é tentada no boot e de
 * novo a cada `retryMs` até dar certo; depois disso, quedas do banco o próprio driver resolve ao reconectar.
 */
export class MongoConnection {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private connected = false;

  constructor(
    private readonly client: MongoClient,
    private readonly options: { retryMs: number; onRetry?: (error: Error) => void; onConnected?: () => void } = {
      retryMs: 5_000,
    },
  ) {}

  get isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    void this.attempt();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private async attempt(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.client.connect();
      if (this.stopped) return;
      this.connected = true;
      this.options.onConnected?.();
    } catch (error) {
      if (this.stopped) return;
      this.options.onRetry?.(error as Error);
      this.timer = setTimeout(() => void this.attempt(), this.options.retryMs);
      this.timer.unref();
    }
  }
}
