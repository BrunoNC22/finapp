# Architecture Decision Records

Cada ADR registra **uma** decisão técnica: o contexto, o que foi decidido e as consequências. ADRs não são editados depois de aceitos. Se a decisão mudar, um novo ADR o substitui.

| #                                                      | Decisão                                                       | Status |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------ |
| [0001](0001-arquitetura-hexagonal.md)                  | Arquitetura hexagonal com Clean Architecture                  | Aceito |
| [0002](0002-mongodb-e-dinheiro-em-centavos.md)         | MongoDB e dinheiro em centavos inteiros                       | Aceito |
| [0003](0003-self-hosted-acessivel-so-por-vpn.md)       | Self-hosted, acessível só por VPN                             | Aceito |
| [0004](0004-dados-em-repouso-em-container-luks.md)     | Dados em repouso em container LUKS e backup com restic        | Aceito |
| [0005](0005-open-finance-atras-de-uma-porta.md)        | Open Finance atrás de uma porta, com Pluggy e Demo            | Aceito |
| [0006](0006-vitest-e-dubles-de-teste-manuais.md)       | Vitest e dublês de teste escritos à mão                       | Aceito |
| [0007](0007-chartjs-com-configuracao-centralizada.md)  | Chart.js com configuração centralizada                        | Aceito |
| [0008](0008-assistente-de-ia-via-mcp.md)               | Assistente de IA via MCP                                      | Aceito |
| [0009](0009-repositorio-publico-sem-dados-pessoais.md) | Repositório público sem dados pessoais                        | Aceito |
| [0010](0010-plataforma-da-api.md)                      | NestJS 12 (ESM) sobre Fastify, TypeScript 7 e Biome           | Aceito |
| [0011](0011-convencoes-do-livro-caixa.md)              | Convenções do livro-caixa: sinal, classificação e precedência | Aceito |
| [0012](0012-autenticacao-estilo-app-de-banco.md)       | Autenticação no estilo app de banco                           | Aceito |

## Modelo

```md
# NNNN. Título no imperativo

- Status: Proposto | Aceito | Substituído por NNNN
- Data: AAAA-MM-DD

## Contexto

## Decisão

## Consequências
```
