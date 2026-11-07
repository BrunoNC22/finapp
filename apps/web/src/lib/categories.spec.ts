import type { CategoryDto } from '@finapp/contracts';
import { describe, expect, it } from 'vitest';
import { CategoryDirectory } from './categories';

const category = (id: string, name: string, parentId?: string, archived = false): CategoryDto => ({
  id,
  name,
  kind: 'expense',
  archived,
  ...(parentId ? { parentId } : {}),
});

const directory = new CategoryDirectory([
  category('alimentacao', 'Alimentação'),
  category('alimentacao.delivery', 'Delivery', 'alimentacao'),
  category('alimentacao.antiga', 'Antiga', 'alimentacao', true),
  category('lazer', 'Lazer', undefined, true),
]);

describe('CategoryDirectory', () => {
  it('names categories, with a readable fallback for missing ones', () => {
    expect(directory.name('alimentacao.delivery')).toBe('Delivery');
    expect(directory.name(undefined)).toBe('Sem categoria');
    expect(directory.name('sumiu')).toBe('Categoria removida');
  });

  it('shows the group before the item', () => {
    expect(directory.path('alimentacao.delivery')).toBe('Alimentação › Delivery');
    expect(directory.path('alimentacao')).toBe('Alimentação');
  });

  it('offers only active groups and items', () => {
    const groups = directory.groups();
    expect(groups.map((g) => g.id)).toEqual(['alimentacao']);
    expect(groups[0]?.children.map((c) => c.id)).toEqual(['alimentacao.delivery']);
  });
});
