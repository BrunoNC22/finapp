# Arquitetura do finapp

O finapp é um app **self-hosted** de inteligência financeira pessoal. Ele faz quatro coisas:

1. Agrega contas e cartões via **Open Finance**.
2. Mostra **para onde o dinheiro vai**: por categoria, por conta, à vista ou parcelado.
3. Confronta isso com **metas**. Uma meta pode ser uma compra financiada ou um estilo de vida com custo mensal.
4. Expõe tudo a um **assistente de IA** (Claude, via MCP), que analisa os gastos e sugere caminhos.

Decisões individuais estão registradas em [`docs/adr/`](adr/README.md).

## Núcleos de domínio

| Módulo      | Responsabilidade                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger`    | Contas, transações, faturas, parcelas, categorias e regras de categorização. Detecta **transferências internas** entre contas do próprio usuário (inclusive pagamento de fatura), para que o mesmo dinheiro não seja contado como renda ou gasto mais de uma vez. |
| `planning`  | **Renda**: fontes com valor, período e risco, e os cenários piso, provável e otimista. **Metas**: compras (entrada, parcelas, juros, custos recorrentes) e estilo de vida; viabilidade em cada cenário e a renda necessária.                                      |
| `career`    | Perfil profissional e quadro de oportunidades de renda.                                                                                                                                                                                                           |
| `routine`   | Rotina mensal: lembra da análise do último mês fechado até ela ser registrada.                                                                                                                                                                                    |
| `assistant` | Servidor MCP para o Claude Code (leitura; escrita com token de escrita e auditoria) e o pacote da análise mensal.                                                                                                                                                 |
| `identity`  | Autenticação do (único) usuário da instância: senha, passkey, sessões e tokens do MCP.                                                                                                                                                                            |
| `demo`      | Modo demonstração: prepara uma instância vazia com uma pessoa fictícia.                                                                                                                                                                                           |

## Camadas (arquitetura hexagonal)

```
                  ┌──────────────────────── adapters de entrada ───────────────────────┐
                  │  HTTP (NestJS controllers)   MCP server (Claude Code)   jobs (sync) │
                  └──────────────────────────────────┬─────────────────────────────────┘
                                                     │ chamam
                  ┌──────────────────────────────────▼─────────────────────────────────┐
                  │ application: casos de uso + PORTAS (interfaces)                     │
                  │   SyncAccounts, CategorizeTransaction, GetSpendingReport, …         │
                  │   TransactionRepository, OpenFinanceProvider, Clock, …              │
                  ├─────────────────────────────────────────────────────────────────────┤
                  │ domain: entidades e value objects puros (sem framework, sem I/O)    │
                  │   Money, Transaction, Installment, Goal, InternalTransferMatcher, … │
                  └──────────────────────────────────▲─────────────────────────────────┘
                                                     │ implementam portas
                  ┌──────────────────────────────────┴─────────────────────────────────┐
                  │  MongoDB repositories   Pluggy provider   Demo provider   relógio   │
                  └──────────────────────── adapters de saída ─────────────────────────┘
```

Regras:

- `domain` não importa nada de fora do próprio domínio (nem NestJS, nem driver do Mongo).
- `application` depende só de `domain` e das **portas** que ela mesma declara.
- O NestJS aparece apenas em `presentation/` e no _composition root_ (módulos Nest que ligam portas a adapters).
- Cada módulo segue a mesma estrutura:

```
apps/api/src/modules/<módulo>/
  domain/          entidades, value objects, serviços de domínio
  application/     casos de uso e portas
  infrastructure/  adapters de saída (Mongo, Pluggy, …)
  presentation/    adapters de entrada (HTTP, MCP)
apps/api/src/shared/kernel/   Money, erros de domínio e tipos comuns
```

## Fluxo de dados

```
Open Finance ──(Pluggy API)──▶ PluggyOpenFinanceProvider ──▶ SyncAccounts
                                                                  │ upsert por id externo
                                                                  ▼ (idempotente, payload bruto preservado)
                                                               MongoDB
                                                                  │
         categorização · detecção de transferências · agrupamento de parcelas
                                                                  │
                        ┌─────────────────────────────────────────┼───────────────┐
                        ▼                                         ▼               ▼
                  API HTTP → web (React)                   MCP → Claude Code   relatórios
