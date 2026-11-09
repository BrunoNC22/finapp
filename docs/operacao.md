# Operação de uma instância

## Primeira vez

```sh
cp .env.example .env        # preencha caminhos e senhas; chmod 600 .env
sudo scripts/vault.sh create
restic init                 # com RESTIC_REPOSITORY / RESTIC_PASSWORD_FILE exportados
docker compose up -d mongo
scripts/mongo-app-user.sh   # usuário da aplicação (só acesso ao banco da app)
docker compose up -d
```

Guarde **duas** senhas fora da máquina (num gerenciador de senhas):

- a frase-senha do cofre LUKS, sem a qual os dados locais são irrecuperáveis;
- a senha do repositório restic, sem a qual os backups são irrecuperáveis.

## Acesso pelo celular e pelo desktop (VPN)

O container `web` serve o app e repassa `/api` para a API. Ele publica **só em `127.0.0.1:8080`**. O acesso externo é feito pelo `tailscale serve`, que dá HTTPS com certificado da sua tailnet:

1. No painel do Tailscale: **DNS → HTTPS Certificates → Enable** (uma vez).
2. Na máquina: `sudo tailscale serve --bg --https=443 http://127.0.0.1:8080`.
3. No `.env`: `WEBAUTHN_RP_ID=<máquina>.<tailnet>.ts.net` e `WEBAUTHN_ORIGIN=https://<máquina>.<tailnet>.ts.net` (necessário para a digital/passkey), e então `docker compose up -d`.

Nunca use `tailscale funnel` (ele publica na internet).

## Primeiro acesso e "esqueci a senha"

Gere um código de uso único (válido por 15 min) no servidor e use-o na tela de entrada do app para cadastrar ou redefinir a senha:

```sh
docker compose exec api node dist/cli.js setup-token
```

Redefinir a senha encerra todas as sessões abertas. Depois de entrar com a senha, cadastre a digital (passkey) nas configurações.

## Conectar o Claude Code (assistente via MCP)

O finapp expõe ferramentas **somente leitura** por MCP em `/api/mcp` (ADR 0013). Gere um token de leitura e registre
o servidor no Claude Code, sem que o token apareça na tela:

```sh
TOKEN=$(docker compose exec -T api node dist/cli.js mcp-token "Claude Code")
claude mcp add --transport http --scope user finapp http://127.0.0.1:8080/api/mcp \
  --header "Authorization: Bearer $TOKEN"
unset TOKEN
```

Depois, no Claude Code: "o que mais pesou nos meus gastos nos últimos 3 meses?". Outros comandos:
`node dist/cli.js mcp-tokens` (lista e último uso) e `node dist/cli.js mcp-revoke` (revoga todos).

A ferramenta `analise_mensal` junta numa chamada tudo o que uma análise do mês precisa (o mês e o anterior,
categorias, gastos, compromissos, recorrências, renda por cenário, metas e oportunidades). O mesmo pacote sai sem MCP,
direto no servidor:

```sh
docker compose exec -T api node dist/cli.js analise-mensal          # último mês fechado
docker compose exec -T api node dist/cli.js analise-mensal 2026-10  # um mês específico
```

O Painel lembra da análise do último mês fechado até ela ser registrada. A skill de análise marca sozinha
(`node dist/cli.js analise-feita [AAAA-MM]`); no app, dá para marcar "Já fiz" ou "Pular este mês".

## Renovar o consentimento do Open Finance

A autorização de leitura de cada instituição vale até 12 meses. O finapp avisa no Painel com 30 dias de antecedência e
insiste com 7. A tela **Contas → Conexões Open Finance** mostra a validade de cada uma. A mesma informação aparece no
`/health` (só o nível e os dias, sem nomes) e na ferramenta MCP `conexoes_open_finance`.

Para renovar:

1. Entre no [Meu Pluggy](https://meu.pluggy.ai) e abra a conexão da instituição.
2. Autorize de novo.
3. No finapp, **Contas → Sincronizar agora**. O aviso some depois dessa sincronização.

Se a renovação criar uma conexão **nova** (outro ID de item no painel da Pluggy), troque o ID em `PLUGGY_ITEM_IDS` e
reinicie a API. Confira na primeira renovação e registre aqui o que aconteceu.

## Depois de reiniciar a máquina

```sh
sudo scripts/vault.sh open
docker compose up -d
```

Se o cofre não estiver aberto, o Mongo **se recusa a subir**. Isso é intencional.

## Desligar com segurança

```sh
docker compose down
sudo scripts/vault.sh close
```

## Backup

```sh
scripts/backup.sh             # dump → restic, com retenção 7d/4s/12m
scripts/backup.sh snapshots   # lista os backups
```

## Restauração

```sh
# com o cofre aberto e o mongo rodando:
restic dump latest finapp-mongo.archive.gz \
  | docker compose exec -T mongo sh -c \
      'mongorestore --archive --gzip --drop --authenticationDatabase admin \
         --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD"'
```

Teste a restauração de vez em quando. Backup que nunca foi restaurado não é backup.
