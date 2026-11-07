# 0010. Usar NestJS 12 (ESM) sobre Fastify, TypeScript 7 e Biome

- Status: Aceito
- Data: 2026-11-07

## Contexto

Ao montar a API, três fatos do ecossistema atual pesaram:

- O **NestJS 12 é ESM-only**. Um pacote CommonJS até roda no Node 24 (`require` de ESM), mas o TypeScript acusa a mistura e o projeto fica num estado híbrido.
- O **TypeScript 7** (compilador nativo) emite `design:paramtypes` com `emitDecoratorMetadata`, o que foi testado. Por isso o NestJS funciona com ele e o build pode ser feito com `tsc` puro, sem SWC.
- O **typescript-eslint** só suporta TypeScript < 6.1, porque depende da API JS do compilador, que o TS 7 ainda não publica. O dependency-cruiser também perde o parser do TS, mas continua resolvendo `import type` (testado).

## Decisão

- API em **ESM nativo** (`"type": "module"`, `module: NodeNext`, imports relativos com `.js`).
- **Fastify** como plataforma HTTP do Nest (menor overhead e `app.inject()` para testes e2e sem rede).
- **TypeScript 7** para typecheck e build. Nos testes, **SWC** (`unplugin-swc`) emite os metadados de decorators para o Vitest.
- **Biome** para lint e formatação (independe da API do compilador, é rápido e tem `noRestrictedImports`, de que a configuração de gráficos vai precisar).
- **dependency-cruiser** para as fronteiras da arquitetura hexagonal.

## Consequências

- Sem regras de lint _type-aware_ (como `no-floating-promises`) até o typescript-eslint suportar o TS 7. Compensado por `strict` + `exactOptionalPropertyTypes` + testes. Reavaliar quando houver suporte.
- Se algum pacote essencial exigir a API JS do TypeScript, a alternativa é fixar o TS 6.0 só como dependência de ferramenta.
- O pnpm 12 bloqueia scripts de instalação por padrão. Só `@swc/core` está liberado (`allowBuilds` em `pnpm-workspace.yaml`).
