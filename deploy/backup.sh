#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# SQLite gets a consistent snapshot during a brief service stop. Uploads are immutable after their
# final name is assigned, so rsync hard-links unchanged files to the previous
# snapshot and copies only new attachment files.
[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
export LC_ALL=C
backup_root=/var/backups/electronic-pancake
state_dir=/var/lib/electronic-pancake
retention="${BACKUP_RETENTION:-7}"
[[ "$retention" =~ ^[0-9]+$ ]] && (( retention >= 2 && retention <= 30 )) || { echo "BACKUP_RETENTION must be between 2 and 30." >&2; exit 1; }
mkdir -p "$backup_root"
chmod 0700 "$backup_root"

mapfile -t snapshots < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -printf '%f\n' | sort -r)
for ((i=retention-1; i<${#snapshots[@]}; i++)); do
  old="$backup_root/${snapshots[$i]}"
  [[ "$(dirname "$(realpath -m -- "$old")")" == "$(realpath -e -- "$backup_root")" ]] || exit 1
  rm -rf -- "$old"
done

use_percent="$(df --output=pcent "$backup_root" | tail -1 | tr -dc '0-9')"
free_bytes="$(( $(df --output=avail -B1 "$backup_root" | tail -1 | tr -dc '0-9') ))"
previous="${snapshots[0]:-}"
if [[ -n "$previous" ]]; then
  changed_bytes="$(rsync -ani --delete --link-dest="$backup_root/$previous/uploads" --stats "$state_dir/uploads/" "$backup_root/$previous/uploads/" | awk -F': ' '/^Total transferred file size:/ {gsub(/,/, "", $2); print $2+0}')"
else
  changed_bytes="$(du -sb "$state_dir/uploads" | awk '{print $1}')"
fi
database_bytes="$(stat -c %s "$state_dir/site.sqlite")"
required_bytes="$((changed_bytes + database_bytes + 2147483648))"
if [[ "$use_percent" -ge 85 || "$free_bytes" -lt "$required_bytes" ]]; then
  echo "Refusing backup: ${use_percent}% used; need $required_bytes bytes including 2 GiB reserve, have $free_bytes." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_root/$timestamp"
staging="$backup_root/.staging-$timestamp"
mkdir -m 0700 "$staging"
trap 'rm -rf -- "$staging"' EXIT

service_was_active=0
systemctl is-active --quiet electronic-pancake.service && service_was_active=1
systemctl stop electronic-pancake.service
restart_service() {
  if [[ $service_was_active -eq 1 ]]; then systemctl start electronic-pancake.service; fi
}
trap 'restart_service; rm -rf -- "$staging"' EXIT
sqlite3 "$state_dir/site.sqlite" ".timeout 10000" ".backup '$staging/site.sqlite'"
sqlite3 "$staging/site.sqlite" "PRAGMA integrity_check;" | grep -qx ok
restart_service
service_was_active=0
if [[ -n "$previous" ]]; then
  rsync -a --delete --link-dest="$backup_root/$previous/uploads" "$state_dir/uploads/" "$staging/uploads/"
else
  rsync -a --delete "$state_dir/uploads/" "$staging/uploads/"
fi
(cd "$staging" && find site.sqlite uploads -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
mv -- "$staging" "$destination"
trap - EXIT
echo "Backup created: $destination"
