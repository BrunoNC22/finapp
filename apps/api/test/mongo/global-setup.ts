import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

/**
 * Sobe UM MongoDB descartável para toda a execução de testes (Testcontainers).
 * Cada teste de integração cria o próprio banco vazio nele (veja TestMongo).
 * Nunca usa o MongoDB da instância.
 */
let container: StartedTestContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  container = await new GenericContainer('mongo:8.0')
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .withStartupTimeout(120_000)
    .start();
  project.provide('mongoUrl', `mongodb://${container.getHost()}:${container.getMappedPort(27017)}`);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUrl: string;
  }
}
