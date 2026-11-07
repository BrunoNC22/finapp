/** Porta: verifica se o banco de dados responde. Classe abstrata para servir de token de injeção. */
export abstract class DatabaseHealth {
  abstract ping(): Promise<boolean>;
}
