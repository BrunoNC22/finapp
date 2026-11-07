# finapp

Inteligência financeira pessoal, **self-hosted**. O finapp junta suas contas e cartões via Open Finance e mostra com o que, quando e quanto você gasta: por categoria, por conta, à vista ou parcelado. Depois confronta isso com as suas **metas** (uma compra financiada ou um estilo de vida que você quer sustentar). Um assistente de IA (Claude, via MCP) usa esses dados para apontar o que está pesando e o que dá para mudar.

> **Status:** em construção. API base (NestJS + Fastify + MongoDB) pronta; próximo passo: domínio de contas e transações.

## Princípios

- **Seus dados ficam com você.** O app roda na sua máquina, os dados ficam num cofre criptografado (LUKS) e o acesso é só pela sua VPN. Não há nuvem.
- **Domínio primeiro.** Arquitetura hexagonal, TypeScript orientado a objetos, TDD.
- **Dinheiro é inteiro.** Todo valor é tratado em centavos, sem `float`.

## Stack

|        |                                                |
| ------ | ---------------------------------------------- |
| API    | NestJS · TypeScript                            |
| Banco  | MongoDB 8 (em container LUKS)                  |
| Web    | React · Vite · TanStack Query · Chart.js · PWA |
| IA     | Servidor MCP consumido pelo Claude Code        |
| Testes | Vitest com dublês de teste escritos à mão      |
| Infra  | Docker Compose · Tailscale · restic            |

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Decisões (ADRs)](docs/adr/README.md)
- [Operação de uma instância](docs/operacao.md)

## Rodando

```sh
corepack enable
pnpm install          # também ativa os git hooks de segurança
pnpm check            # lint, fronteiras de arquitetura, tipos e testes
```

Para subir a sua própria instância, veja [docs/operacao.md](docs/operacao.md).

## Licença

[MIT](LICENSE)
