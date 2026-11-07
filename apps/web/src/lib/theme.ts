import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'finapp:theme';

/** Preferência de tema (só preferência visual fica no navegador; nunca dados). */
class ThemeStore {
  private listeners = new Set<() => void>();
  private preference: ThemePreference = 'system';

  constructor() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') this.preference = saved;
    } catch {
      // navegação privada ou armazenamento bloqueado: segue o sistema
    }
    this.apply();
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.notify());
  }

  get = (): ThemePreference => this.preference;

  set(preference: ThemePreference): void {
    this.preference = preference;
    try {
      if (preference === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, preference);
    } catch {
      // ignora: a preferência vale só nesta abertura
    }
    this.apply();
    this.notify();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private apply(): void {
    if (this.preference === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', this.preference);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const theme = new ThemeStore();

/** Valor que muda quando o tema efetivo muda (para redesenhar gráficos). */
export function useThemeVersion(): string {
  const preference = useSyncExternalStore(theme.subscribe, theme.get);
  const systemDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return `${preference}:${systemDark ? 'dark' : 'light'}`;
}
