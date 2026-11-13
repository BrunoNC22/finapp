# 0015 — Revenda de bens nas metas

- Status: aceita
- Data: 2026-11-13

## Contexto

Metas de compra costumam se apoiar umas nas outras: vender a bicicleta elétrica para dar a entrada da moto, ou
vender as peças atuais do computador para comprar peças novas. Até aqui o simulador tratava cada meta como
permanente: o bem comprado nunca saía do orçamento, e a meta seguinte precisava juntar a largada inteira.

## Decisão

- Uma meta pode **vender bens na largada** (`tradeIns`, até 10). A origem do bem é uma de duas:
  - o bem de uma **meta de compra que vem antes na fila**;
  - um **bem que a pessoa já tem** (nome e valor de hoje).
- **Valor na venda:** desvalorização anual informada pela pessoa, **composta mês a mês**.
  - Para o bem de uma meta, o cálculo parte do preço, a contar do mês em que aquela meta começa.
  - Para o bem atual, parte do valor de hoje.
  - O cálculo acontece no mês em que a meta que vende começa, **em cada cenário**. Assim, uma venda mais tardia
    (como no cenário piso) vale menos.
- **Parcelas em aberto:** o saldo devedor do bem é **quitado com a venda**.
  - No financiamento, o saldo é o valor presente das parcelas restantes pela Price. Nos outros casos, é a soma das
    parcelas restantes.
  - Se a venda não cobre o saldo, a diferença sai do guardado.
  - A partir do mês da venda, a meta vendida sai do orçamento: parcelas, custos novos e gastos que ela substituía.
    Quem quiser continuar sem o gasto substituído declara a substituição na meta nova.
- **Regras da fila:**
  - Só uma meta vende cada bem.
  - Criar ou editar uma meta com uma venda impossível é **recusado** (422).
  - Excluir ou reordenar metas, ou mudar o tipo de uma meta, **remove sozinho** as vendas que deixaram de ser
    possíveis. O MCP e a tela avisam disso.
- **Categoria do bem** em metas de compra: veículo/locomoção, informática/eletrônicos, casa/móveis/eletrodomésticos
  ou outro, com nome livre opcional. É **só informativa**: não restringe o que pode ser vendido para quê.

## Consequências

- O plano e a renda-alvo passam a considerar a venda. A resposta do plano mostra, por meta e por cenário, o valor
  estimado de cada bem e o saldo quitado.
- A desvalorização é uma estimativa da pessoa, não um preço de mercado. Vale revisá-la quando o mercado de usados
  mudar.
- A verificação de folga continua olhando só a janela da meta que começa. Uma venda que traz de volta um gasto
  substituído é checada nessa janela, mas não reavalia metas anteriores.
