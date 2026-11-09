import type { Clock } from '../../../shared/application/clock.js';
import { LocalDate } from '../../../shared/kernel/local-date.js';
import { Money } from '../../../shared/kernel/money.js';
import { YearMonth } from '../../../shared/kernel/year-month.js';
import type { CreateOpportunity, SaveCareerProfile } from '../../career/application/career.js';
import type { AuthService } from '../../identity/application/use-cases/auth.js';
import type { SyncAccounts } from '../../ledger/application/use-cases/sync-accounts.js';
import type { CreateGoal } from '../../planning/application/use-cases/goals.js';
import type { CreateIncomeSource } from '../../planning/application/use-cases/income.js';
import type { RecordMonthlyAnalysis } from '../../routine/application/monthly-analysis-routine.js';

export interface DemoDeps {
  readonly auth: AuthService;
  readonly sync: SyncAccounts;
  readonly createSource: CreateIncomeSource;
  readonly createGoal: CreateGoal;
  readonly saveProfile: SaveCareerProfile;
  readonly createOpportunity: CreateOpportunity;
  readonly recordAnalysis: RecordMonthlyAnalysis;
  readonly clock: Clock;
}

const r = Money.fromReais;
const none = { price: Money.zero(), downPayment: Money.zero(), oneTimeCosts: Money.zero(), recurringCosts: [] };

/**
 * Prepara uma instância de demonstração (README): o acesso com a senha do demo, 12 meses de movimento sintético
 * (provider demo) e renda, metas e carreira de uma pessoa FICTÍCIA. Pelos mesmos casos de uso que a tela usa.
 * Só roda numa instância vazia: reiniciar não apaga o que o visitante mudou.
 */
export class SeedDemoInstance {
  constructor(private readonly deps: DemoDeps) {}

  async execute(password: string): Promise<'semeada' | 'ja-existia'> {
    const { auth, sync, createSource, createGoal, saveProfile, createOpportunity } = this.deps;
    if ((await auth.status()).ownerExists) return 'ja-existia';

    const { token } = await auth.issueSetupToken();
    await auth.setup(token, password);
    await sync.execute({ full: true });

    const now = YearMonth.of(LocalDate.fromInstant(this.deps.clock.now(), 'America/Sao_Paulo'));
    await createSource.execute({
      name: 'Bolsa de pesquisa',
      kind: 'scholarship',
      expectedMonthly: r(1200),
      startsOn: now.addMonths(-12),
      risk: 'low',
      status: 'active',
      matcher: { descriptionContains: 'bolsa pesquisa' },
    });
    await createSource.execute({
      name: 'Cliente Exemplo (freela)',
      kind: 'freelance',
      expectedMonthly: r(1500),
      startsOn: now.addMonths(-12),
      risk: 'high',
      status: 'active',
      matcher: { descriptionContains: 'cliente exemplo' },
    });
    await createSource.execute({
      name: 'Estágio remoto (em seleção)',
      kind: 'employment',
      expectedMonthly: r(1800),
      startsOn: now.addMonths(2),
      risk: 'medium',
      status: 'pending',
    });

    await createGoal.execute({
      ...none,
      name: 'Notebook para trabalhar',
      kind: 'purchase',
      price: r(4200),
      financing: { kind: 'interest_free', installments: 10 },
    });
    await createGoal.execute({
      ...none,
      name: 'Reserva de emergência (3 meses)',
      kind: 'reserve',
      price: r(6000),
      financing: { kind: 'cash' },
    });
    await createGoal.execute({
      ...none,
      name: 'Moto 160 cc',
      kind: 'purchase',
      price: r(18000),
      downPayment: r(3000),
      oneTimeCosts: r(900),
      financing: { kind: 'loan', installments: 36, monthlyRate: 0.0189 },
      recurringCosts: [{ name: 'Combustível, seguro e IPVA', monthly: r(380) }],
    });
    await createGoal.execute({
      ...none,
      name: 'Morar sozinha (apê de 1 quarto)',
      kind: 'lifestyle',
      oneTimeCosts: r(3500),
      financing: { kind: 'cash' },
      recurringCosts: [
        { name: 'Aluguel e condomínio', monthly: r(1300) },
        { name: 'Luz, água e internet', monthly: r(220) },
      ],
    });

    await saveProfile.execute({
      headline: 'Desenvolvedora Full Stack (perfil fictício)',
      summary: 'Perfil de demonstração: TypeScript de ponta a ponta, prefere projetos remotos.',
      location: 'Cidade Exemplo',
      preferences: { workModes: ['freela', 'pj'], remote: true, inPerson: false },
      english: { reading: 'fluente', listening: 'avancado', writing: 'avancado', speaking: 'intermediario' },
      skills: [
        { name: 'TypeScript', level: 'avancado' },
        { name: 'React', level: 'avancado' },
        { name: 'NestJS', level: 'intermediario' },
        { name: 'MongoDB', level: 'intermediario' },
      ],
      experiences: [
        {
          title: 'Desenvolvedora (freela)',
          organization: 'Cliente Exemplo Ltda',
          start: now.addMonths(-12).toString(),
          description: 'Painel administrativo e integrações.',
        },
      ],
      education: [{ title: 'Bacharelado em Computação', institution: 'Instituto Exemplo', start: '2021-03' }],
      links: [{ label: 'Portfólio', url: 'https://exemplo.dev' }],
      resumeMarkdown: '# Pessoa Exemplo\n\nDesenvolvedora Full Stack (perfil fictício do modo demonstração).',
    });
    await createOpportunity.execute({
      title: 'Landing page para uma clínica',
      kind: 'freela',
      status: 'conversa',
      estimatedOneOff: r(1800),
      notes: 'Orçamento enviado; retorno na próxima semana.',
    });
    await createOpportunity.execute({
      title: 'Manutenção mensal de sites',
      kind: 'recorrente',
      status: 'ideia',
      estimatedMonthly: r(400),
      notes: 'Oferecer junto com cada site entregue.',
    });
    await createOpportunity.execute({
      title: 'Estágio remoto',
      kind: 'vaga',
      status: 'aplicada',
      estimatedMonthly: r(1800),
      notes: 'Processo seletivo em andamento.',
    });
    // O lembrete da análise mensal depende da skill do Claude Code, que não faz parte do demo.
    await this.deps.recordAnalysis.execute({ outcome: 'feita', via: 'app' });
    return 'semeada';
  }
}
