#!/usr/bin/env bash
# Ensaio de restauração: prova que o último backup volta inteiro, SEM tocar no banco da instância.
# Restaura o snapshot mais recente do restic num MongoDB temporário (em memória, sem rede) e compara as contagens de
# documentos de cada coleção com a instância. Só imprime nomes de coleções e números.
#
# Uso: scripts/restore-drill.sh        (com o cofre aberto e a instância rodando, para a comparação)
# Configuração: RESTIC_REPOSITORY e RESTIC_PASSWORD_FILE no .env (as mesmas do backup.sh).
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
DRILL=finapp-restore-drill
MONGO_IMAGE=mongo:8.0.34 # mesma versão da instância (compose.yaml)
DB=finapp
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

docker rm -f "$DRILL" >/dev/null 2>&1 || true
trap 'docker rm -f "$DRILL" >/dev/null 2>&1 || true' EXIT

snapshot=$(restic snapshots --json --tag finapp --latest 1 | python3 -c 'import json,sys; s=json.load(sys.stdin); print(s[-1]["short_id"], s[-1]["time"][:19]) if s else None')
[[ -n $snapshot && $snapshot != None ]] || die "nenhum snapshot com a tag finapp."
read -r snap_id snap_time <<<"$snapshot"
info "Snapshot $snap_id ($snap_time)"

info "Subindo um MongoDB temporário (em memória, sem rede)"
docker run -d --name "$DRILL" --network none --tmpfs /data/db "$MONGO_IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$DRILL" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1 && break
  sleep 1
done

info "Restaurando"
restic dump --tag finapp latest finapp-mongo.archive.gz \
  | docker exec -i "$DRILL" mongorestore --quiet --archive --gzip --nsInclude "$DB.*"

COUNT_JS="const d = db.getSiblingDB('$DB'); const out = {};
for (const c of d.getCollectionNames().sort()) out[c] = d.getCollection(c).countDocuments();
print(JSON.stringify(out));"
restored=$(docker exec "$DRILL" mongosh --quiet --eval "$COUNT_JS")

live='{}'
if (cd "$REPO_ROOT" && docker compose ps --status running --services 2>/dev/null | grep -qx mongo); then
  live=$(cd "$REPO_ROOT" && docker compose exec -T mongo sh -c \
    "mongosh --quiet --authenticationDatabase admin -u \"\$MONGO_INITDB_ROOT_USERNAME\" -p \"\$MONGO_INITDB_ROOT_PASSWORD\" --eval \"$COUNT_JS\"")
else
  info "Instância parada: sem comparação, só o que foi restaurado"
fi

python3 -I - "$restored" "$live" "$snap_id" "$snap_time" <<'PY'
import json, sys
restored, live = json.loads(sys.argv[1]), json.loads(sys.argv[2])
snap_id, snap_time = sys.argv[3], sys.argv[4]
essential = ['accounts', 'transactions', 'categories']
print(f"\n{'coleção':<28}{'backup':>10}{'instância':>12}")
for name in sorted(set(restored) | set(live)):
    print(f"{name:<28}{restored.get(name, '—')!s:>10}{live.get(name, '—')!s:>12}")
missing = [c for c in essential if not restored.get(c)]
gone = [c for c in live if c not in restored and live[c] > 0]
ok = not missing
print()
if missing:
    print(f"✖ FALHOU: coleções essenciais vazias ou ausentes no backup: {', '.join(missing)}")
else:
    print(f"✔ OK: snapshot {snap_id} de {snap_time} restaurado, {sum(restored.values())} documentos.")
if gone:
    print(f"  observação: coleções que só existem na instância (criadas depois do backup?): {', '.join(gone)}")
sys.exit(0 if ok else 1)
PY
