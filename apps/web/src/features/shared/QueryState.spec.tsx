import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError, OutdatedAppError } from '../../lib/api/api-client';
import { QueryState } from './QueryState';

describe('QueryState', () => {
  it('asks to reload when the app is older than the API', () => {
    render(
      <QueryState isPending={false} error={new OutdatedAppError()}>
        conteúdo
      </QueryState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Há uma versão nova do finapp');
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });

  it('offers a retry for other failures and shows the content otherwise', () => {
    const { rerender } = render(
      <QueryState isPending={false} error={new ApiError(500, 'erro')} onRetry={() => undefined}>
        conteúdo
      </QueryState>,
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    rerender(
      <QueryState isPending={false} error={null}>
        conteúdo
      </QueryState>,
    );
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });
});
