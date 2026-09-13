#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly project_ref="mpajyubbnnsdpgdizvht"
readonly database_host="aws-0-us-east-2.pooler.supabase.com"
readonly database_port="5432"
readonly database_name="postgres"
readonly database_user="postgres.${project_ref}"
readonly keychain_service="com.kobesbettinghub.production-supabase-backup"
readonly keychain_account="$(id -un)"
readonly pg_bin="${KBH_PG_BIN:-/opt/homebrew/opt/libpq/bin}"
readonly backup_root="${KBH_BACKUP_DIR:-${HOME}/Library/Application Support/KobesBettingHub/backups}"

for command_path in "${pg_bin}/pg_dump" "${pg_bin}/pg_restore" /usr/bin/openssl /usr/bin/security; do
  if [[ ! -x "${command_path}" ]]; then
    printf 'Required command is unavailable: %s\n' "${command_path}" >&2
    exit 1
  fi
done

backup_key="$(/usr/bin/security find-generic-password \
  -a "${keychain_account}" \
  -s "${keychain_service}" \
  -w 2>/dev/null || true)"

if [[ -z "${backup_key}" ]]; then
  backup_key="$(/usr/bin/openssl rand -hex 32)"
  /usr/bin/security add-generic-password \
    -a "${keychain_account}" \
    -s "${keychain_service}" \
    -w "${backup_key}" \
    -U >/dev/null
fi

printf 'Production Supabase database password (input hidden): '
IFS= read -r -s database_password
printf '\n'

if [[ -z "${database_password}" ]]; then
  printf 'No database password was entered; no backup was created.\n' >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${backup_root}"
encrypted_dump="${backup_root}/kbh-production-${project_ref}-${timestamp}.dump.enc"
partial_dump="${encrypted_dump}.partial"
manifest="${encrypted_dump}.manifest.txt"

cleanup() {
  rm -f "${partial_dump}"
  unset PGPASSWORD KBH_BACKUP_KEY database_password backup_key
}
trap cleanup EXIT

export PGPASSWORD="${database_password}"
export KBH_BACKUP_KEY="${backup_key}"

"${pg_bin}/pg_dump" \
  --host "${database_host}" \
  --port "${database_port}" \
  --username "${database_user}" \
  --dbname "${database_name}" \
  --format custom \
  --no-owner \
  --no-acl \
  --verbose \
  | /usr/bin/openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass env:KBH_BACKUP_KEY \
      -out "${partial_dump}"

/usr/bin/openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:KBH_BACKUP_KEY \
  -in "${partial_dump}" \
  | "${pg_bin}/pg_restore" --list - >/dev/null

mv "${partial_dump}" "${encrypted_dump}"
checksum="$(shasum -a 256 "${encrypted_dump}" | awk '{print $1}')"

{
  printf 'project_ref=%s\n' "${project_ref}"
  printf 'created_at_utc=%s\n' "${timestamp}"
  printf 'encrypted_dump=%s\n' "${encrypted_dump}"
  printf 'sha256=%s\n' "${checksum}"
  printf 'encryption=aes-256-cbc,pbkdf2,iterations=200000\n'
  printf 'keychain_service=%s\n' "${keychain_service}"
  printf 'pg_dump_version=%s\n' "$("${pg_bin}/pg_dump" --version)"
} >"${manifest}"

printf 'Encrypted production backup verified.\n'
printf 'Backup: %s\n' "${encrypted_dump}"
printf 'Manifest: %s\n' "${manifest}"
printf 'Encryption key: macOS Keychain service %s\n' "${keychain_service}"
