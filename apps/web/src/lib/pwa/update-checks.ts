/** O que o service worker oferece para procurar uma versão nova. */
export interface UpdatableRegistration {
  update(): Promise<unknown>;
}

interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Procura versão nova do app ao voltar para ele e de tempos em tempos. Com `autoUpdate`, a versão
 * nova assume sozinha. Sem isso, um app instalado podia passar dias com o código antigo aberto.
 * Devolve a função que para as verificações.
 */
export function watchForUpdates(
  registration: UpdatableRegistration,
  options: { intervalMs?: number; source?: VisibilitySource } = {},
): () => void {
  const source = options.source ?? document;
  const check = () => void registration.update().catch(() => undefined); // offline: tenta na próxima
  const onVisible = () => {
    if (source.visibilityState === 'visible') check();
  };
  const timer = setInterval(check, options.intervalMs ?? 15 * 60_000);
  source.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    source.removeEventListener('visibilitychange', onVisible);
  };
}
