# 0013 — Assistente via MCP (somente leitura, HTTP na própria API)

- Status: aceita
- Data: 2026-11-08

## Contexto

O dono da instância quer que o Claude (no Claude Code) leia gastos, renda, compromissos e metas para orientar
decisões (ADR 0008: só MCP, sem chat no app). O app roda numa máquina própria, acessado por VPN; a sessão de login
expira em minutos, como app de banco (ADR 0012), o que não serve para um cliente MCP.

## Decisão

- **Transporte:** MCP "Streamable HTTP" servido pela própria API em `POST /mcp` (`/api/mcp` atrás do proxy), **sem
  sessão** (cada requisição é independente; respostas em JSON). Nada novo para operar: mesmo processo, mesmo proxy,
  mesmo acesso só local/VPN. Descartado o stdio, que exigiria o código e o Node instalados onde o Claude Code roda.
- **Autorização:** **token MCP de leitura**, separado do login: gerado no servidor (`cli mcp-token`), mostrado uma única
  vez, guardado só como hash (SHA-256), revogável (`cli mcp-revoke`), com registro de último uso. Um token de sessão
  de login **não** abre o MCP, e o token MCP não abre a API.
- **Ferramentas somente leitura** (`readOnlyHint`), que chamam os mesmos casos de uso da API por uma porta
  (`AssistantData`): resumo do mês, gastos por categoria, transações (no máximo 100 por chamada), compromissos,
  recorrências, renda e cenários, metas e viabilidade (com renda-alvo). Valores em reais; **sem documentos (CPF/CNPJ)**
  e sem dados brutos do provedor.
- O módulo `assistant` só usa a camada de aplicação de `ledger`, `planning` e `identity` (regra do dependency-cruiser).

## Consequências

- Ao usar as ferramentas, os dados lidos (agregados, e transações quando pedidas) vão para a conversa com o modelo.
  É o objetivo da funcionalidade; a granularidade padrão é agregada para enviar só o necessário.
- O token fica na configuração local do Claude Code; revogar e gerar outro é imediato.
