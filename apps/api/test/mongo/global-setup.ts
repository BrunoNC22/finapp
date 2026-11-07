import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

/**
 * Sobe UM MongoDB descartável para toda a execução de testes (Testcontainers).
 * Cada teste de integração cria o próprio banco vazio nele (veja TestMongo).
 * Nunca usa o MongoDB da instância.
 */
let container: StartedTestContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  const logs: string[] = [];
  try {
    container = await new GenericContainer(process.env.MONGO_TEST_IMAGE ?? 'mongo:8.0.34') // mesma versão da instância (compose.yaml)
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .withStartupTimeout(120_000)
      .withLogConsumer((stream) => stream.on('data', (line: Buffer | string) => logs.push(String(line))))
      .start();
  } catch (error) {
    // Diagnóstico: últimas linhas do mongod (não há dados reais aqui, é um banco descartável).
    console.error(`MongoDB de teste não subiu. Últimas linhas do log:\n${logs.slice(-25).join('')}`);
    throw error;
  }
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
