/** Recorrências que o usuário marcou como "não é recorrente". */
export abstract class RecurrenceDismissals {
  abstract dismiss(key: string): Promise<void>;
  abstract all(): Promise<Set<string>>;
}
