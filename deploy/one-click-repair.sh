#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
  cat <<'EOF'
用法：sudo bash ./deploy/one-click-repair.sh [--owner-email <邮箱>]

更新应用并保留数据库和附件，恢复最高管理员，启用 HTTPS，然后执行服务器验收。
未传 --owner-email 时恢复预设的 QQ 站长邮箱；参数可覆盖该邮箱。
新密码由服务器随机生成，并在全部步骤完成或后续步骤失败时只显示一次。
EOF
}

default_owner_email="tong60536@qq.com"
owner_email="$default_owner_email"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner-email)
      [[ $# -ge 2 ]] || { echo '错误：--owner-email 缺少值。' >&2; exit 2; }
      owner_email=$2
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf '错误：未知参数：%s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ ${EUID} -eq 0 ]] || { echo '错误：请用 sudo 运行。' >&2; exit 1; }
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
env_file=/etc/electronic-pancake/app.env
app_root=/opt/electronic-pancake/current
[[ "$owner_email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$ ]] || {
  echo '错误：最高管理员邮箱无效；请用 --owner-email 指定。' >&2
  exit 1
}

# quick-install owns the backup and release rollback. Owner initialization is
# deferred so this repair path never asks for, receives, or stores a password.
SKIP_OWNER_INIT=1 bash "$repo_root/deploy/quick-install.sh"

recovery_output=""
recovery_pending=0
env_candidate=""
finish() {
  local status=$?
  [[ -z "$env_candidate" ]] || rm -f -- "$env_candidate"
  trap - EXIT
  if [[ $recovery_pending -eq 1 ]]; then
    printf '\n账号已恢复，但后续 HTTPS 或验收步骤失败。请保存以下登录信息，修复后可直接登录：\n' >&2
    printf '%s\n' "$recovery_output"
  fi
  exit "$status"
}
trap finish EXIT

recovery_output="$(systemd-run --quiet --wait --collect --pipe \
  --uid=electronic-pancake --gid=electronic-pancake \
  --property="EnvironmentFile=$env_file" \
  --setenv="RECOVERY_OWNER_EMAIL=$owner_email" \
  --working-directory="$app_root" \
  /usr/local/bin/node server/recover-owner.js)"
recovery_pending=1

env_candidate="$(mktemp /etc/electronic-pancake/.app.env.repair.XXXXXX)"
awk -v email="$owner_email" '
  BEGIN { replaced=0 }
  /^OWNER_EMAIL=/ { if (!replaced) { print "OWNER_EMAIL=" email; replaced=1 } next }
  { print }
  END { if (!replaced) print "OWNER_EMAIL=" email }
' "$env_file" >"$env_candidate"
chown root:root "$env_candidate"
chmod 0600 "$env_candidate"
mv -f -- "$env_candidate" "$env_file"
env_candidate=""

bash "$app_root/deploy/enable-https.sh"
bash "$app_root/deploy/verify-server.sh"
recovery_pending=0
printf '\n一键修复完成。以下新密码只显示这一次，请立即保存并在登录后更换：\n'
printf '%s\n' "$recovery_output"
