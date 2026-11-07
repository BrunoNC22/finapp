import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'finapp:isPublic';
/** Marca uma rota como pública (sem login). Todo o resto exige sessão. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
