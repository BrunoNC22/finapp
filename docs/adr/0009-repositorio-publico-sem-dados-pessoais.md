# 0009. Manter o repositório público sem nenhum dado pessoal

- Status: Aceito
- Data: 2026-11-07

## Contexto
O código é aberto (MIT) e qualquer pessoa pode subir a própria instância. O autor usa o app com
dados reais, e nada sobre esses dados, nem sobre as metas ou motivações dele, pode chegar ao
repositório, inclusive ao histórico do git.

## Decisão
- **Repositório público**: código, testes, documentação técnica, ADRs técnicos e `.env.example`.
- **Fora dele**: dados (cofre e backups), segredos (`.env`), metas, decisões pessoais e contexto
  pessoal para assistentes de IA, num repositório privado separado ou em `CLAUDE.local.md` (ignorado pelo git).
- Barreiras automáticas: `.gitignore` estrito; hook de pre-commit com gitleaks (regras para CPF,
  CNPJ, agência e conta) e uma *denylist* pessoal opcional (`git config finapp.denylist`) fora do
  repo; gitleaks também no CI.
- Configurações específicas do usuário (nomes de contas, regras de categorização com nomes de
  pessoas) ficam **no banco** e são editadas pela interface, nunca no código.
- Dados de exemplo, fixtures e prints são sempre sintéticos (modo demo).
- Commits usam o e-mail `noreply` do GitHub.

## Consequências
- Um vazamento no histórico exige reescrever o histórico e rotacionar segredos. Por isso as barreiras ficam antes do commit.
- Quem clonar o projeto ganha as mesmas proteções para a própria instância.
