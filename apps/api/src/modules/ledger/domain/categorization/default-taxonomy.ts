import type { CategorizationRuleProps } from './categorization-rule.js';
import type { CategoryKind, CategoryProps } from './category.js';

type Group = { name: string; kind: CategoryKind; items: Record<string, string> };

/**
 * Taxonomia padrão, genérica, para qualquer pessoa. O usuário cria, renomeia e arquiva categorias
 * pela interface; o seed só cria as que ainda não existem.
 */
const GROUPS: Record<string, Group> = {
  renda: {
    name: 'Renda',
    kind: 'income',
    items: {
      'salario-bolsa': 'Salário e bolsas',
      servicos: 'Serviços e freelas',
      rendimentos: 'Rendimentos',
      cashback: 'Cashback e recompensas',
      beneficios: 'Benefícios e auxílios',
      outras: 'Outras entradas',
    },
  },
  moradia: {
    name: 'Moradia',
    kind: 'expense',
    items: {
      aluguel: 'Aluguel e condomínio',
      contas: 'Água, luz e gás',
      casa: 'Casa e utensílios',
      impostos: 'IPTU e taxas',
    },
  },
  alimentacao: {
    name: 'Alimentação',
    kind: 'expense',
    items: { mercado: 'Mercado', restaurantes: 'Restaurantes e lanches', delivery: 'Delivery' },
  },
  transporte: {
    name: 'Transporte',
    kind: 'expense',
    items: {
      app: 'Táxi e transporte por app',
      publico: 'Transporte público',
      combustivel: 'Combustível',
      'estacionamento-pedagio': 'Estacionamento e pedágio',
      manutencao: 'Manutenção do veículo',
      'impostos-veiculo': 'IPVA, licenciamento e multas',
      seguro: 'Seguro do veículo',
      financiamento: 'Financiamento do veículo',
      outros: 'Outros transportes',
    },
  },
  saude: {
    name: 'Saúde',
    kind: 'expense',
    items: { farmacia: 'Farmácia', consultas: 'Consultas, exames e clínicas', plano: 'Plano de saúde' },
  },
  educacao: {
    name: 'Educação',
    kind: 'expense',
    items: { cursos: 'Cursos', faculdade: 'Faculdade', livros: 'Livros e material' },
  },
  assinaturas: {
    name: 'Assinaturas e serviços digitais',
    kind: 'expense',
    items: { streaming: 'Streaming', 'servicos-digitais': 'Apps e serviços digitais', telefone: 'Celular e internet' },
  },
  compras: {
    name: 'Compras',
    kind: 'expense',
    items: {
      roupas: 'Roupas e acessórios',
      eletronicos: 'Eletrônicos',
      online: 'Compras online',
      pets: 'Pets',
      outras: 'Outras compras',
    },
  },
  lazer: {
    name: 'Lazer',
    kind: 'expense',
    items: {
      eventos: 'Eventos e passeios',
      esportes: 'Esportes e academia',
      jogos: 'Jogos',
      viagens: 'Viagens',
      apostas: 'Apostas',
      outros: 'Outros lazeres',
    },
  },
  financeiro: {
    name: 'Custos financeiros',
    kind: 'expense',
    items: {
      tarifas: 'Tarifas bancárias',
      juros: 'Juros, encargos e atrasos',
      impostos: 'IOF e impostos',
      seguros: 'Seguros',
      emprestimos: 'Empréstimos e financiamentos',
    },
  },
  pessoas: { name: 'Pagamentos a pessoas', kind: 'expense', items: { pix: 'Pix e transferências para pessoas' } },
  doacoes: { name: 'Doações', kind: 'expense', items: {} },
  investimentos: { name: 'Investimentos e reservas', kind: 'saving', items: {} },
  outros: { name: 'Outros', kind: 'expense', items: {} },
};

export const DEFAULT_CATEGORIES: readonly CategoryProps[] = Object.entries(GROUPS).flatMap(([id, group]) => [
  { id, name: group.name, kind: group.kind },
  ...Object.entries(group.items).map(([item, name]) => ({ id: `${id}.${item}`, name, kind: group.kind, parentId: id })),
]);

/** Regras padrão genéricas (sem dados pessoais), editáveis e desativáveis pelo usuário. */
export const DEFAULT_RULES: readonly Omit<CategorizationRuleProps, 'id'>[] = [
  {
    name: 'Corridas de app de transporte',
    categoryId: 'transporte.app',
    priority: 900,
    enabled: true,
    descriptionPattern: '^corridas?\\b',
  },
];
