import {
  type AccountDto,
  type CategorizationRuleDto,
  type CategorizeCommand,
  CategorizeCommandSchema,
  type CategoryDto,
  type ClassifyCommand,
  ClassifyCommandSchema,
  type CreateCategoryCommand,
  CreateCategoryCommandSchema,
  type CreateRuleCommand,
  CreateRuleCommandSchema,
  type InstallmentPurchaseDto,
  type TransactionDto,
  type TransactionListQuery,
  TransactionListQuerySchema,
  type TransactionPageDto,
  type UpdateCategoryCommand,
  UpdateCategoryCommandSchema,
} from '@finapp/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { Clock } from '../../../shared/application/clock.js';
import { LocalDate } from '../../../shared/kernel/local-date.js';
import { Money } from '../../../shared/kernel/money.js';
import { withoutUndefined } from '../../../shared/presentation/without-undefined.js';
import { ZodPipe } from '../../../shared/presentation/zod-pipe.js';
import { AccountRepository } from '../application/ports/account-repository.js';
import { CategorizationRuleRepository } from '../application/ports/categorization-rule-repository.js';
import { CategoryRepository } from '../application/ports/category-repository.js';
import { TransactionQueries } from '../application/ports/transaction-queries.js';
import { TransactionRepository } from '../application/ports/transaction-repository.js';
import {
  CategorizeTransactionManually,
  CreateCategorizationRule,
  UnknownTransactionError,
} from '../application/use-cases/categorization.js';
import {
  ClassifyTransactionManually,
  CreateCategory,
  GetInstallmentPurchases,
  UpdateCategory,
} from '../application/use-cases/ledger-commands.js';
import {
  decodeCursor,
  encodeCursor,
  toAccountDto,
  toCategoryDto,
  toInstallmentDto,
  toRuleDto,
  toTransactionDto,
} from './dto.js';

@Controller('accounts')
export class AccountsController {
  constructor(@Inject(AccountRepository) private readonly accounts: AccountRepository) {}

  @Get()
  async list(): Promise<AccountDto[]> {
    return (await this.accounts.findAll()).map(toAccountDto);
  }
}

@Controller('transactions')
export class TransactionsController {
  constructor(
    @Inject(TransactionQueries) private readonly queries: TransactionQueries,
    @Inject(TransactionRepository) private readonly transactions: TransactionRepository,
    @Inject(CategorizeTransactionManually) private readonly categorize: CategorizeTransactionManually,
    @Inject(ClassifyTransactionManually) private readonly classify: ClassifyTransactionManually,
  ) {}

  @Get()
  async list(@Query(new ZodPipe(TransactionListQuerySchema)) query: TransactionListQuery): Promise<TransactionPageDto> {
    const { cursor, limit, from, to, q, ...rest } = query;
    const result = await this.queries.search(
      {
        ...withoutUndefined(rest),
        ...(from ? { from: LocalDate.parse(from) } : {}),
        ...(to ? { to: LocalDate.parse(to) } : {}),
        ...(q ? { text: q } : {}),
      },
      { limit, ...(cursor ? { cursor: decodeCursor(cursor) } : {}) },
    );
    return { items: result.items.map(toTransactionDto), nextCursor: result.next ? encodeCursor(result.next) : null };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<TransactionDto> {
    const transaction = await this.transactions.findById(id);
    if (!transaction) throw new UnknownTransactionError(id);
    return toTransactionDto(transaction);
  }

  @Patch(':id/category')
  async setCategory(
    @Param('id') id: string,
    @Body(new ZodPipe(CategorizeCommandSchema)) body: CategorizeCommand,
  ): Promise<TransactionDto> {
    await this.categorize.execute({ transactionId: id, categoryId: body.categoryId });
    return this.get(id);
  }

  @Patch(':id/classification')
  async setClassification(
    @Param('id') id: string,
    @Body(new ZodPipe(ClassifyCommandSchema)) body: ClassifyCommand,
  ): Promise<TransactionDto> {
    await this.classify.execute({
      transactionId: id,
      classification: body.classification,
      ...(body.counterpartId ? { counterpartId: body.counterpartId } : {}),
    });
    return this.get(id);
  }
}

@Controller('categories')
export class CategoriesController {
  constructor(
    @Inject(CategoryRepository) private readonly categories: CategoryRepository,
    @Inject(CreateCategory) private readonly create: CreateCategory,
    @Inject(UpdateCategory) private readonly update: UpdateCategory,
  ) {}

  @Get()
  async list(): Promise<CategoryDto[]> {
    return (await this.categories.findAll()).map(toCategoryDto);
  }

  @Post()
  async add(@Body(new ZodPipe(CreateCategoryCommandSchema)) body: CreateCategoryCommand): Promise<CategoryDto> {
    return toCategoryDto(
      await this.create.execute({
        name: body.name,
        kind: body.kind,
        ...(body.parentId ? { parentId: body.parentId } : {}),
      }),
    );
  }

  @Patch(':id')
  async change(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateCategoryCommandSchema)) body: UpdateCategoryCommand,
  ): Promise<CategoryDto> {
    return toCategoryDto(
      await this.update.execute(id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.archived ? { archived: true as const } : {}),
      }),
    );
  }
}

@Controller('categorization-rules')
export class CategorizationRulesController {
  constructor(
    @Inject(CategorizationRuleRepository) private readonly rules: CategorizationRuleRepository,
    @Inject(CreateCategorizationRule) private readonly create: CreateCategorizationRule,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  @Get()
  async list(): Promise<CategorizationRuleDto[]> {
    return (await this.rules.findAll()).map(toRuleDto);
  }

  @Post()
  @HttpCode(201)
  async add(
    @Body(new ZodPipe(CreateRuleCommandSchema)) body: CreateRuleCommand,
  ): Promise<{ rule: CategorizationRuleDto; affected: number }> {
    const { applyToExisting, minAmountCents, maxAmountCents, name, categoryId, priority, enabled, ...conditions } =
      body;
    const today = LocalDate.fromInstant(this.clock.now(), 'America/Sao_Paulo');
    const result = await this.create.execute({
      rule: {
        name,
        categoryId,
        priority,
        enabled,
        ...withoutUndefined(conditions),
        ...(minAmountCents !== undefined ? { minAmount: Money.fromCents(minAmountCents) } : {}),
        ...(maxAmountCents !== undefined ? { maxAmount: Money.fromCents(maxAmountCents) } : {}),
      },
      ...(applyToExisting ? { applyTo: { from: today.addMonths(-12), to: today } } : {}),
    });
    const rule = await this.rules.findById(result.ruleId);
    return { rule: toRuleDto(rule as NonNullable<typeof rule>), affected: result.affected };
  }
}

@Controller('installments')
export class InstallmentsController {
  constructor(@Inject(GetInstallmentPurchases) private readonly purchases: GetInstallmentPurchases) {}

  @Get()
  async list(): Promise<InstallmentPurchaseDto[]> {
    return (await this.purchases.execute()).map(toInstallmentDto);
  }
}
