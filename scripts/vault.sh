#!/usr/bin/env bash
# Cofre de dados do finapp: um arquivo-container LUKS2 com ext4 dentro, montado
# no diretório onde o MongoDB grava. Sem o cofre aberto, os dados ficam ilegíveis.
#
# Uso (como root):  sudo scripts/vault.sh create|open|close|status
# Configuração:     FINAPP_VAULT_FILE, FINAPP_VAULT_MOUNT, FINAPP_VAULT_SIZE,
#                   FINAPP_UID, FINAPP_GID — lidos do .env na raiz do repositório.
set -euo pipefail

MAPPER_NAME=finapp-vault
MAPPER_DEV=/dev/mapper/$MAPPER_NAME
REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$*"; }

# Lê só as chaves FINAPP_* do .env, sem executar o arquivo como shell.
load_env() {
  local env_file=$REPO_ROOT/.env key value
  [[ -f $env_file ]] || die "não achei $env_file (copie de .env.example)."
  while IFS='=' read -r key value; do
    [[ $key =~ ^FINAPP_[A-Z_]+$ ]] || continue
    value=${value%%#*}; value=${value%"${value##*[![:space:]]}"}
    value=${value#\"}; value=${value%\"}
    printf -v "$key" '%s' "$value"
  done < "$env_file"
  : "${FINAPP_VAULT_FILE:?defina FINAPP_VAULT_FILE no .env}"
  : "${FINAPP_VAULT_MOUNT:?defina FINAPP_VAULT_MOUNT no .env}"
  FINAPP_VAULT_SIZE=${FINAPP_VAULT_SIZE:-8G}
  FINAPP_UID=${FINAPP_UID:-${SUDO_UID:-1000}}
  FINAPP_GID=${FINAPP_GID:-${SUDO_GID:-1000}}
}

require_root() { [[ $EUID -eq 0 ]] || die "rode com sudo."; }
is_open() { [[ -e $MAPPER_DEV ]]; }
is_mounted() { mountpoint -q -- "$FINAPP_VAULT_MOUNT"; }

# Deixa o ponto de montagem imutável enquanto vazio. Se o cofre não estiver
# montado, nada (nem o Docker como root) consegue gravar dados em claro ali.
lock_mountpoint() {
  mkdir -p -- "$FINAPP_VAULT_MOUNT"
  [[ -z $(ls -A -- "$FINAPP_VAULT_MOUNT") ]] || die "$FINAPP_VAULT_MOUNT não está vazio; não vou travá-lo."
  chattr +i -- "$FINAPP_VAULT_MOUNT"
}

cmd_create() {
  require_root
  [[ ! -e $FINAPP_VAULT_FILE ]] || die "$FINAPP_VAULT_FILE já existe. Não vou sobrescrever."
  is_open && die "já existe um cofre aberto em $MAPPER_DEV."

  info "Criando container de $FINAPP_VAULT_SIZE em $FINAPP_VAULT_FILE"
  mkdir -p -- "$(dirname -- "$FINAPP_VAULT_FILE")"
  fallocate -l "$FINAPP_VAULT_SIZE" -- "$FINAPP_VAULT_FILE"
  chmod 600 -- "$FINAPP_VAULT_FILE"
  # Se qualquer passo falhar (ou for cancelado), desfaz tudo: um container pela
  # metade não pode ficar para trás parecendo um cofre válido.
  CREATING=1
  trap on_create_exit EXIT
  trap 'exit 130' INT TERM

  info "Formatando com LUKS2. Escolha uma frase-senha forte e GUARDE-A num gerenciador de senhas:"
  info "sem ela, os dados (e o cofre) são irrecuperáveis."
  # --batch-mode pula a confirmação "digite YES" (o arquivo acabou de ser criado);
  # --verify-passphrase mantém a digitação dupla da frase-senha.
  cryptsetup luksFormat --batch-mode --type luks2 --verify-passphrase -- "$FINAPP_VAULT_FILE"

  info "Abrindo para criar o sistema de arquivos"
  cryptsetup open -- "$FINAPP_VAULT_FILE" "$MAPPER_NAME"
  # Proporção de inodes padrão (sem -T largefile): o Mongo cria muitos arquivos pequenos.
  mkfs.ext4 -q -L finapp-data -- "$MAPPER_DEV"

  lock_mountpoint
  mount -- "$MAPPER_DEV" "$FINAPP_VAULT_MOUNT"
  mkdir -p -- "$FINAPP_VAULT_MOUNT/mongo"
  chown -R "$FINAPP_UID:$FINAPP_GID" -- "$FINAPP_VAULT_MOUNT"
  chmod 700 -- "$FINAPP_VAULT_MOUNT"
  CREATING=0
  info "Cofre criado e montado em $FINAPP_VAULT_MOUNT"
}

on_create_exit() {
  local rc=$?
  [[ ${CREATING:-0} == 1 ]] || return "$rc"
  printf '\033[31m✖ Falha ao criar o cofre. Desfazendo…\033[0m\n' >&2
  if is_mounted; then umount -- "$FINAPP_VAULT_MOUNT" || true; fi
  if is_open; then cryptsetup close "$MAPPER_NAME" || true; fi
  if [[ -d $FINAPP_VAULT_MOUNT ]]; then chattr -i -- "$FINAPP_VAULT_MOUNT" 2>/dev/null || true; fi
  rm -f -- "$FINAPP_VAULT_FILE"
  printf '\033[31m  Nada foi criado. Corrija o problema acima e rode create de novo.\033[0m\n' >&2
  exit "$((rc == 0 ? 1 : rc))"
}

cmd_open() {
  require_root
  [[ -f $FINAPP_VAULT_FILE ]] || die "$FINAPP_VAULT_FILE não existe (rode 'create')."
  cryptsetup isLuks -- "$FINAPP_VAULT_FILE" \
    || die "$FINAPP_VAULT_FILE não é um cofre LUKS válido (um 'create' interrompido?). Apague-o e rode 'create'."
  if is_mounted; then info "Já está montado em $FINAPP_VAULT_MOUNT"; return; fi
  is_open || cryptsetup open -- "$FINAPP_VAULT_FILE" "$MAPPER_NAME"
  mount -- "$MAPPER_DEV" "$FINAPP_VAULT_MOUNT"
  info "Cofre montado em $FINAPP_VAULT_MOUNT"
}

cmd_close() {
  require_root
  if is_mounted; then
    umount -- "$FINAPP_VAULT_MOUNT" || die "não consegui desmontar. Pare o stack antes: docker compose down"
  fi
  if is_open; then cryptsetup close "$MAPPER_NAME"; fi
  info "Cofre fechado."
}

cmd_status() {
  printf 'container : %s (%s)\n' "$FINAPP_VAULT_FILE" "$([[ -f $FINAPP_VAULT_FILE ]] && echo existe || echo ausente)"
  printf 'aberto    : %s\n' "$(is_open && echo sim || echo não)"
  printf 'montado   : %s\n' "$(is_mounted && echo "sim, em $FINAPP_VAULT_MOUNT" || echo não)"
}

load_env
case ${1:-} in
  create) cmd_create ;;
  open)   cmd_open ;;
  close)  cmd_close ;;
  status) cmd_status ;;
  *) echo "uso: sudo $0 create|open|close|status" >&2; exit 2 ;;
esac
