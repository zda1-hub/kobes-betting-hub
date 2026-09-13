#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly expected_project_ref="mpajyubbnnsdpgdizvht"
readonly database_url="${DATABASE_URL:-}"
readonly backup_key="${PRODUCTION_BACKUP_KEY:-}"
readonly backup_root="${PRODUCTION_BACKUP_DIR:-${RUNNER_TEMP:-/tmp}/kbh-production-backup}"

if [[ -z "${database_url}" ]]; then
  printf 'DATABASE_URL is required.\n' >&2
  exit 1
fi
if [[ ${#backup_key} -lt 32 ]]; then
  printf 'PRODUCTION_BACKUP_KEY must contain at least 32 characters.\n' >&2
  exit 1
fi
if [[ "${database_url}" != *"sslmode=require"* && "${database_url}" != *"sslmode=verify-ca"* && "${database_url}" != *"sslmode=verify-full"* ]]; then
  printf 'DATABASE_URL must require encrypted transport.\n' >&2
  exit 1
fi

actual_project_ref="$(python3 - <<'PY'
import os
import re
from urllib.parse import unquote, urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
hostname = (parsed.hostname or '').lower()
username = unquote(parsed.username or '').lower()
direct = re.fullmatch(r'db\.([a-z0-9]{20})\.supabase\.co', hostname)
pooler = re.fullmatch(r'postgres\.([a-z0-9]{20})', username)
if direct:
    print(direct.group(1))
elif pooler and hostname.endswith('.pooler.supabase.com'):
    print(pooler.group(1))
PY
)"
if [[ "${actual_project_ref}" != "${expected_project_ref}" ]]; then
  printf 'Refusing database target: expected production project %s.\n' "${expected_project_ref}" >&2
  exit 1
fi

for command_name in python3 pg_dump pg_restore openssl shasum; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    printf 'Required command is unavailable: %s\n' "${command_name}" >&2
    exit 1
  fi
done

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${backup_root}"
encrypted_dump="${backup_root}/kbh-production-${expected_project_ref}-${timestamp}.dump.enc"
partial_dump="${encrypted_dump}.partial"
manifest="${encrypted_dump}.manifest.txt"

cleanup() {
  rm -f "${partial_dump}"
}
trap cleanup EXIT

pg_dump \
  --dbname "${database_url}" \
  --format custom \
  --no-owner \
  --no-acl \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass env:PRODUCTION_BACKUP_KEY \
      -out "${partial_dump}"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:PRODUCTION_BACKUP_KEY \
  -in "${partial_dump}" \
  | pg_restore --list - >/dev/null

mv "${partial_dump}" "${encrypted_dump}"
checksum="$(shasum -a 256 "${encrypted_dump}" | awk '{print $1}')"

{
  printf 'project_ref=%s\n' "${expected_project_ref}"
  printf 'created_at_utc=%s\n' "${timestamp}"
  printf 'encrypted_file=%s\n' "$(basename "${encrypted_dump}")"
  printf 'sha256=%s\n' "${checksum}"
  printf 'encryption=aes-256-cbc,pbkdf2,iterations=200000\n'
  printf 'pg_dump_version=%s\n' "$(pg_dump --version)"
} >"${manifest}"

printf 'Encrypted production backup verified for project %s.\n' "${expected_project_ref}"
printf 'sha256=%s\n' "${checksum}"
