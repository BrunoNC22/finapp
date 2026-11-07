# 0012. Autenticação no estilo app de banco: senha ou digital, sessão curta só em memória

- Status: Aceito
- Data: 2026-11-07

## Contexto

O app expõe dados financeiros pessoais. Mesmo acessível só pela VPN (ADR 0003), um dispositivo da rede pode estar comprometido ou emprestado. O dono quer o comportamento que já conhece dos apps de banco: ao abrir, pede senha ou digital; fechou e abriu, pede de novo.

## Decisão

- **Senha** (8 a 128 caracteres, hash **scrypt** nativo do Node) **ou digital** (passkey/WebAuthn com `userVerification: required`, via SimpleWebAuthn).
- **Sessão como app de banco:** token Bearer aleatório de 256 bits. No banco só fica o SHA-256 dele. O front guarda o token **só em memória**: fechou ou recarregou, pede de novo. Expira após **10 min sem uso** (renovada a cada requisição) e no limite absoluto de **12 h** (`SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS`). Sem cookies, então não há CSRF.
- **Bloqueio:** 5 senhas erradas seguidas bloqueiam por 15 min (429 com `Retry-After`). Mensagens de erro genéricas.
- **Primeiro acesso e "esqueci a senha":** código de uso único (15 min) gerado **no terminal do servidor** (`node dist/cli.js setup-token`). Redefinir a senha encerra todas as sessões.
- **Guard global:** toda rota exige sessão, exceto as marcadas com `@Public()` (health, status, setup e login). Um teste e2e **varre todas as rotas registradas** e garante 401 sem sessão.
- O assistente de IA (MCP) terá token próprio, só de leitura (ADR 0008).

## Consequências

- Usuário único por instância (o domínio modela um `Owner`).
- Passkeys exigem que o app seja aberto num domínio estável com HTTPS (`WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`: o nome da máquina na VPN).
- Os desafios WebAuthn ficam em memória: a API roda numa instância só.
