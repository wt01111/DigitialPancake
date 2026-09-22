#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() { echo "Usage: sudo $0 /absolute/backup-directory --confirm" >&2; exit 2; }
[[ $# -eq 2 && "$2" == --confirm ]] || usage
[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
backup_root="$(realpath -e -- /var/backups/electronic-pancake)"
backup_dir="$(realpath -e -- "$1")"
[[ "$(dirname "$backup_dir")" == "$backup_root" ]] || { echo "Backup must be a direct child of $backup_root." >&2; exit 1; }
[[ -f "$backup_dir/site.sqlite" && -d "$backup_dir/uploads" && -f "$backup_dir/SHA256SUMS" ]] || { echo "Incomplete backup." >&2; exit 1; }
(cd "$backup_dir" && sha256sum --check SHA256SUMS)
sqlite3 "$backup_dir/site.sqlite" "PRAGMA integrity_check;" | grep -qx ok
if find "$backup_dir/uploads" \! -type f \! -type d -print -quit | grep -q .; then
  echo "Backup uploads contain a link or special file." >&2; exit 1
fi

state_dir=/var/lib/electronic-pancake
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
stage_dir="$state_dir/.restore-stage-$timestamp"
rollback_dir="$state_dir/.restore-rollback-$timestamp"
snapshot_bytes="$(( $(du -sb "$backup_dir/uploads" | awk '{print $1}') + $(stat -c %s "$backup_dir/site.sqlite") + 1073741824 ))"
free_bytes="$(df --output=avail -B1 "$state_dir" | tail -1 | tr -dc '0-9')"
[[ "$free_bytes" -ge "$snapshot_bytes" ]] || { echo "Restore needs $snapshot_bytes bytes including 1 GiB reserve; only $free_bytes available." >&2; exit 1; }

# All expensive preparation happens before the service is stopped. Failure here
# cannot touch the active database or upload directory.
mkdir -m 0700 "$stage_dir" "$rollback_dir"
cleanup_preparation() { rm -rf -- "$stage_dir" "$rollback_dir"; }
trap cleanup_preparation EXIT
cp -a -- "$backup_dir/uploads/." "$stage_dir/"
install -o electronic-pancake -g electronic-pancake -m 0600 "$backup_dir/site.sqlite" "$state_dir/site.sqlite.restore"
sqlite3 "$state_dir/site.sqlite.restore" "PRAGMA integrity_check;" | grep -qx ok

service_was_active=0
systemctl is-active --quiet electronic-pancake.service && service_was_active=1
uploads_moved=0
db_moved=0
wal_moved=0
shm_moved=0
recover() {
  rc=$?
  if [[ $uploads_moved -eq 1 || $db_moved -eq 1 || $wal_moved -eq 1 || $shm_moved -eq 1 ]]; then
    echo "Restore failed; putting the original files back." >&2
    systemctl stop electronic-pancake.service || true
    if [[ $uploads_moved -eq 1 ]]; then
      rm -rf -- "$state_dir/uploads"
      mv -- "$rollback_dir/uploads" "$state_dir/uploads"
    fi
    if [[ $db_moved -eq 1 ]]; then
      rm -f -- "$state_dir/site.sqlite" "$state_dir/site.sqlite-wal" "$state_dir/site.sqlite-shm"
      mv -- "$rollback_dir/site.sqlite.original" "$state_dir/site.sqlite"
    fi
    if [[ $wal_moved -eq 1 ]]; then
      rm -f -- "$state_dir/site.sqlite-wal"
      mv -- "$rollback_dir/site.sqlite.original-wal" "$state_dir/site.sqlite-wal"
    fi
    if [[ $shm_moved -eq 1 ]]; then
      rm -f -- "$state_dir/site.sqlite-shm"
      mv -- "$rollback_dir/site.sqlite.original-shm" "$state_dir/site.sqlite-shm"
    fi
  fi
  rm -f -- "$state_dir/site.sqlite.restore"
  rm -rf -- "$stage_dir"
  if [[ $uploads_moved -eq 0 && $db_moved -eq 0 && $wal_moved -eq 0 && $shm_moved -eq 0 ]]; then rm -rf -- "$rollback_dir"; fi
  if [[ $service_was_active -eq 1 ]]; then systemctl start electronic-pancake.service; fi
  exit "$rc"
}
systemctl stop electronic-pancake.service
trap recover EXIT
sqlite3 "$state_dir/site.sqlite" ".backup '$rollback_dir/site.sqlite.backup'"
sqlite3 "$rollback_dir/site.sqlite.backup" "PRAGMA integrity_check;" | grep -qx ok

# Rollback becomes armed only after the original DB snapshot and all staging
# data are complete. Original files are renamed on the same filesystem.
mv -- "$state_dir/uploads" "$rollback_dir/uploads"
uploads_moved=1
mv -- "$state_dir/site.sqlite" "$rollback_dir/site.sqlite.original"
db_moved=1
if [[ -e "$state_dir/site.sqlite-wal" ]]; then
  mv -- "$state_dir/site.sqlite-wal" "$rollback_dir/site.sqlite.original-wal"
  wal_moved=1
fi
if [[ -e "$state_dir/site.sqlite-shm" ]]; then
  mv -- "$state_dir/site.sqlite-shm" "$rollback_dir/site.sqlite.original-shm"
  shm_moved=1
fi
mv -- "$state_dir/site.sqlite.restore" "$state_dir/site.sqlite"
mv -- "$stage_dir" "$state_dir/uploads"
chown -R electronic-pancake:electronic-pancake "$state_dir/uploads"
chmod -R u=rwX,go= "$state_dir/uploads"
sqlite3 "$state_dir/site.sqlite" "PRAGMA integrity_check;" | grep -qx ok
if [[ $service_was_active -eq 1 ]]; then
  systemctl start electronic-pancake.service
  for attempt in {1..20}; do
    if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3001/healthz >/dev/null; then break; fi
    [[ $attempt -lt 20 ]] || { echo "Restored service did not become healthy." >&2; false; }
    sleep 1
  done
fi
trap - EXIT
echo "Restore complete. Original files retained at: $rollback_dir"
