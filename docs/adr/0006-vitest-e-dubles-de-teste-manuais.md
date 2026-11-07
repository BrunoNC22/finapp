# 0006. Usar Vitest com dublês de teste escritos à mão

- Status: Aceito
- Data: 2026-11-07

## Contexto

O desenvolvimento é guiado por testes (TDD). Mocks gerados por framework tendem a acoplar o teste à
implementação e escondem o design das portas.

## Decisão

- Vitest como test runner em todo o monorepo.
- Dublês (fakes, stubs, spies, mocks e dummies) são **classes escritas à mão** que implementam as
  portas, por exemplo `InMemoryTransactionRepository` e `FixedClock`. `vi.fn`/`vi.mock` ficam
  para os casos em que um dublê manual não é viável.
- Testes de integração dos adapters de Mongo usam um Mongo real em container (Testcontainers).
- Quando o NestJS entrar, o Vitest usa o plugin SWC, porque o esbuild não emite metadados de decorators.

## Consequências

- Os fakes viram parte do código e são reaproveitados entre testes (e pelo modo demo).
- Uma porta difícil de dublar à mão é sinal de que ela precisa ser redesenhada.
