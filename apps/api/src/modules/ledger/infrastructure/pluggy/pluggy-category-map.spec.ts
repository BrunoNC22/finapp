import { describe, expect, it } from 'vitest';
import { Category } from '../../domain/categorization/category.js';
import { DEFAULT_CATEGORIES } from '../../domain/categorization/default-taxonomy.js';
import { PluggyCategoryMap } from './pluggy-category-map.js';

describe('PluggyCategoryMap', () => {
  const map = new PluggyCategoryMap();

  it('maps exact ids', () => {
    expect(map.resolve('19010000')).toBe('transporte.app');
    expect(map.resolve('11020000')).toBe('alimentacao.delivery');
    expect(map.resolve('10000000')).toBe('alimentacao.mercado');
  });

  it('falls back to the parent subgroup and then to the group', () => {
    expect(map.resolve('07010002')).toBe('assinaturas.telefone'); // Mobile → Telecommunications
    expect(map.resolve('05090004')).toBe('pessoas.pix'); // Third party PIX → Transfers
    expect(map.resolve('08050000')).toBe('compras.outras'); // Kids → Shopping
  });

  it('does not categorize transfers between own accounts nor card bill payments', () => {
    expect(map.resolve('04020000')).toBeUndefined();
    expect(map.resolve('05100000')).toBeUndefined();
  });

  it('handles the 9-digit insurance ids the provider sends', () => {
    expect(map.resolve('200400000')).toBe('transporte.seguro');
    expect(map.resolve('200100000')).toBe('financeiro.seguros');
  });

  it('returns undefined for unknown ids', () => {
    expect(map.resolve('77000000')).toBeUndefined();
  });

  it('only points to categories that exist in the default taxonomy', () => {
    const ids = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    expect(PluggyCategoryMap.targets().filter((target) => !ids.has(target))).toEqual([]);
  });
});

describe('default taxonomy', () => {
  it('is valid (every category can be created and children point to existing parents)', () => {
    const categories = DEFAULT_CATEGORIES.map((props) => Category.create(props));
    const ids = new Set(categories.map((c) => c.id));
    expect(categories.filter((c) => c.parentId && !ids.has(c.parentId))).toEqual([]);
    expect(ids.size).toBe(categories.length);
  });
});
