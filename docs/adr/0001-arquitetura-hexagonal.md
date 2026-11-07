# 0001. Usar arquitetura hexagonal com Clean Architecture

- Status: Aceito
- Data: 2026-11-07

## Contexto
O app integra provedores externos (Open Finance, IA) que podem mudar, e tem regras de domínio
não triviais (parcelas, transferências internas, viabilidade de metas) que precisam ser testadas
isoladamente.

## Decisão
Organizar cada módulo em `domain`, `application` (casos de uso e portas), `infrastructure`
(adapters de saída) e `presentation` (adapters de entrada). O domínio é TypeScript puro,
orientado a objetos, sem dependência de framework. O NestJS fica restrito aos adapters de entrada
e ao composition root.

## Consequências
- O domínio e os casos de uso são testáveis sem banco, rede ou Nest.
- Trocar o provedor de Open Finance ou acrescentar uma interface (HTTP, MCP) é escrever um adapter.
- Há mais arquivos e mapeamentos (entidade ↔ documento) do que num CRUD direto. É um custo aceito.
