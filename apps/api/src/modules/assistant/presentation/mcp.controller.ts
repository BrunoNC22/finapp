import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Controller, Delete, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../../shared/presentation/public.decorator.js';
import { McpAccess } from '../../identity/application/use-cases/mcp-access.js';
import { AssistantData } from '../application/assistant-data.js';
import { createFinappMcpServer } from './finapp-mcp-server.js';

const bearer = (request: FastifyRequest) => /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];

/**
 * MCP via HTTP "streamable", sem sessão (cada requisição é independente). Fora da sessão de login (@Public):
 * a autorização é o token MCP de LEITURA, gerado no servidor (cli mcp-token).
 */
@Public()
@Controller('mcp')
export class McpController {
  constructor(
    @Inject(McpAccess) private readonly access: McpAccess,
    @Inject(AssistantData) private readonly data: AssistantData,
  ) {}

  @Post()
  async handle(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    if (!(await this.access.verify(bearer(request)))) {
      await reply.status(401).send({ message: 'não autorizado' });
      return;
    }
    const server = createFinappMcpServer(this.data);
    // Sem `sessionIdGenerator`: modo sem sessão (stateless). Respostas em JSON, sem fluxo SSE.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  }

  /** Sem sessão, não há fluxo de eventos nem sessão a encerrar. */
  @Get()
  @HttpCode(405)
  notAllowed(): { message: string } {
    return { message: 'use POST' };
  }

  @Delete()
  @HttpCode(405)
  noSession(): { message: string } {
    return { message: 'sem sessão' };
  }
}
