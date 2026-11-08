import type { CareerProfileDto, CreateOpportunityCommand, OpportunityDto } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useServices } from '../../app/services';
import { QueryState } from '../shared/QueryState';
import { financeKeys } from '../shared/queries';
import { OpportunityBoard } from './OpportunityBoard';
import { ProfileForm } from './ProfileForm';

/** Carreira: perfil profissional e oportunidades para aumentar a renda (lidos pelo assistente via MCP). */
export function CareerPage() {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | undefined>();
  const profile = useQuery({ queryKey: financeKeys.careerProfile, queryFn: () => finance.careerProfile() });
  const opportunities = useQuery({ queryKey: financeKeys.opportunities, queryFn: () => finance.opportunities() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: financeKeys.all });
  const save = useMutation({
    mutationFn: (p: CareerProfileDto) => finance.saveCareerProfile(p),
    onSuccess: () => {
      setMessage('Perfil salvo.');
      refresh();
    },
    onError: () => setMessage('Não foi possível salvar o perfil. Confira os campos.'),
  });
  const create = useMutation({
    mutationFn: (c: CreateOpportunityCommand) => finance.createOpportunity(c),
    onSuccess: refresh,
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OpportunityDto['status'] }) =>
      finance.updateOpportunity(id, { status }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => finance.deleteOpportunity(id), onSuccess: refresh });

  return (
    <section className="page" aria-labelledby="career-title">
      <header className="page-header">
        <h1 id="career-title">Carreira</h1>
      </header>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <QueryState
        isPending={opportunities.isPending}
        error={opportunities.error}
        onRetry={() => void opportunities.refetch()}
        skeletons={2}
      >
        <OpportunityBoard
          opportunities={opportunities.data ?? []}
          busy={create.isPending}
          onCreate={(c) => create.mutate(c)}
          onMove={(id, status) => move.mutate({ id, status })}
          onDelete={(id) => remove.mutate(id)}
        />
      </QueryState>
      <QueryState
        isPending={profile.isPending}
        error={profile.error}
        onRetry={() => void profile.refetch()}
        skeletons={3}
      >
        <ProfileForm
          key={profile.data?.headline ?? 'novo'}
          profile={profile.data ?? undefined}
          busy={save.isPending}
          onSave={(p) => save.mutate(p)}
        />
      </QueryState>
    </section>
  );
}
