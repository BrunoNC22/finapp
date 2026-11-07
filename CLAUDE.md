# finapp: instruções para assistentes de código

Leia `docs/arquitetura.md` e `docs/adr/` antes de mudar a estrutura.

## Regras inegociáveis

- **Nenhum dado pessoal neste repositório.** Nada de nomes reais, valores reais, instituições ou contas de alguém, caminhos de máquina ou metas pessoais, nem em código, testes, docs, commits ou nomes de arquivo. Fixtures e exemplos são sintéticos. Contexto pessoal, se existir, vem de `CLAUDE.local.md` (ignorado pelo git) e **nunca** é copiado para arquivos versionados.
- **Dinheiro é `Money` (centavos inteiros).** Nunca use `number` com casas decimais para valores monetários no domínio.
- **TDD:** escreva o teste que falha, depois o código mínimo para passar, depois refatore.
- **Dublês de teste escritos à mão** (fakes, stubs, spies) que implementam as portas. `vi.fn`/`vi.mock` só quando um dublê manual não for viável.

## Camadas

- `domain/` é TypeScript puro: sem NestJS, sem driver de banco, sem I/O.
- `application/` contém casos de uso e declara as **portas** (interfaces) de que precisa.
- `infrastructure/` contém adapters de saída. `presentation/` contém adapters de entrada (HTTP, MCP).
- O NestJS só aparece em `presentation/` e nos `*.module.ts` (composição). Casos de uso e adapters **não** têm decorators: são registrados por fábrica (`useFactory`) no módulo.
- Portas são **classes abstratas** (servem de token de injeção sem strings mágicas).
- As fronteiras são verificadas por `pnpm arch` (dependency-cruiser, `.dependency-cruiser.cjs`). Não desligue regras para "fazer passar".

## Convenções

- Código e identificadores em inglês. Documentação em português.
- Testes ao lado do código: `money.ts` ↔ `money.spec.ts`. E2E: `*.e2e-spec.ts`. Dublês reutilizáveis em `apps/api/test/doubles/`.
- **ESM nativo** (NestJS 12 é ESM-only): imports relativos sempre com extensão `.js`.
- Configuração só via `AppConfig.fromEnv` (validada no boot; mensagens nunca ecoam valores).
- Logs: nunca registrar valores, descrições ou payloads financeiros (veja `REDACTED_PATHS`).
- Gráficos: todo o tema do Chart.js vive em `apps/web/src/lib/charts/chart-config.ts`.

## Comandos

```sh
pnpm check        # lint + arquitetura + tipos + testes (rode antes de commitar)
pnpm test         # todos os testes
pnpm -F api test  # só a API
pnpm format       # formata e organiza imports (Biome)
pnpm build        # build de produção
docker compose up -d --build api   # API em container (exige o cofre aberto para o Mongo)
```

Sem `pnpm` no PATH, use `corepack pnpm …`.
