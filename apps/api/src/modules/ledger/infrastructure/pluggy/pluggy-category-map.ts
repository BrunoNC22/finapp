import type { ProviderCategoryMap } from '../../domain/categorization/categorizer.js';

/**
 * Categorias da Pluggy (ids públicos, hierárquicos: 2 dígitos = grupo, 4 = subgrupo, 8 = item)
 * → taxonomia do app. `null` = não categorizar (transferências entre contas do próprio usuário
 * e pagamento de fatura: o InternalTransferMatcher cuida disso).
 * Ids sem entrada própria herdam do pai (subgrupo → grupo).
 */
const MAP: Record<string, string | null> = {
  '01000000': 'renda.outras',
  '01010000': 'renda.salario-bolsa',
  '01020000': 'renda.beneficios',
  '01030000': 'renda.servicos',
  '01040000': 'renda.beneficios',
  '01050000': 'renda.outras',
  '02000000': 'financeiro.emprestimos',
  '02010000': 'financeiro.juros',
  '02020000': 'financeiro.juros',
  '02030002': 'transporte.financiamento',
  '03000000': 'investimentos',
  '03060000': 'renda.rendimentos',
  '04000000': null,
  '05000000': 'pessoas.pix',
  '05100000': null,
  '06000000': 'outros',
  '07000000': 'outros',
  '07010000': 'assinaturas.telefone',
  '07020000': 'educacao.cursos',
  '07020002': 'educacao.faculdade',
  '07030000': 'lazer.esportes',
  '07040000': 'lazer.eventos',
  '08000000': 'compras.outras',
  '08010000': 'compras.online',
  '08020000': 'compras.eletronicos',
  '08030000': 'compras.pets',
  '08040000': 'compras.roupas',
  '08060000': 'educacao.livros',
  '08070000': 'lazer.esportes',
  '08090000': 'renda.cashback',
  '09000000': 'assinaturas.servicos-digitais',
  '09010000': 'lazer.jogos',
  '09020000': 'assinaturas.streaming',
  '09030000': 'assinaturas.streaming',
  '10000000': 'alimentacao.mercado',
  '11000000': 'alimentacao.restaurantes',
  '11020000': 'alimentacao.delivery',
  '12000000': 'lazer.viagens',
  '13000000': 'doacoes',
  '14000000': 'lazer.apostas',
  '15000000': 'financeiro.impostos',
  '16000000': 'financeiro.tarifas',
  '17000000': 'moradia.casa',
  '17010000': 'moradia.aluguel',
  '17020000': 'moradia.contas',
  '17040000': 'moradia.impostos',
  '18000000': 'saude.consultas',
  '18020000': 'saude.farmacia',
  '19000000': 'transporte.outros',
  '19010000': 'transporte.app',
  '19020000': 'transporte.publico',
  '19050000': 'transporte.manutencao',
  '19050001': 'transporte.combustivel',
  '19050002': 'transporte.estacionamento-pedagio',
  '19050003': 'transporte.estacionamento-pedagio',
  '19050004': 'transporte.impostos-veiculo',
  '19050006': 'transporte.impostos-veiculo',
  '20000000': 'financeiro.seguros',
  '20030000': 'saude.plano',
  '20040000': 'transporte.seguro',
  '21000000': 'lazer.outros',
  '99999999': 'outros',
};

/** Ids da Pluggy com 9 dígitos (ex.: seguros "200400000") são normalizados para 8. */
function normalize(id: string): string {
  return id.length === 9 && id.startsWith('20') ? `${id.slice(0, 4)}0000` : id;
}

export class PluggyCategoryMap implements ProviderCategoryMap {
  resolve(providerCategoryId: string): string | undefined {
    const id = normalize(providerCategoryId);
    for (const candidate of [id, `${id.slice(0, 4)}0000`, `${id.slice(0, 2)}000000`]) {
      if (candidate in MAP) return MAP[candidate] ?? undefined;
    }
    return undefined;
  }

  /** Todas as categorias de destino (usado para validar contra a taxonomia). */
  static targets(): string[] {
    return [...new Set(Object.values(MAP).filter((v): v is string => v !== null))];
  }
}
