/** Formatos da API da Pluggy usados pelo adapter (subconjunto; ver https://docs.pluggy.ai). */

export interface PluggyItem {
  id: string;
  status: string;
  executionStatus?: string | null;
  consentExpiresAt?: string | null;
  lastUpdatedAt?: string | null;
  error?: { code?: string; message?: string } | null;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: 'BANK' | 'CREDIT';
  subtype: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD' | string;
  name: string;
  balance: number;
  /** CPF/CNPJ do titular. Vem nulo em cartões de crédito. */
  taxNumber?: string | null;
  owner?: string | null;
  creditData?: { creditLimit?: number | null } | null;
}

export interface PluggyParticipant {
  name?: string | null;
  documentNumber?: { type?: string; value?: string | null } | null;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  /** Instante ISO 8601 em UTC. */
  date: string;
  description?: string | null;
  descriptionRaw?: string | null;
  /** BANK: negativo = saída. CREDIT: positivo = compra (aumenta a fatura), negativo = pagamento/estorno. */
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  status?: 'PENDING' | 'POSTED' | null;
  operationType?: string | null;
  category?: string | null;
  categoryId?: string | null;
  paymentData?: {
    paymentMethod?: string | null;
    payer?: PluggyParticipant | null;
    receiver?: PluggyParticipant | null;
  } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    totalAmount?: number | null;
    purchaseDate?: string | null;
  } | null;
}

export interface PluggyPage<T> {
  results: T[];
  /** Cursor da próxima página (`/v2/transactions`), anexado ao caminho como veio. */
  next?: string | null;
}
