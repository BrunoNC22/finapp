export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class PluggyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PluggyApiError';
  }
}

export interface PluggyClientOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly baseUrl?: string;
  readonly fetch?: Fetch;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  /** Injetável para testes não esperarem de verdade. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Cliente HTTP mínimo da API da Pluggy.
 * - Autentica sob demanda e reaproveita a chave; renova uma vez ao receber 401 (a validade não é documentada).
 * - Repete 429/5xx e falhas de rede com espera exponencial.
 * - Mensagens de erro sem query string, sem corpo e sem segredos.
 */
export class PluggyClient {
  private apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetch: Fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: PluggyClientOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.pluggy.ai';
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async get<T>(path: string): Promise<T> {
    this.apiKey ??= await this.authenticate();
    let response = await this.request(path, { headers: { 'X-API-KEY': this.apiKey } });
    if (response.status === 401) {
      this.apiKey = await this.authenticate();
      response = await this.request(path, { headers: { 'X-API-KEY': this.apiKey } });
    }
    if (!response.ok)
      throw new PluggyApiError(response.status, `Pluggy respondeu ${response.status} em ${safePath(path)}`);
    return (await response.json()) as T;
  }

  private async authenticate(): Promise<string> {
    const response = await this.request('/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: this.options.clientId, clientSecret: this.options.clientSecret }),
    });
    if (!response.ok) throw new PluggyApiError(response.status, `autenticação na Pluggy falhou (${response.status})`);
    const body = (await response.json()) as { apiKey?: string };
    if (!body.apiKey) throw new PluggyApiError(response.status, 'autenticação na Pluggy não devolveu apiKey');
    return body.apiKey;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.fetch(this.baseUrl + path, {
          ...init,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        return response;
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw new PluggyApiError(0, `sem resposta da Pluggy em ${safePath(path)} (${(error as Error).name})`);
        }
        await this.sleep(500 * 2 ** attempt);
      }
    }
  }
}

function safePath(path: string): string {
  return path.split('?')[0] ?? path;
}
