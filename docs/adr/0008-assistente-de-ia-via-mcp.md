# 0008. Expor o assistente de IA via MCP

- Status: Aceito
- Data: 2026-11-07

## Contexto

O usuário quer que um assistente (Claude) analise gastos, metas e perfil profissional para sugerir
economias e formas de aumentar a renda. Um chat dentro do app exigiria cobrança por uso da API e
mais superfície de envio de dados.

## Decisão

A API expõe um **servidor MCP**, que é mais um adapter de entrada, consumido pelo Claude Code. As
ferramentas MCP chamam os mesmos casos de uso da API HTTP e devolvem preferencialmente agregados.
Nenhuma ferramenta dá acesso direto ao banco nem permite escrita de dados financeiros.

## Consequências

- Sem custo de API além do plano que o usuário já tem para o Claude Code.
- Um chat embutido no app pode ser acrescentado depois, reutilizando as mesmas ferramentas.
- O que o assistente recebe sai da máquina. Minimizar o payload faz parte do design de cada ferramenta.
