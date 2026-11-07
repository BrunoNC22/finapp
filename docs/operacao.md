# Operação de uma instância

## Primeira vez

```sh
cp .env.example .env        # preencha caminhos e senhas; chmod 600 .env
sudo scripts/vault.sh create
restic init                 # com RESTIC_REPOSITORY / RESTIC_PASSWORD_FILE exportados
docker compose up -d
```

Guarde **duas** senhas fora da máquina (num gerenciador de senhas):
- a frase-senha do cofre LUKS, sem a qual os dados locais são irrecuperáveis;
- a senha do repositório restic, sem a qual os backups são irrecuperáveis.

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
