import { useEffect, useState } from 'react';

/** Tela de carregamento: nunca uma tela vazia. Se demorar, sugere o que conferir. */
export function LoadingScreen({ slowAfterMs = 8000 }: { slowAfterMs?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <img src="/icon.svg" alt="" width={48} height={48} />
      <p>Carregando o finapp…</p>
      {slow && <p className="hint">Está demorando. Confira a internet e se o Tailscale está ligado.</p>}
    </div>
  );
}
