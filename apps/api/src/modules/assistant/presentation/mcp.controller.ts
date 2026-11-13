import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Controller, Delete, Get, HttpCode, Inject, type OnModuleInit, Post, Req, Res } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type McpTool, type McpToolProvider, ProvidesMcpTools } from '../../../shared/presentation/mcp-tools.js';
import { Public } from '../../../shared/presentation/public.decorator.js';
import { McpAccess } from '../../identity/application/use-cases/mcp-access.js';
import { AssistantData } from '../application/assistant-data.js';
import { McpAuditLog } from '../application/mcp-audit-log.js';
import { createFinappMcpServer } from './finapp-mcp-server.js';

const bearer = (request: FastifyRequest) => /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];

/**
 * MCP via HTTP "streamable", sem sessão (cada requisição é independente). Fora da sessão de login (@Public):
 * a autorização é o token MCP, gerado no servidor (cli mcp-token). O escopo do token decide se as ferramentas de
 * escrita dos módulos aparecem (ADR 0014).
 */
@Public()
@Controller('mcp')
export class McpController implements OnModuleInit {
  private tools: McpTool[] = [];

  constructor(
    @Inject(McpAccess) private readonly access: McpAccess,
    @Inject(AssistantData) private readonly data: AssistantData,
    @Inject(McpAuditLog) private readonly audit: McpAuditLog,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
  ) {}

  onModuleInit(): void {
    this.tools = this.discovery
      .getProviders({ metadataKey: ProvidesMcpTools.KEY })
      .flatMap((wrapper) => (wrapper.instance as McpToolProvider | undefined)?.mcpTools() ?? []);
    const names = this.tools.map((t) => t.name);
    const repeated = names.find((name, i) => names.indexOf(name) !== i);
    if (repeated) throw new Error(`ferramenta MCP repetida: ${repeated}`);
  }

  @Post()
  async handle(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const grant = await this.access.verify(bearer(request));
    if (!grant) {
      await reply.status(401).send({ message: 'não autorizado' });
      return;
    }
    const server = createFinappMcpServer(this.data, { grant, tools: this.tools, audit: this.audit });
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
