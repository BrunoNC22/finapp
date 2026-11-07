import { ConflictException, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { type SyncRun, SyncRunRepository } from '../application/ports/sync-ports.js';
import { SyncAccounts, SyncInProgressError } from '../application/use-cases/sync-accounts.js';

@Controller('sync')
export class SyncController {
  constructor(
    @Inject(SyncAccounts) private readonly sync: SyncAccounts,
    @Inject(SyncRunRepository) private readonly runs: SyncRunRepository,
  ) {}

  /** Dispara uma sincronização e devolve o resumo (sem dados de transações). */
  @Post()
  @HttpCode(200)
  async run(): Promise<SyncRun> {
    try {
      return await this.sync.execute();
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
