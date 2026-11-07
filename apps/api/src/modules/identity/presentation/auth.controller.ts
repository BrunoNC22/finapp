import {
  type AuthStatusDto,
  type ChangePasswordCommand,
  ChangePasswordCommandSchema,
  type LoginResultDto,
  type PasskeyLoginCommand,
  PasskeyLoginCommandSchema,
  type PasskeyRegisterCommand,
  PasskeyRegisterCommandSchema,
  type PasswordLoginCommand,
  PasswordLoginCommandSchema,
  type SessionDto,
  type SetupCommand,
  SetupCommandSchema,
} from '@finapp/contracts';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { Public } from '../../../shared/presentation/public.decorator.js';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import { AuthService } from '../application/use-cases/auth.js';
import type { Session } from '../domain/session.js';
import type { AuthenticatedRequest } from './auth.guard.js';

const current = (request: AuthenticatedRequest): Session => request.session as Session;

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Get('status')
  status(): Promise<AuthStatusDto> {
    return this.auth.status();
  }

  /** Primeiro acesso ou "esqueci a senha", com o código gerado no terminal do servidor. */
  @Public()
  @Post('setup')
  @HttpCode(200)
  setup(@Body(new ZodPipe(SetupCommandSchema)) body: SetupCommand): Promise<LoginResultDto> {
    return this.auth.setup(body.setupToken, body.password);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(PasswordLoginCommandSchema)) body: PasswordLoginCommand): Promise<LoginResultDto> {
    return this.auth.loginWithPassword(body.password);
  }

  @Public()
  @Post('passkey/login/options')
  @HttpCode(200)
  passkeyLoginOptions(): Promise<unknown> {
    return this.auth.passkeyLoginOptions();
  }

  @Public()
  @Post('passkey/login')
  @HttpCode(200)
  passkeyLogin(@Body(new ZodPipe(PasskeyLoginCommandSchema)) body: PasskeyLoginCommand): Promise<LoginResultDto> {
    return this.auth.loginWithPasskey(body.response);
  }

  @Post('passkey/register/options')
  @HttpCode(200)
  passkeyRegisterOptions(): Promise<unknown> {
    return this.auth.passkeyRegistrationOptions();
  }

  @Post('passkey/register')
  @HttpCode(201)
  passkeyRegister(
    @Body(new ZodPipe(PasskeyRegisterCommandSchema)) body: PasskeyRegisterCommand,
  ): Promise<{ credentialId: string }> {
    return this.auth.registerPasskey(body.response, body.label);
  }

  @Delete('passkeys/:credentialId')
  @HttpCode(204)
  async removePasskey(@Param('credentialId') credentialId: string): Promise<void> {
    await this.auth.removePasskey(credentialId);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.auth.logout(current(request).id);
  }

  @Get('sessions')
  async sessions(@Req() request: AuthenticatedRequest): Promise<SessionDto[]> {
    const mine = current(request).id;
    return (await this.auth.activeSessions()).map((s) => ({
      id: s.id,
      method: s.method,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === mine,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@Param('id') id: string): Promise<void> {
    await this.auth.revoke(id);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(ChangePasswordCommandSchema)) body: ChangePasswordCommand,
  ): Promise<void> {
    await this.auth.changePassword(current(request).id, body.currentPassword, body.newPassword);
  }
}
