# 0004. Guardar os dados em repouso num container LUKS e fazer backup com restic

- Status: Aceito
- Data: 2026-11-07

## Contexto
O disco da máquina hospedeira pode não ter criptografia completa. Reinstalar o sistema para isso é
desproporcional, mas os dados do app precisam ficar ilegíveis em caso de furto ou descarte do disco.

## Decisão
- Os dados do Mongo ficam num **arquivo-container LUKS2** com ext4, gerenciado por `scripts/vault.sh`.
- O ponto de montagem recebe `chattr +i` quando vazio, e o bind mount usa `create_host_path: false`.
  Sem o cofre aberto, o Mongo não sobe, em vez de gravar em claro.
- O backup é `mongodump` → stdout → `restic` (criptografado no cliente) num disco separado,
  com retenção 7 diários / 4 semanais / 12 mensais (`scripts/backup.sh`).

## Consequências
- Depois de cada boot é preciso abrir o cofre manualmente (a frase-senha não fica na máquina).
- Duas senhas precisam ser guardadas fora da máquina: a do LUKS e a do restic.
- Não protege contra malware rodando com o cofre aberto. Isso fica fora do escopo.
