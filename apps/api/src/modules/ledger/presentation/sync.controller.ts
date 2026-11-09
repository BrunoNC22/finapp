import { type ConnectionsHealthDto, SyncCommandSchema } from '@finapp/contracts';
import { Body, ConflictException, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import { type SyncRun, SyncRunRepository } from '../application/ports/sync-ports.js';
import { GetConnectionsHealth } from '../application/use-cases/connections.js';
import { SyncAccounts, SyncInProgressError } from '../application/use-cases/sync-accounts.js';

@Controller('sync')
export class SyncController {
  constructor(
    @Inject(SyncAccounts) private readonly sync: SyncAccounts,
    @Inject(SyncRunRepository) private readonly runs: SyncRunRepository,
  ) {}

  /** Dispara uma sincronização e devolve o resumo (sem dados de transações). `{ full: true }` revisita 12 meses. */
  @Post()
  @HttpCode(200)
  async run(@Body(new ZodPipe(SyncCommandSchema)) body: { full: boolean }): Promise<SyncRun> {
    try {
      return await this.sync.execute({ full: body.full });
    } catch (error) {
      if (error instanceof SyncInProgressError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('runs')
  async recent(@Query('limit') limit?: string): Promise<SyncRun[]> {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.runs.findRecent(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 10);
  }
}

/** Conexões do Open Finance e quando cada autorização expira (para renovar a tempo). */
@Controller('connections')
export class ConnectionsController {
  constructor(@Inject(GetConnectionsHealth) private readonly connections: GetConnectionsHealth) {}

  @Get()
  async list(): Promise<ConnectionsHealthDto> {
    const h = await this.connections.execute();
    return {
      ...(h.checkedAt ? { checkedAt: h.checkedAt.toISOString() } : {}),
      worst: h.worst,
      connections: h.connections.map((c) => ({
        id: c.id,
        institutionName: c.institutionName,
        status: c.status,
        ...(c.consentExpiresAt ? { consentExpiresAt: c.consentExpiresAt.toISOString() } : {}),
        alert: c.alert,
        ...(c.daysLeft !== undefined ? { daysLeft: c.daysLeft } : {}),
      })),
    };
  }
}
