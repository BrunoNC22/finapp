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
