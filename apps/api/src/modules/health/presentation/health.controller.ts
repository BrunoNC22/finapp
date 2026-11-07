import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CheckHealth, type HealthReport } from '../application/check-health.js';

@Controller('health')
export class HealthController {
  constructor(private readonly checkHealth: CheckHealth) {}

  @Get()
  async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthReport> {
    const report = await this.checkHealth.execute();
    reply.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
