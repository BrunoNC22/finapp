import { DomainError } from '../../../shared/kernel/domain-error.js';
import type { Money } from '../../../shared/kernel/money.js';

export class InvalidCareerDataError extends DomainError {
  // biome-ignore lint/complexity/noUselessConstructor: torna público o construtor protegido de DomainError
  constructor(message: string) {
    super(message);
  }
}

export type WorkMode = 'freela' | 'pj' | 'clt';
export type SkillLevel = 'basico' | 'intermediario' | 'avancado';
export type LanguageLevel = 'basico' | 'intermediario' | 'avancado' | 'fluente';

export interface Period {
  readonly start: string;
  /** Ausente: atual. */
  readonly end?: string;
}

export interface Experience extends Period {
  readonly title: string;
  readonly organization: string;
  readonly description: string;
}

export interface Education extends Period {
  readonly title: string;
  readonly institution: string;
}

export interface CareerProfileProps {
  readonly headline: string;
  readonly summary: string;
  readonly location: string;
  readonly preferences: {
    readonly workModes: readonly WorkMode[];
    readonly remote: boolean;
    readonly inPerson: boolean;
  };
  readonly english: {
    readonly reading: LanguageLevel;
    readonly listening: LanguageLevel;
    readonly writing: LanguageLevel;
    readonly speaking: LanguageLevel;
  };
  /** Horas por semana disponíveis para trabalho extra; ausente = ainda não sabe. */
  readonly hoursPerWeek?: number;
  readonly skills: readonly { readonly name: string; readonly level: SkillLevel }[];
  readonly experiences: readonly Experience[];
  readonly education: readonly Education[];
  readonly links: readonly { readonly label: string; readonly url: string }[];
  /** Currículo completo em Markdown (o que o assistente lê para sugerir caminhos). */
  readonly resumeMarkdown: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function checkPeriod(p: Period, what: string): void {
  if (!MONTH.test(p.start) || (p.end !== undefined && !MONTH.test(p.end))) {
    throw new InvalidCareerDataError(`${what}: use meses no formato AAAA-MM`);
  }
  if (p.end && p.end < p.start) throw new InvalidCareerDataError(`${what}: o fim não pode ser antes do início`);
}

/** Perfil profissional do dono da instância (um só). */
export class CareerProfile {
  private constructor(readonly props: CareerProfileProps) {
    Object.freeze(this);
  }

  static create(props: CareerProfileProps): CareerProfile {
    if (!props.headline.trim())
      throw new InvalidCareerDataError('informe o título profissional (ex.: Desenvolvedor Full Stack)');
    if (props.hoursPerWeek !== undefined && !(props.hoursPerWeek >= 0 && props.hoursPerWeek <= 80)) {
      throw new InvalidCareerDataError('horas por semana entre 0 e 80');
    }
    for (const e of props.experiences) checkPeriod(e, `experiência "${e.title}"`);
    for (const e of props.education) checkPeriod(e, `formação "${e.title}"`);
    if (props.links.some((l) => !/^https?:\/\//.test(l.url)))
      throw new InvalidCareerDataError('links precisam começar com http(s)://');
    return new CareerProfile({ ...props, headline: props.headline.trim() });
  }

  /** Experiências em andamento (sem fim). */
  get current(): readonly Experience[] {
    return this.props.experiences.filter((e) => !e.end);
  }
}

export type OpportunityKind = 'freela' | 'recorrente' | 'vaga' | 'bolsa' | 'outro';
export type OpportunityStatus = 'ideia' | 'aplicada' | 'conversa' | 'fechada' | 'perdida';
export const OPPORTUNITY_FLOW: readonly OpportunityStatus[] = ['ideia', 'aplicada', 'conversa', 'fechada', 'perdida'];

export interface OpportunityProps {
  readonly id: string;
  readonly title: string;
  readonly kind: OpportunityKind;
  readonly status: OpportunityStatus;
  /** Quanto pode render por mês (recorrente, vaga, bolsa). */
  readonly estimatedMonthly?: Money;
  /** Quanto pode render de uma vez (projeto). */
  readonly estimatedOneOff?: Money;
  readonly link?: string;
  readonly notes: string;
  readonly updatedAt: Date;
}

/** Uma chance de aumentar a renda, acompanhada num quadro simples. */
export class Opportunity {
  private constructor(readonly props: OpportunityProps) {
    Object.freeze(this);
  }

  static create(props: OpportunityProps): Opportunity {
    if (!props.title.trim()) throw new InvalidCareerDataError('dê um título à oportunidade');
    for (const value of [props.estimatedMonthly, props.estimatedOneOff]) {
      if (value?.isNegative()) throw new InvalidCareerDataError('valores estimados não podem ser negativos');
    }
    if (props.link && !/^https?:\/\//.test(props.link))
      throw new InvalidCareerDataError('o link precisa começar com http(s)://');
    return new Opportunity({ ...props, title: props.title.trim() });
  }

  get id(): string {
    return this.props.id;
  }

  /** Ainda em aberto (nem fechada, nem perdida). */
  get isOpen(): boolean {
    return this.props.status !== 'fechada' && this.props.status !== 'perdida';
  }

  withChanges(changes: Partial<Omit<OpportunityProps, 'id' | 'updatedAt'>>, at: Date): Opportunity {
    return Opportunity.create({ ...this.props, ...changes, updatedAt: at });
  }
}
