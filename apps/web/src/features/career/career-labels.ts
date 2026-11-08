import type { CareerProfileDto, OpportunityDto } from '@finapp/contracts';

export const LEVEL_LABEL: Record<CareerProfileDto['english']['reading'], string> = {
  basico: 'Básico',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
  fluente: 'Fluente',
};
export const SKILL_LEVEL_LABEL: Record<CareerProfileDto['skills'][number]['level'], string> = {
  basico: 'básico',
  intermediario: 'intermediário',
  avancado: 'avançado',
};
export const KIND_LABEL: Record<OpportunityDto['kind'], string> = {
  freela: 'Projeto (freela)',
  recorrente: 'Cliente recorrente',
  vaga: 'Vaga',
  bolsa: 'Bolsa',
  outro: 'Outro',
};
export const STATUS_COLUMNS: { status: OpportunityDto['status']; label: string }[] = [
  { status: 'ideia', label: 'Ideia' },
  { status: 'aplicada', label: 'Aplicada / proposta enviada' },
  { status: 'conversa', label: 'Em conversa' },
  { status: 'fechada', label: 'Fechada' },
  { status: 'perdida', label: 'Perdida' },
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "TypeScript: avançado" (uma por linha) ↔ lista de skills. Sem nível → intermediário. */
export function parseSkills(text: string): CareerProfileDto['skills'] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', level = ''] = line.split(/\s*[:—–-]\s*(?=[^:—–-]*$)/);
      const folded = fold(level);
      const parsed = folded.startsWith('bas') ? 'basico' : folded.startsWith('ava') ? 'avancado' : 'intermediario';
      return { name: (level ? name : line).trim().slice(0, 40), level: parsed } as const;
    })
    .filter((s) => s.name);
}

export const formatSkills = (skills: CareerProfileDto['skills']): string =>
  skills.map((s) => `${s.name}: ${SKILL_LEVEL_LABEL[s.level]}`).join('\n');
