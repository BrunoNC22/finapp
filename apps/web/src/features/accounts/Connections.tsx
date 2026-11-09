import type { ConnectionsHealthDto } from '@finapp/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useServices } from '../../app/services';
import { formatDate, formatDateTime } from '../../lib/format';
import { QueryState } from '../shared/QueryState';
import { financeKeys } from '../shared/queries';
import { bannerText, consentText, needsAttention, RENEW_URL } from './consent';

const BADGE: Record<ConnectionsHealthDto['connections'][number]['alert'], { label: string; tone: string }> = {
  ok: { label: 'Em dia', tone: 'income' },
  sem_data: { label: 'Sem data', tone: 'transfer' },
  aviso: { label: 'Renovar em breve', tone: 'warning' },
  urgente: { label: 'Renovar já', tone: 'fee' },
  erro: { label: 'Com erro', tone: 'fee' },
  expirada: { label: 'Expirada', tone: 'fee' },
};

const useConnections = () => {
  const { finance } = useServices();
  return useQuery({ queryKey: financeKeys.connections, queryFn: () => finance.connections() });
};

function RenewHint() {
  return (
    <p className="hint">
      Para renovar, entre no{' '}
      <a href={RENEW_URL} target="_blank" rel="noreferrer noopener">
        Meu Pluggy
      </a>
      , abra a conexão da instituição e autorize de novo (vale até 12 meses). Depois, sincronize aqui.
    </p>
  );
}

/** Contas: cada conexão do Open Finance e até quando vale a autorização de leitura. */
export function Connections() {
  const connections = useConnections();
  return (
    <article className="card">
      <h2>Conexões Open Finance</h2>
      <QueryState
        isPending={connections.isPending}
        error={connections.error}
        isEmpty={(connections.data?.connections ?? []).length === 0}
        empty={<p className="hint">As conexões aparecem depois da primeira sincronização.</p>}
        skeletons={2}
      >
        <ul className="connection-list" aria-label="Conexões">
          {connections.data?.connections.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.institutionName}</strong>
                <span className="hint">
                  {consentText(c)}
                  {c.consentExpiresAt ? ` Vence em ${formatDate(c.consentExpiresAt.slice(0, 10))}.` : ''}
                </span>
              </div>
              <span className={`badge badge-${BADGE[c.alert].tone}`}>{BADGE[c.alert].label}</span>
            </li>
          ))}
        </ul>
        {connections.data?.checkedAt && (
          <p className="hint">Verificado na sincronização de {formatDateTime(connections.data.checkedAt)}.</p>
        )}
        <RenewHint />
      </QueryState>
    </article>
  );
}

/** Painel: avisa com 30 dias (e insiste com 7) que uma autorização vai vencer. Some se a API falhar. */
export function ConsentBanner() {
  const connections = useConnections();
  const text = connections.data && bannerText(connections.data);
  if (!text) return null;
  const urgent = connections.data?.connections.some((c) => needsAttention(c.alert) && c.alert !== 'aviso');
  return (
    <aside className={`card reminder${urgent ? ' reminder-urgent' : ''}`} aria-label="Open Finance">
      <div>
        <strong>{text}</strong>
        <RenewHint />
      </div>
      <Link to="/contas">Ver conexões</Link>
    </aside>
  );
}
