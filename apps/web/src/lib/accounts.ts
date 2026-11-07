import type { AccountDto } from '@finapp/contracts';

/**
 * Nome da conta para as telas. A API já manda "Banco · Produto"; contas antigas podem ter
 * o banco repetido ("Carteira X · Carteira X"), então partes repetidas aparecem uma vez só.
 */
export function accountLabel(account: Pick<AccountDto, 'institutionName' | 'displayName'>): string {
  const parts = account.displayName
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = parts.filter((part, i) => parts.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === i);
  return unique.join(' · ') || account.institutionName;
}
