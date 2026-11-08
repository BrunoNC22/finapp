import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadingScreen } from './LoadingScreen';

describe('LoadingScreen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('says it is loading and, if it takes long, what to check', () => {
    render(<LoadingScreen slowAfterMs={1000} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o finapp…');
    expect(screen.queryByText(/Tailscale/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/Confira a internet e se o Tailscale está ligado/)).toBeInTheDocument();
  });
});
