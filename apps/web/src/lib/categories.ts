import type { CategoryDto } from '@finapp/contracts';

export interface CategoryGroup {
  readonly id: string;
  readonly name: string;
  readonly kind: CategoryDto['kind'];
  readonly children: readonly CategoryDto[];
}

/** Catálogo de categorias para as telas: nomes, caminho "Grupo › Item" e opções agrupadas. */
export class CategoryDirectory {
  private readonly byId: ReadonlyMap<string, CategoryDto>;

  constructor(private readonly categories: readonly CategoryDto[]) {
    this.byId = new Map(categories.map((c) => [c.id, c]));
  }

  static empty(): CategoryDirectory {
    return new CategoryDirectory([]);
  }

  get(id: string | null | undefined): CategoryDto | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  /** Nome curto (o da própria categoria). */
  name(id: string | null | undefined): string {
    if (!id) return 'Sem categoria';
    return this.byId.get(id)?.name ?? 'Categoria removida';
  }

  /** "Alimentação › Delivery" para subcategorias; só o nome para grupos. */
  path(id: string | null | undefined): string {
    const category = this.get(id);
    if (!category) return this.name(id);
    const parent = this.get(category.parentId);
    return parent ? `${parent.name} › ${category.name}` : category.name;
  }

  /** Grupos ativos com suas subcategorias ativas, na ordem em que chegaram da API. */
  groups(): CategoryGroup[] {
    return this.categories
      .filter((c) => !c.parentId && !c.archived)
      .map((group) => ({
        id: group.id,
        name: group.name,
        kind: group.kind,
        children: this.categories.filter((c) => c.parentId === group.id && !c.archived),
      }));
  }
}
