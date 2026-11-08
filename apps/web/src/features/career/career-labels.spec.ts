import { describe, expect, it } from 'vitest';
import { formatSkills, parseSkills } from './career-labels';

describe('skills text', () => {
  it('reads one skill per line with an optional level', () => {
    expect(parseSkills('TypeScript: avançado\nNestJS — básico\n  React  \n\nNode.js: intermediario')).toEqual([
      { name: 'TypeScript', level: 'avancado' },
      { name: 'NestJS', level: 'basico' },
      { name: 'React', level: 'intermediario' },
      { name: 'Node.js', level: 'intermediario' },
    ]);
  });

  it('round-trips', () => {
    const skills = parseSkills('TypeScript: avançado\nDocker: básico');
    expect(parseSkills(formatSkills(skills))).toEqual(skills);
  });
});
