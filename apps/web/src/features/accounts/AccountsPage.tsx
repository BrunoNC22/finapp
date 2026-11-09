import type { AccountDto, SyncRunDto } from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useServices } from '../../app/services';
import { accountLabel } from '../../lib/accounts';
import { ApiError } from '../../lib/api/api-client';
import { formatCents, formatDateTime } from '../../lib/format';
import { Amount } from '../shared/Amount';
import { QueryState } from '../shared/QueryState';
import { financeKeys, useAccounts } from '../shared/queries';
import { Connections } from './Connections';

const KIND: Record<AccountDto['kind'], string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  payment_account: 'Conta de pagamento',
};

const RUN_STATUS: Record<SyncRunDto['status'], string> = {
  success: 'Concluída',
  partial: 'Parcial (alguma conta falhou)',
  failed: 'Falhou',
};

/** Saldos, uso do cartão, sincronização manual e histórico de sincronizações. */
export function AccountsPage() {
  const { finance } = useServices();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const runs = useQuery({ queryKey: financeKeys.syncRuns, queryFn: () => finance.syncRuns(10) });
  const [message, setMessage] = useState<string | undefined>();
  const sync = useMutation({
    mutationFn: (full: boolean) => finance.syncNow({ full }),
    onSuccess: (run, full) => {
      setMessage(
        run.status === 'success'
          ? full
            ? 'Histórico reprocessado: os últimos 12 meses foram revistos com as regras atuais.'
            : 'Sincronização concluída.'
          : `Sincronização ${RUN_STATUS[run.status].toLowerCase()}. Veja o histórico abaixo.`,
      );
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
    onError: (error) =>
      setMessage(
        error instanceof ApiError && error.status === 409
          ? 'Já existe uma sincronização em andamento. Aguarde um pouco.'
          : 'Não foi possível sincronizar agora.',
      ),
  });

  return (
    <section className="page" aria-labelledby="accounts-title">
      <header className="page-header">
        <h1 id="accounts-title">Contas</h1>
        <button type="button" className="primary" onClick={() => sync.mutate(false)} disabled={sync.isPending}>
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </header>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}

      <QueryState
        isPending={accounts.isPending}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
        isEmpty={(accounts.data ?? []).length === 0}
        empty={<p className="hint">Nenhuma conta conectada. Veja docs/operacao.md para conectar via Open Finance.</p>}
      >
        <div className="account-grid">
          {accounts.data?.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      </QueryState>

      <Connections />

      <article className="card">
        <h2>Reprocessar histórico</h2>
        <p className="hint">
          A sincronização normal revisita só o último mês. Depois de uma melhoria nas regras (transferências entre suas
          contas, faturas, categorias), reprocesse para aplicá-la aos últimos 12 meses. Suas escolhas manuais são
          mantidas. Leva cerca de um minuto.
        </p>
        <button type="button" onClick={() => sync.mutate(true)} disabled={sync.isPending}>
          Reprocessar 12 meses
        </button>
      </article>

      <article className="card">
        <h2>Últimas sincronizações</h2>
        <QueryState
          isPending={runs.isPending}
          error={runs.error}
          isEmpty={(runs.data ?? []).length === 0}
          skeletons={2}
        >
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Novas</th>
                  <th scope="col">Atualizadas</th>
                  <th scope="col">Entre contas</th>
                  <th scope="col">Sem categoria</th>
                </tr>
              </thead>
              <tbody>
                {runs.data?.map((run) => {
                  const errors = run.accounts.filter((a) => a.error).length;
                  return (
                    <tr key={run.id}>
                      <td>{formatDateTime(run.startedAt)}</td>
                      <td className={`run-${run.status}`}>
                        {RUN_STATUS[run.status]}
                        {errors > 0 ? ` · ${errors} conta(s) com erro` : ''}
                      </td>
                      <td>{run.accounts.reduce((s, a) => s + a.created, 0)}</td>
                      <td>{run.accounts.reduce((s, a) => s + a.updated, 0)}</td>
                      <td>{run.transferPairs}</td>
                      <td>{run.uncategorized}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
      </article>
    </section>
  );
}

function AccountCard({ account: a }: { account: AccountDto }) {
  const isCard = a.kind === 'credit_card';
  const owed = isCard ? Math.max(0, -a.balance.cents) : 0;
  const limit = a.creditLimit?.cents ?? 0;
  const usage = limit > 0 ? Math.min(1, owed / limit) : 0;
  return (
    <article className="card account-card">
      <div className="account-head">
        <strong>{accountLabel(a)}</strong>
        <span className="hint">
          {KIND[a.kind]}
          {a.holderType === 'business' ? ' · PJ' : ''}
        </span>
      </div>
      {isCard ? (
        <>
          <div className="account-balance">
            <span className="stat-label">Fatura em aberto</span>
            <strong>{formatCents(owed)}</strong>
          </div>
          {limit > 0 && (
            <>
              <div
                className={`progress${usage > 0.8 ? ' progress-warning' : ''}`}
                role="progressbar"
                aria-label={`Uso do limite de ${accountLabel(a)}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(usage * 100)}
              >
                <span style={{ width: `${usage * 100}%` }} />
              </div>
              <span className="hint">
                {Math.round(usage * 100)}% de {formatCents(limit)} · disponível {formatCents(Math.max(0, limit - owed))}
              </span>
            </>
          )}
        </>
      ) : (
        <div className="account-balance">
          <span className="stat-label">Saldo</span>
          <strong>
            <Amount cents={a.balance.cents} />
          </strong>
        </div>
      )}
      <span className="hint">
        {a.lastSyncedAt ? `Sincronizada em ${formatDateTime(a.lastSyncedAt)}` : 'Ainda não sincronizada'}
      </span>
    </article>
  );
}
