import { DomainError } from '../../../../shared/kernel/domain-error.js';

export class InvalidCategoryError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/** expense = gasto; income = renda; saving = dinheiro guardado/investido (não é gasto). */
export type CategoryKind = 'expense' | 'income' | 'saving';

export interface CategoryProps {
  /** Id estável, ex.: "transporte.app". Subcategorias usam o id do pai como prefixo. */
  readonly id: string;
  readonly name: string;
  readonly kind: CategoryKind;
  readonly parentId?: string;
  readonly archived?: boolean;
}

/** Categoria da taxonomia do usuário (dois níveis). Editável pela interface; vive no banco. */
export class Category {
  private constructor(
    readonly id: string,
    private _name: string,
    readonly kind: CategoryKind,
    readonly parentId: string | undefined,
    private _archived: boolean,
  ) {}

  static create(props: CategoryProps): Category {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)?$/.test(props.id)) {
      throw new InvalidCategoryError(`id de categoria inválido: "${props.id}" (use "grupo" ou "grupo.item")`);
    }
    const prefix = props.id.includes('.') ? props.id.split('.')[0] : undefined;
    if (props.parentId !== prefix) {
      throw new InvalidCategoryError(`"${props.id}" deve ter como pai "${prefix ?? '(nenhum)'}"`);
    }
    if (!props.name.trim()) throw new InvalidCategoryError('a categoria precisa de um nome');
    return new Category(props.id, props.name.trim(), props.kind, props.parentId, props.archived ?? false);
  }

  get name(): string {
    return this._name;
  }
  get archived(): boolean {
    return this._archived;
  }
  get isGroup(): boolean {
    return this.parentId === undefined;
  }

  rename(name: string): void {
    if (!name.trim()) throw new InvalidCategoryError('a categoria precisa de um nome');
    this._name = name.trim();
  }

  archive(): void {
    this._archived = true;
  }

  snapshot(): Required<Omit<CategoryProps, 'parentId'>> & Pick<CategoryProps, 'parentId'> {
    return {
      id: this.id,
      name: this._name,
      kind: this.kind,
      archived: this._archived,
      ...(this.parentId ? { parentId: this.parentId } : {}),
    };
  }
}
