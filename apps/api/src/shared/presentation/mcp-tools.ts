import { DiscoveryService } from '@nestjs/core';
import type { z } from 'zod';

/**
 * Ferramentas MCP declaradas pelos próprios módulos, como as rotas HTTP (ADR 0014): cada módulo expõe, na sua camada
 * de apresentação, os mesmos casos de uso que a tela usa, com os mesmos contratos de entrada. O módulo `assistant`
 * descobre os providers marcados com `@ProvidesMcpTools()` e monta o servidor MCP com eles.
 */
export type McpToolAccess = 'leitura' | 'escrita';

export interface McpTool<S extends z.ZodRawShape = z.ZodRawShape> {
  /** Nome em português e snake_case, único no servidor. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: S;
  /** `leitura`: visível para qualquer token. `escrita`: só para tokens de escrita, e cada chamada é auditada. */
  readonly access: McpToolAccess;
  /** Apaga, arquiva ou funde dados: o cliente deve pedir confirmação ao usuário. */
  readonly destructive?: boolean;
  /** Repetir a chamada com os mesmos argumentos não muda mais nada. */
  readonly idempotent?: boolean;
  /** Fala com sistemas de fora (ex.: o provedor de Open Finance). */
  readonly openWorld?: boolean;
  run(args: z.output<z.ZodObject<S>>): Promise<unknown>;
}

/** Declara uma ferramenta com os argumentos tipados pelo próprio schema de entrada. */
export const mcpTool = <S extends z.ZodRawShape>(tool: McpTool<S>): McpTool => tool as unknown as McpTool;

/** Provider que oferece ferramentas MCP. */
export interface McpToolProvider {
  mcpTools(): McpTool[];
}

/** Marca a classe para o módulo `assistant` encontrá-la (DiscoveryService). */
export const ProvidesMcpTools = DiscoveryService.createDecorator<void>();
