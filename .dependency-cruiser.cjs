/**
 * Fronteiras da arquitetura hexagonal (ADR 0001), verificadas no CI.
 * Camadas por módulo: domain ← application ← infrastructure/presentation; composição no *.module.ts.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'O domínio é TypeScript puro: não depende de outras camadas, de frameworks nem de bibliotecas externas.',
      severity: 'error',
      // Specs ficam ao lado do código, mas podem usar builders, dublês e o Vitest.
      from: { path: '(^|/)(domain|shared/kernel)/', pathNot: '\\.(spec|e2e-spec|int-spec)\\.ts$' },
      to: {
        pathNot: ['(^|/)(domain|shared/kernel)/'],
      },
    },
    {
      name: 'application-depends-only-on-domain',
      comment: 'Casos de uso dependem do domínio e de portas, nunca de adapters, de frameworks ou de drivers.',
      severity: 'error',
      from: { path: '(^|/)application/', pathNot: '\\.(spec|e2e-spec|int-spec)\\.ts$' },
      to: {
        path: [`(^|/)(infrastructure|presentation)/`, 'node_modules/(@nestjs|mongodb|fastify|nestjs-pino|pino)'],
      },
    },
    {
      name: 'infrastructure-does-not-know-presentation',
      severity: 'error',
      from: { path: '(^|/)infrastructure/' },
      to: { path: '(^|/)presentation/' },
    },
    {
      name: 'modules-talk-through-application',
      comment: 'Um módulo só pode usar a camada application de outro módulo (sua fachada pública).',
      severity: 'error',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: `^apps/api/src/modules/([^/]+)/(domain|infrastructure|presentation)/`,
        pathNot: '^apps/api/src/modules/$1/',
      },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-test-code-in-production',
      severity: 'error',
      from: { path: '^apps/api/src/', pathNot: '\\.(spec|e2e-spec|int-spec)\\.ts$' },
      to: { path: ['^apps/api/test/', '\\.(spec|e2e-spec|int-spec)\\.ts$', 'node_modules/(vitest|@nestjs/testing)'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)dist/' },
    tsConfig: { fileName: 'apps/api/tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
