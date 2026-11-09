import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, TooManyAttemptsError, UnauthorizedError } from '../application/errors.js';
import { DomainError } from '../kernel/domain-error.js';
import { AppExceptionFilter } from './exception.filter.js';

class RuleBroken extends DomainError {
  constructor() {
    super('regra violada');
  }
}

/** Resposta do Fastify falsa: guarda status, cabeçalhos e corpo. */
function reply() {
  const sent: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const r = {
    status(code: number) {
      sent.status = code;
      return r;
    },
    header(name: string, value: string) {
      sent.headers[name] = value;
      return r;
    },
    send(body: unknown) {
      sent.body = body;
      return r;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => r }) } as unknown as ArgumentsHost;
  return { sent, host };
}

const handle = (error: unknown) => {
  const { sent, host } = reply();
  new AppExceptionFilter().catch(error, host);
  return sent;
};

describe('AppExceptionFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps known errors to safe 4xx answers', () => {
    expect(handle(new UnauthorizedError())).toMatchObject({ status: 401, body: { message: 'não autorizado' } });
    expect(handle(new NotFoundError('meta não encontrada'))).toMatchObject({ status: 404 });
    expect(handle(new RuleBroken())).toMatchObject({ status: 422, body: { message: 'regra violada' } });
    expect(handle(new TooManyAttemptsError('muitas tentativas', 60))).toMatchObject({
      status: 429,
      headers: { 'retry-after': '60' },
    });
    expect(handle(new BadRequestException('corpo inválido'))).toMatchObject({ status: 400 });
  });

  it('answers 500 without message or stack, and logs where it happened but never the message (may carry data)', () => {
    const logged: string[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      logged.push(String(message));
    });
    const error = new Error('E11000 duplicate key: { descricao: "PIX PARA FULANO", valor: 1234 }');
    const sent = handle(error);

    expect(sent).toMatchObject({ status: 500, body: { message: 'erro interno' } });
    expect(JSON.stringify(sent.body)).not.toMatch(/E11000|FULANO|at /);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^erro não tratado: Error em /);
    expect(logged[0]).toMatch(/exception\.filter\.spec\.ts/);
    expect(logged[0]).not.toMatch(/FULANO|E11000|1234/);
  });
});
