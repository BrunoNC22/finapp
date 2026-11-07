# 0005. Isolar o Open Finance atrás de uma porta, com adapters Pluggy e Demo

- Status: Aceito
- Data: 2026-11-07

## Contexto
Pessoas físicas não acessam o Open Finance diretamente. É preciso um agregador. A Pluggy oferece o
"Meu Pluggy", gratuito para uso pessoal, que entrega contas, transações e metadados de parcelas de
cartão. O projeto também precisa funcionar para quem só quer ver o app ou rodar os testes.

## Decisão
Declarar a porta `OpenFinanceProvider` na camada de aplicação, com dois adapters:
- `PluggyOpenFinanceProvider` para dados reais (credenciais no `.env` da instância);
- `DemoOpenFinanceProvider`, que gera dados sintéticos e deterministas.

O adapter é escolhido por `OPEN_FINANCE_PROVIDER`.

## Consequências
- O agregador vê os dados do usuário. É inerente ao Open Finance via terceiros.
- Testes do adapter Pluggy usam fixtures **sintéticas** construídas a partir da documentação, nunca respostas reais gravadas.
- Trocar de agregador não afeta domínio nem casos de uso.
