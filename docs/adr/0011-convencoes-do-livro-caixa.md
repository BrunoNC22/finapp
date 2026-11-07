# 0011. Convenções do livro-caixa: sinal, classificação e precedência

- Status: Aceito
- Data: 2026-11-07

## Contexto

Os dados de Open Finance chegam com convenções diferentes por tipo de conta (no cartão, a compra vem positiva e o pagamento negativo). As datas vêm como instantes UTC, e documentos de terceiros podem vir mascarados. O dinheiro do usuário também circula entre várias contas dele próprio. Os relatórios e as metas precisam de uma única forma de ler tudo isso, e as correções feitas pelo usuário não podem ser desfeitas pela automação.

## Decisão

- **Sinal único, do ponto de vista do usuário:** negativo = dinheiro saindo (inclusive compra no cartão); positivo = entrando. O adapter do provedor converte.
- **Datas de calendário** (`LocalDate`) no fuso do usuário. Um instante UTC é convertido explicitamente no adapter (`LocalDate.fromInstant`).
- **Classificação** ∈ `income | expense | internal_transfer | ignored`. A classificação padrão vem da forma de pagamento:
  - pagamento de fatura → `internal_transfer` (dos dois lados);
  - estorno → `expense` com valor positivo (abate o gasto da categoria, não é renda);
  - rendimento e cashback → `income`;
  - demais → pelo sinal.
- **Transferência interna pode não ter par** (conta própria não conectada, ou histórico que começa em datas diferentes). O par (`transferLink`) liga as pontas, mas não é condição para classificar.
- **Precedência:** classificação `manual > matcher > default`; categoria `manual > rule > provider`. A automação nunca sobrescreve uma decisão de precedência maior, e os métodos de domínio retornam `false` quando não aplicam.
- **`Document`** (CPF/CNPJ) aceita dígitos mascarados (`*`) e só considera dois documentos iguais quando ambos estão completos. Nunca se imprime (`toString`/`toJSON` ocultam o número).
- **Parcela** (`Installment`): quando o provedor não informa o total da compra (caso do Open Finance), o total é estimado como parcela × n e marcado como estimado.
- O **payload bruto** do provedor não faz parte da entidade. Ele é guardado ao lado do documento persistido (ver a issue dos adapters de MongoDB).

## Consequências

- Relatórios somam `income` e `expense` sem precisar conhecer o tipo da conta.
- Os repositórios guardam snapshots `(props, state)`. A suíte de contrato garante a mesma semântica no fake em memória e no MongoDB.
