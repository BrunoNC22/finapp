# Contribuindo

Obrigado pelo interesse! O finapp é um projeto pessoal, mas issues e PRs são bem-vindos.

## Antes de começar

- Para mudanças maiores, abra uma issue primeiro para conversarmos sobre a ideia.
- Decisões de arquitetura ficam em [docs/adr](docs/adr/README.md). Se a sua mudança contraria uma delas, proponha um ADR
  novo no PR.

## Ambiente

```sh
corepack enable
pnpm install          # também ativa os git hooks (gitleaks e denylist pessoal)
corepack pnpm demo    # o app completo com dados fictícios em http://localhost:8090
pnpm check            # lint, fronteiras de arquitetura, tipos e testes (precisa de Docker para o MongoDB de teste)
```

## Como o código é escrito

- **TDD**: escreva o teste que falha primeiro. Use dublês escritos à mão (`apps/api/test/doubles`), não mocks de
  biblioteca. Repositórios novos ganham um teste de contrato que roda em memória e no MongoDB real.
- **Arquitetura hexagonal**: o domínio é TypeScript puro; um módulo só usa a camada `application` de outro. O
  `pnpm arch` falha se uma fronteira for cruzada.
- **Dinheiro em centavos inteiros.** Nada de `float` para valores.
- **Português** no código voltado ao usuário, nas mensagens de commit e na documentação; nomes de testes em inglês.
- Commits no estilo [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat(api): …`, `fix(web): …`).

## Dados pessoais

Este repositório é público e **nunca** pode conter dados reais: nada de extratos, nomes de terceiros, documentos,
valores reais ou segredos ([ADR 0009](docs/adr/0009-repositorio-publico-sem-dados-pessoais.md)). Use o modo demo e
fixtures fictícias. O pre-commit e o CI rodam o `gitleaks`.
