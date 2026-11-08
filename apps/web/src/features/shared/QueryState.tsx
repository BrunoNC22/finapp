import type { ReactNode } from 'react';
import { OutdatedAppError } from '../../lib/api/api-client';

interface Props {
  readonly isPending: boolean;
  readonly error: unknown;
  readonly onRetry?: () => void;
  /** Mostra o estado "vazio" no lugar do conteúdo. */
  readonly isEmpty?: boolean;
  readonly empty?: ReactNode;
  /** Quantos blocos de esqueleto mostrar enquanto carrega. */
  readonly skeletons?: number;
  readonly children: ReactNode;
}

/** Carregando / erro / vazio / conteúdo: o mesmo padrão em todas as telas. */
export function QueryState({ isPending, error, onRetry, isEmpty, empty, skeletons = 3, children }: Props) {
  if (isPending) {
    return (
      <div className="skeletons" role="status" aria-busy="true">
        <span className="visually-hidden">Carregando…</span>
        {Array.from({ length: skeletons }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocos estáticos de carregamento
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  }
  if (error instanceof OutdatedAppError) {
    return (
      <div className="card state-error" role="alert">
        <p>Há uma versão nova do finapp. Recarregue para continuar.</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="card state-error" role="alert">
        <p>Não foi possível carregar estes dados.</p>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Tentar de novo
          </button>
        )}
      </div>
    );
  }
  if (isEmpty) return <div className="card state-empty">{empty ?? <p className="hint">Nada por aqui ainda.</p>}</div>;
  return <>{children}</>;
}
