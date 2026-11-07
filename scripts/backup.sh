#!/usr/bin/env bash
# Backup do MongoDB do finapp com restic, sem dump em claro no disco:
# mongodump (dentro do container) → stdout → restic (criptografado) → repositório.
#
# Uso:  scripts/backup.sh            # faz backup e aplica a política de retenção
#       scripts/backup.sh snapshots  # lista os backups
# Restauração: veja docs/operacao.md.
# Configuração: RESTIC_REPOSITORY e RESTIC_PASSWORD_FILE no .env.
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$*"; }

env_file=$REPO_ROOT/.env
[[ -f $env_file ]] || die "não achei $env_file."
while IFS='=' read -r key value; do
  [[ $key =~ ^RESTIC_(REPOSITORY|PASSWORD_FILE)$ ]] || continue
  value=${value%%#*}; value=${value%"${value##*[![:space:]]}"}
  export "$key=$value"
done < "$env_file"
: "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY no .env}"
: "${RESTIC_PASSWORD_FILE:?defina RESTIC_PASSWORD_FILE no .env}"
command -v restic >/dev/null || die "restic não está instalado."

if [[ ${1:-} == snapshots ]]; then exec restic snapshots; fi

cd -- "$REPO_ROOT"
docker compose ps --status running --services | grep -qx mongo \
  || die "o serviço mongo não está rodando (cofre aberto? docker compose up -d)."

info "Fazendo dump do Mongo direto para o restic"
docker compose exec -T mongo sh -c \
  'mongodump --quiet --archive --gzip --authenticationDatabase admin \
     --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD"' \
  | restic backup --quiet --tag finapp --stdin --stdin-filename finapp-mongo.archive.gz

info "Aplicando retenção (7 diários, 4 semanais, 12 mensais)"
restic forget --quiet --tag finapp --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
info "Backup concluído."
