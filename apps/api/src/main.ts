import { AppModule } from './app.module.js';
import { createApp } from './bootstrap.js';
import { AppConfig, InvalidConfigError } from './shared/config/app-config.js';

async function main(): Promise<void> {
  // Valida o ambiente ANTES de subir o Nest: erro de configuração sai limpo, sem stack trace.
  const { host, port } = AppConfig.fromEnv(process.env).http;
  const app = await createApp(AppModule);
  await app.listen(port, host);
}

main().catch((error: unknown) => {
  // Configuração inválida: a mensagem já é segura (só nomes de variáveis) e explica o que corrigir.
  if (error instanceof InvalidConfigError) console.error(error.message);
  else console.error('Falha ao iniciar a API:', error instanceof Error ? error.message : error);
  process.exit(1);
});
