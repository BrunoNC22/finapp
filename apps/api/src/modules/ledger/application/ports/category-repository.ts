import type { Category } from '../../domain/categorization/category.js';

export abstract class CategoryRepository {
  abstract save(category: Category): Promise<void>;
  abstract findById(id: string): Promise<Category | undefined>;
  abstract findAll(): Promise<Category[]>;
}
