#!/usr/bin/env bash
# Cria (ou atualiza a senha de) o usuário da aplicação no MongoDB, com acesso só ao banco da app.
# A API usa este usuário; o root fica só para administração e backup.
# Uso: scripts/mongo-app-user.sh   (com o stack de pé: docker compose up -d mongo)
set -euo pipefail
REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

env_file=$REPO_ROOT/.env
[[ -f $env_file ]] || die "não achei $env_file."
while IFS='=' read -r key value; do
  [[ $key =~ ^(MONGO_APP_USER|MONGO_APP_PASSWORD|MONGO_DB_NAME)$ ]] || continue
  value=${value%%#*}; value=${value%"${value##*[![:space:]]}"}
  printf -v "$key" '%s' "$value"
done < "$env_file"
: "${MONGO_APP_USER:?defina MONGO_APP_USER no .env}"
: "${MONGO_APP_PASSWORD:?defina MONGO_APP_PASSWORD no .env}"
MONGO_DB_NAME=${MONGO_DB_NAME:-finapp}
for v in "$MONGO_APP_USER" "$MONGO_APP_PASSWORD" "$MONGO_DB_NAME"; do
  [[ $v =~ ^[A-Za-z0-9_-]+$ ]] || die "use só letras, números, _ e - no usuário, senha e nome do banco da aplicação."
done

cd -- "$REPO_ROOT"
# O script JS vai pela entrada padrão (a senha não aparece na lista de processos).
docker compose exec -T mongo sh -c \
  'mongosh --quiet --authenticationDatabase admin -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD"' <<JS
const target = db.getSiblingDB('${MONGO_DB_NAME}');
const roles = [{ role: 'readWrite', db: '${MONGO_DB_NAME}' }];
if (target.getUser('${MONGO_APP_USER}')) {
  target.updateUser('${MONGO_APP_USER}', { pwd: '${MONGO_APP_PASSWORD}', roles });
  print('usuário da aplicação atualizado');
} else {
  target.createUser({ user: '${MONGO_APP_USER}', pwd: '${MONGO_APP_PASSWORD}', roles });
  print('usuário da aplicação criado');
}
JS
