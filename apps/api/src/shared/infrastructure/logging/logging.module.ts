import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../../config/app-config.js';

/**
 * Campos que NUNCA podem aparecer nos logs: credenciais e qualquer dado financeiro.
 * Logs ficam fora de qualquer repositório, mas a regra é não registrar o que não é necessário.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.secret',
  '*.clientSecret',
  '*.apiKey',
  '*.token',
  '*.amount',
  '*.description',
  '*.descriptionRaw',
  '*.paymentData',
  '*.raw',
  '*.payload',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
          // Health é chamado periodicamente pelo Docker: não polui o log.
          autoLogging: { ignore: (req) => req.url === '/health' },
          // Só método, URL e status. Nunca corpo de requisição ou resposta.
          serializers: {
            req: (req: { method: string; url: string; id: unknown }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
