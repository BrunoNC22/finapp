import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { NotFoundError, TooManyAttemptsError, UnauthorizedError } from '../application/errors.js';
import { DomainError } from '../kernel/domain-error.js';

/**
 * Traduz erros para HTTP sem vazar detalhes internos:
 * UnauthorizedError → 401; TooManyAttemptsError → 429; NotFoundError → 404; DomainError (regra violada) → 422;
 * HttpException → como veio; resto → 500 genérico.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(error: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      reply.status(error.getStatus()).send(typeof body === 'string' ? { message: body } : body);
      return;
    }
    if (error instanceof UnauthorizedError) {
      reply.status(401).send({ message: error.message });
      return;
    }
    if (error instanceof TooManyAttemptsError) {
      reply.header('retry-after', String(error.retryAfterSeconds));
      reply.status(429).send({ message: error.message, retryAfterSeconds: error.retryAfterSeconds });
      return;
    }
    if (error instanceof NotFoundError) {
      reply.status(404).send({ message: error.message });
      return;
    }
    if (error instanceof DomainError) {
      reply.status(422).send({ message: error.message });
      return;
    }
    this.logger.error(`erro não tratado: ${error instanceof Error ? error.name : typeof error}`);
    reply.status(500).send({ message: 'erro interno' });
  }
}
