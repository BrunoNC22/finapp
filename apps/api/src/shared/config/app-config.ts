import { z } from 'zod';

export class InvalidConfigError extends Error {
  constructor(problems: readonly string[]) {
    super(`Configuração inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'InvalidConfigError';
  }
}

export type OpenFinanceConfig =
  | { readonly provider: 'demo' }
  | {
      readonly provider: 'pluggy';
      readonly clientId: string;
      readonly clientSecret: string;
      readonly itemIds: readonly string[];
    };

type Env = Readonly<Record<string, string | undefined>>;

/** Variáveis vazias (`FOO=` no .env) contam como ausentes. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema);

const schema = z.object({
  NODE_ENV: optional(z.enum(['development', 'test', 'production']).default('development')),
  HOST: optional(z.string().default('0.0.0.0')),
  PORT: optional(z.coerce.number().int().min(1).max(65535).default(3000)),
  LOG_LEVEL: optional(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')),
  // Ausência é tratada em crossFieldProblems; aqui só o formato.
  MONGO_URL: optional(
    z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//)
      .optional(),
  ),
  MONGO_DB_NAME: optional(z.string().min(1).default('finapp')),
  OPEN_FINANCE_PROVIDER: optional(z.enum(['demo', 'pluggy']).default('demo')),
  SYNC_INTERVAL_HOURS: optional(z.coerce.number().min(0).max(168).default(6)),
  PLUGGY_CLIENT_ID: optional(z.string().optional()),
  PLUGGY_CLIENT_SECRET: optional(z.string().optional()),
  PLUGGY_ITEM_IDS: optional(z.string().optional()),
});

/**
 * Configuração da aplicação, validada uma única vez no boot.
 * Mensagens de erro citam só o NOME da variável e o problema, nunca o valor (pode ser segredo).
 */
export class AppConfig {
  private constructor(
    readonly nodeEnv: 'development' | 'test' | 'production',
    readonly http: { readonly host: string; readonly port: number },
    readonly logLevel: string,
    readonly mongo: { readonly url: string; readonly dbName: string },
    readonly openFinance: OpenFinanceConfig,
    /** Sincronização automática: intervalo em horas (0 = desligada). */
    readonly sync: { readonly intervalHours: number },
  ) {
    Object.freeze(this.http);
    Object.freeze(this.mongo);
    Object.freeze(this.openFinance);
    Object.freeze(this.sync);
    Object.freeze(this);
  }

  static fromEnv(env: Env): AppConfig {
    const parsed = schema.safeParse(env);
    // Regras entre variáveis são checadas à parte: o Zod não roda refinamentos quando já há erros,
    // e queremos listar TODOS os problemas de uma vez.
    const problems = [
      ...(parsed.success
        ? []
        : parsed.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${AppConfig.describe(i)}`)),
      ...AppConfig.crossFieldProblems(env),
    ];
    if (!parsed.success || problems.length > 0) throw new InvalidConfigError(problems);
    const e = parsed.data;
    const openFinance: OpenFinanceConfig =
      e.OPEN_FINANCE_PROVIDER === 'pluggy'
        ? {
            provider: 'pluggy',
            clientId: e.PLUGGY_CLIENT_ID as string,
            clientSecret: e.PLUGGY_CLIENT_SECRET as string,
            itemIds: Object.freeze(
              (e.PLUGGY_ITEM_IDS as string)
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean),
            ),
          }
        : { provider: 'demo' };
    return new AppConfig(
      e.NODE_ENV,
      { host: e.HOST, port: e.PORT },
      e.LOG_LEVEL,
      { url: e.MONGO_URL as string, dbName: e.MONGO_DB_NAME },
      openFinance,
      { intervalHours: e.SYNC_INTERVAL_HOURS },
    );
  }

  private static crossFieldProblems(env: Env): string[] {
    const present = (key: string) => (env[key] ?? '') !== '';
    const problems: string[] = [];
    if (!present('MONGO_URL')) problems.push('MONGO_URL: obrigatória');
    if (env.OPEN_FINANCE_PROVIDER === 'pluggy') {
      for (const key of ['PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_SECRET', 'PLUGGY_ITEM_IDS']) {
        if (!present(key)) problems.push(`${key}: obrigatória quando OPEN_FINANCE_PROVIDER=pluggy`);
      }
    }
    return problems;
  }

  /** Descreve o problema sem repetir o valor recebido. */
  private static describe(issue: z.core.$ZodIssue): string {
    switch (issue.code) {
      case 'invalid_type':
        return `tipo inválido (esperado ${issue.expected})`;
      case 'invalid_value':
        return `valor não permitido (opções: ${issue.values.map(String).join(', ')})`;
      case 'too_small':
      case 'too_big':
        return 'fora do intervalo permitido';
      case 'invalid_format':
        return 'formato inválido';
      case 'custom':
        return issue.message;
      default:
        return 'inválida';
    }
  }
}
