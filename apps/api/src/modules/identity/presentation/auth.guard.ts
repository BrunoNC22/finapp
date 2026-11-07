import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC } from '../../../shared/presentation/public.decorator.js';
import { AuthService } from '../application/use-cases/auth.js';
import type { Session } from '../domain/session.js';

export type AuthenticatedRequest = FastifyRequest & { session?: Session };

/** Toda rota exige `Authorization: Bearer <token>`, exceto as marcadas com @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    request.session = await this.auth.authenticate(token);
    return true;
  }
}
