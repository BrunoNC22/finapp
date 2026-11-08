import { NavLink, Outlet } from 'react-router';

const NAV = [
  { to: '/', label: 'Painel', end: true },
  { to: '/transacoes', label: 'Transações' },
  { to: '/parcelas', label: 'Parcelas' },
  { to: '/metas', label: 'Metas' },
  { to: '/renda', label: 'Renda' },
  { to: '/carreira', label: 'Carreira' },
  { to: '/contas', label: 'Contas' },
  { to: '/configuracoes', label: 'Configurações' },
];

/** Estrutura do app logado: navegação lateral (desktop) ou inferior (celular). */
export function AppShell() {
  return (
    <div className="shell">
      <nav className="nav" aria-label="Navegação principal">
        <span className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> finapp
        </span>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end ?? false}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

/** Página ainda não construída (fases seguintes do roadmap). */
export function Placeholder({ title }: { title: string }) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="hint">Em construção.</p>
    </section>
  );
}
