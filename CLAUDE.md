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
- O NestJS só aparece em `presentation/` e nos módulos de composição.

## Convenções

- Código e identificadores em inglês. Documentação em português.
- Testes ao lado do código: `money.ts` ↔ `money.spec.ts`.
- Gráficos: todo o tema do Chart.js vive em `apps/web/src/lib/charts/chart-config.ts`.

## Comandos

```sh
pnpm test         # todos os testes
pnpm -F api test  # só a API
```
