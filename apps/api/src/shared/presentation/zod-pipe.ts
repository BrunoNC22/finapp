import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida e converte a entrada com um schema do pacote de contratos. Erros citam o campo, nunca o valor. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException({
      message: 'requisição inválida',
      problems: result.error.issues.map((issue) => ({ field: issue.path.join('.') || '(corpo)', problem: issue.code })),
    });
  }
}
