/**
 * Remove chaves com valor `undefined`. Necessário porque os tipos inferidos pelo zod usam `campo?: T | undefined`,
 * e o projeto usa `exactOptionalPropertyTypes` (campo ausente ≠ campo `undefined`).
 */
export function withoutUndefined<T extends object>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
