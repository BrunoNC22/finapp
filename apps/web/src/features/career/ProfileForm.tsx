import type { CareerProfileDto } from '@finapp/contracts';
import { type FormEvent, useState } from 'react';
import { formatSkills, LEVEL_LABEL, parseSkills } from './career-labels';

type Experience = CareerProfileDto['experiences'][number];
type Education = CareerProfileDto['education'][number];
type Link = CareerProfileDto['links'][number];

const EMPTY: CareerProfileDto = {
  headline: '',
  summary: '',
  location: '',
  preferences: { workModes: [], remote: true, inPerson: false },
  english: {
    reading: 'intermediario',
    listening: 'intermediario',
    writing: 'intermediario',
    speaking: 'intermediario',
  },
  skills: [],
  experiences: [],
  education: [],
  links: [],
  resumeMarkdown: '',
};
const ENGLISH: { key: keyof CareerProfileDto['english']; label: string }[] = [
  { key: 'reading', label: 'Leitura' },
  { key: 'listening', label: 'Escuta' },
  { key: 'writing', label: 'Escrita' },
  { key: 'speaking', label: 'Fala' },
];

/** Perfil profissional: o que o assistente usa para sugerir caminhos de renda. */
export function ProfileForm({
  profile,
  onSave,
  busy,
}: {
  profile: CareerProfileDto | undefined;
  onSave: (profile: CareerProfileDto) => void;
  busy: boolean;
}) {
  const [p, setP] = useState<CareerProfileDto>(profile ?? EMPTY);
  const [skills, setSkills] = useState(formatSkills(profile?.skills ?? []));
  const [hours, setHours] = useState(profile?.hoursPerWeek?.toString() ?? '');
  const [error, setError] = useState<string | undefined>();
  const set = (change: Partial<CareerProfileDto>) => setP((current) => ({ ...current, ...change }));
  const toggleMode = (mode: CareerProfileDto['preferences']['workModes'][number]) =>
    set({
      preferences: {
        ...p.preferences,
        workModes: p.preferences.workModes.includes(mode)
          ? p.preferences.workModes.filter((m) => m !== mode)
          : [...p.preferences.workModes, mode],
      },
    });
  const updateAt = <T,>(list: readonly T[], index: number, change: Partial<T>) =>
    list.map((item, i) => (i === index ? { ...item, ...change } : item));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!p.headline.trim()) return setError('Informe o título profissional.');
    const hoursValue = hours.trim() ? Number(hours) : undefined;
    if (hoursValue !== undefined && !(Number.isInteger(hoursValue) && hoursValue >= 0 && hoursValue <= 80)) {
      return setError('Horas por semana: um número de 0 a 80 (ou deixe em branco).');
    }
    if (p.links.some((l) => !/^https?:\/\//.test(l.url))) return setError('Links precisam começar com https://');
    setError(undefined);
    const clean = <T extends { end?: string | undefined }>(item: T): T => {
      const { end, ...rest } = item;
      return (end ? { ...rest, end } : rest) as T;
    };
    onSave({
      ...p,
      skills: parseSkills(skills),
      experiences: p.experiences.map(clean),
      education: p.education.map(clean),
      ...(hoursValue !== undefined ? { hoursPerWeek: hoursValue } : {}),
    });
  };

  return (
    <form className="card form-grid" onSubmit={submit} aria-label="Perfil profissional">
      <h2 className="span-all">Perfil profissional</h2>
      <label>
        Título
        <input
          value={p.headline}
          onChange={(e) => set({ headline: e.target.value })}
          placeholder="Desenvolvedor Full Stack"
        />
      </label>
      <label>
        Cidade
        <input value={p.location} onChange={(e) => set({ location: e.target.value })} />
      </label>
      <label className="span-all">
        Resumo
        <textarea rows={3} value={p.summary} onChange={(e) => set({ summary: e.target.value })} />
      </label>

      <fieldset className="span-all">
        <legend>Como prefere trabalhar</legend>
        <div className="row">
          {(['freela', 'pj', 'clt'] as const).map((mode) => (
            <label key={mode} className="check">
              <input
                type="checkbox"
                checked={p.preferences.workModes.includes(mode)}
                onChange={() => toggleMode(mode)}
              />
              {mode === 'freela' ? 'Freela' : mode.toUpperCase()}
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={p.preferences.remote}
              onChange={(e) => set({ preferences: { ...p.preferences, remote: e.target.checked } })}
            />
            Remoto
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.preferences.inPerson}
              onChange={(e) => set({ preferences: { ...p.preferences, inPerson: e.target.checked } })}
            />
            Presencial
          </label>
        </div>
        <label>
          Horas por semana para trabalho extra (deixe em branco se ainda não sabe)
          <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="span-all">
        <legend>Inglês</legend>
        <div className="form-row">
          {ENGLISH.map(({ key, label }) => (
            <label key={key}>
              {label}
              <select
                value={p.english[key]}
                onChange={(e) => set({ english: { ...p.english, [key]: e.target.value } })}
              >
                {Object.entries(LEVEL_LABEL).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="span-all">
        Skills (uma por linha, ex.: "TypeScript: avançado")
        <textarea rows={5} value={skills} onChange={(e) => setSkills(e.target.value)} />
      </label>

      <fieldset className="span-all">
        <legend>Experiências</legend>
        <p className="hint">Deixe o fim vazio no que ainda está em andamento.</p>
        {p.experiences.map((x: Experience, i) => (
          <div className="form-row entry" key={`exp-${i.toString()}`}>
            <input
              aria-label="Cargo"
              value={x.title}
              onChange={(e) => set({ experiences: updateAt(p.experiences, i, { title: e.target.value }) })}
              placeholder="Cargo"
            />
            <input
              aria-label="Organização"
              value={x.organization}
              onChange={(e) => set({ experiences: updateAt(p.experiences, i, { organization: e.target.value }) })}
              placeholder="Onde"
            />
            <input
              aria-label="Início"
              type="month"
              value={x.start}
              onChange={(e) => set({ experiences: updateAt(p.experiences, i, { start: e.target.value }) })}
            />
            <input
              aria-label="Fim"
              type="month"
              value={x.end ?? ''}
              onChange={(e) =>
                set({
                  experiences: updateAt(p.experiences, i, { end: e.target.value || undefined } as Partial<Experience>),
                })
              }
            />
            <textarea
              aria-label="Descrição"
              rows={2}
              value={x.description}
              onChange={(e) => set({ experiences: updateAt(p.experiences, i, { description: e.target.value }) })}
              placeholder="O que fez"
            />
            <button
              type="button"
              className="link"
              onClick={() => set({ experiences: p.experiences.filter((_, j) => j !== i) })}
            >
              Remover
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set({ experiences: [...p.experiences, { title: '', organization: '', start: '', description: '' }] })
          }
        >
          Adicionar experiência
        </button>
      </fieldset>

      <fieldset className="span-all">
        <legend>Formação</legend>
        <p className="hint">Sem conclusão = em andamento (use a data prevista se souber).</p>
        {p.education.map((x: Education, i) => (
          <div className="form-row entry" key={`edu-${i.toString()}`}>
            <input
              aria-label="Curso"
              value={x.title}
              onChange={(e) => set({ education: updateAt(p.education, i, { title: e.target.value }) })}
              placeholder="Curso"
            />
            <input
              aria-label="Instituição"
              value={x.institution}
              onChange={(e) => set({ education: updateAt(p.education, i, { institution: e.target.value }) })}
              placeholder="Instituição"
            />
            <input
              aria-label="Início do curso"
              type="month"
              value={x.start}
              onChange={(e) => set({ education: updateAt(p.education, i, { start: e.target.value }) })}
            />
            <input
              aria-label="Conclusão"
              type="month"
              value={x.end ?? ''}
              onChange={(e) =>
                set({ education: updateAt(p.education, i, { end: e.target.value || undefined } as Partial<Education>) })
              }
            />
            <button
              type="button"
              className="link"
              onClick={() => set({ education: p.education.filter((_, j) => j !== i) })}
            >
              Remover
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set({ education: [...p.education, { title: '', institution: '', start: '' }] })}
        >
          Adicionar formação
        </button>
      </fieldset>

      <fieldset className="span-all">
        <legend>Links</legend>
        {p.links.map((x: Link, i) => (
          <div className="form-row" key={`link-${i.toString()}`}>
            <input
              aria-label="Nome do link"
              value={x.label}
              onChange={(e) => set({ links: updateAt(p.links, i, { label: e.target.value }) })}
              placeholder="Portfólio"
            />
            <input
              aria-label="Endereço"
              value={x.url}
              onChange={(e) => set({ links: updateAt(p.links, i, { url: e.target.value }) })}
              placeholder="https://…"
            />
            <button type="button" className="link" onClick={() => set({ links: p.links.filter((_, j) => j !== i) })}>
              Remover
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ links: [...p.links, { label: '', url: '' }] })}>
          Adicionar link
        </button>
      </fieldset>

      <label className="span-all">
        Currículo (Markdown)
        <textarea
          className="mono"
          rows={12}
          value={p.resumeMarkdown}
          onChange={(e) => set({ resumeMarkdown: e.target.value })}
        />
      </label>
      {error && (
        <p className="error span-all" role="alert">
          {error}
        </p>
      )}
      <div className="row span-all">
        <button type="submit" className="primary" disabled={busy}>
          Salvar perfil
        </button>
      </div>
    </form>
  );
}
