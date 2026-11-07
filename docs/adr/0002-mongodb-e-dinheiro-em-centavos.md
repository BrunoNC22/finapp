# 0002. Usar MongoDB e representar dinheiro em centavos inteiros

- Status: Aceito
- Data: 2026-11-07

## Contexto
Os dados vêm do provedor de Open Finance em JSON com formatos que variam por instituição, e as
metas têm estruturas diferentes (compra, estilo de vida). O volume é de uma pessoa: milhares de
transações por ano. Valores monetários em ponto flutuante acumulam erro.

## Decisão
- MongoDB 8. Cada transação guarda o documento normalizado **e** o payload bruto do provedor,
  para reprocessamento futuro sem nova sincronização.
- Todo valor monetário é um value object `Money` com **centavos inteiros** (moeda única: BRL).
  A conversão de decimal acontece só na borda (`Money.fromReais`), e a formatação só na apresentação.

## Consequências
- Relatórios usam o aggregation pipeline do Mongo.
- Nenhum `float` de dinheiro circula pelo domínio. Divisões usam `Money.allocate`, que não perde centavos.
- Multimoeda exigirá um novo ADR.