```

- A sincronização roda periodicamente e sob demanda. A cada execução ela revisita uma janela que **sobrepõe** a anterior, então funciona sem webhooks e sem endpoint público.
- O Open Finance não fornece um id que ligue as parcelas de uma mesma compra. O agrupamento é feito por heurística no domínio (número da parcela, total de parcelas, valor total e estabelecimento).
- O dinheiro é representado em **centavos inteiros** (`Money`) da borda até o banco.

## Segurança

| Ameaça                                    | Mitigação                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App exposto na internet                   | Nenhuma porta publicada. O acesso é só por VPN mesh (Tailscale), via `tailscale serve` com HTTPS.                                                                        |
| Acesso indevido dentro da rede            | Autenticação própria no app (defesa em profundidade).                                                                                                                    |
| Disco furtado ou descartado               | Dados do Mongo dentro de um **container LUKS2** (`scripts/vault.sh`).                                                                                                    |
| Banco subir sem o cofre e gravar em claro | Ponto de montagem com `chattr +i` e bind mount com `create_host_path: false`.                                                                                            |
| Backup vazado                             | `restic` com criptografia do lado do cliente. O dump vai direto do `mongodump` para o restic, sem passar pelo disco.                                                     |
| Segredos ou dados pessoais no git         | `.gitignore` estrito, `gitleaks` com regras para CPF, CNPJ e conta (hook de pre-commit e CI) e _denylist_ pessoal opcional fora do repo. Fixtures são sempre sintéticas. |
| Exposição ao assistente de IA             | O Claude não acessa o banco. Ele chama **ferramentas** que reutilizam os casos de uso e devolvem preferencialmente agregados.                                            |

## Frontend

React + Vite + TanStack Query, distribuído como **PWA**. Os gráficos usam **Chart.js** (via `react-chartjs-2`), com todo o tema (cores, fontes, tooltips, legendas, formatação de moeda) centralizado em **um único arquivo**, `apps/web/src/lib/charts/chart-config.ts`. Ver [ADR 0007](adr/0007-chartjs-com-configuracao-centralizada.md).

## Modo demo

O `DemoOpenFinanceProvider` implementa a mesma porta do provider real e gera uma pessoa fictícia com 12 meses de
histórico, parcelas e os casos difíceis de conciliação. Ele é usado nos testes e no **modo demonstração**
(`compose.demo.yaml`, `corepack pnpm demo`): com `DEMO_PASSWORD` definido, o módulo `demo` cria o acesso, sincroniza e
cadastra renda, metas e carreira fictícias pelos mesmos casos de uso da tela, e a tela de login mostra a senha. A
configuração recusa `DEMO_PASSWORD` junto com o provider real. Os prints do README saem desse modo.

## Composição e convenções da API

- **NestJS 12 (ESM) sobre Fastify**, TypeScript 7 com build por `tsc` ([ADR 0010](adr/0010-plataforma-da-api.md)).
- **Composition root:** `AppModule` importa `ConfigModule` (global), `LoggingModule`, `MongoModule` (global: `MongoClient` e `Db`) e os módulos de funcionalidade.
- **Casos de uso e adapters sem decorators.** Cada `*.module.ts` os registra por fábrica, ligando a porta (classe abstrata) ao adapter:

  ```ts
  { provide: DatabaseHealth, useFactory: (db: Db) => new MongoDatabaseHealth(db), inject: [Db] }
  ```

- **Configuração** validada uma vez no boot (`AppConfig.fromEnv`, com zod). Se for inválida, a API não sobe, e a mensagem cita só os nomes das variáveis.
- **Logs** estruturados (pino) com _redaction_ de credenciais e de qualquer campo financeiro. Não há log de corpo de requisição.
- **Resiliência:** a API sobe mesmo com o Mongo fora do ar. O `GET /health` responde `503 degraded` até o banco voltar.
- **Fronteiras verificadas no CI** por dependency-cruiser (`pnpm arch`): domínio puro; application sem adapters nem frameworks; módulos conversam só pela camada `application`; nada de código de teste em produção; sem ciclos.
- **Container:** imagem multi-stage, usuário não-root, `HEALTHCHECK` no `/health`. A API está nas redes `data` (interna, com o Mongo) e `egress` (saída para o provedor de Open Finance). Nenhuma porta é publicada.
