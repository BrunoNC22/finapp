import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({ trustProxy: true });
}

/** Configuração comum a produção e testes e2e. */
export async function configureApp(app: NestFastifyApplication): Promise<NestFastifyApplication> {
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** Monta a aplicação de produção (logs estruturados via nestjs-pino). */
export async function createApp(rootModule: Type): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(rootModule, createFastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  return configureApp(app);
}
