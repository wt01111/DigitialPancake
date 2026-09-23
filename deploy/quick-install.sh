#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

if [[ ${1:-} == "--help" ]]; then
  cat <<'EOF'
用法：sudo bash ./deploy/quick-install.sh
准备应用、邮件、备份和仅限 SSH 隧道访问的预上线环境；重复运行不会覆盖已有环境文件、数据库或站长。
EOF
  exit 0
fi
[[ $# -eq 0 ]] || { echo '错误：未知参数（用 --help 查看用法）。' >&2; exit 2; }

DOMAIN="${DOMAIN:-digitalpancake.top}"
SERVER_IP="${SERVER_IP:-43.142.159.194}"
SMTP_HOST="smtp.exmail.qq.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="pancakeking@digitalpancake.top"
SMTP_FROM="pancakeking@digitalpancake.top"
APP_USER="electronic-pancake"
APP_ROOT="/opt/electronic-pancake"
STATE_DIR="/var/lib/electronic-pancake"
ENV_FILE="/etc/electronic-pancake/app.env"

die() { printf '错误：%s\n' "$*" >&2; exit 1; }
env_quote() {
  local value=${1//\\/\\\\}
  value=${value//\"/\\\"}
  printf '"%s"' "$value"
}
[[ ${EUID} -eq 0 ]] || die "请用 sudo 运行。"
[[ $(. /etc/os-release; printf '%s' "${ID}:${VERSION_ID}") == "ubuntu:24.04" ]] || die "仅支持 Ubuntu 24.04 LTS。"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_kind=package
if [[ -d "$repo_root/.git" ]]; then
  source_kind=git
  git_repo=(git -c "safe.directory=$repo_root" -C "$repo_root")
  "${git_repo[@]}" diff --quiet && "${git_repo[@]}" diff --cached --quiet || die "工作区有未提交修改；请部署已经审核并提交的版本。"
  commit="$("${git_repo[@]}" rev-parse --verify HEAD)"
else
  bash "$repo_root/tests/package-smoke.sh" "$repo_root" || die "发布包完整性校验失败。"
  commit="$(tr -d '\r\n' <"$repo_root/DIGITALPANCAKE_RELEASE")"
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y git nginx sqlite3 rsync curl unzip xz-utils ca-certificates certbot python3-certbot-nginx
if [[ ! -x /usr/local/bin/node || ! $(/usr/local/bin/node --version 2>/dev/null) =~ ^v24\. ]]; then
  bash "$repo_root/deploy/install-node24.sh"
fi

id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o root -g root -m 0755 "$APP_ROOT" "$APP_ROOT/releases"
install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$STATE_DIR" "$STATE_DIR/uploads"
install -d -o root -g root -m 0700 /etc/electronic-pancake /var/backups/electronic-pancake

release_dir="$APP_ROOT/releases/${commit}"
if [[ -d "$release_dir" && ! -f "$release_dir/.deployment-built" ]]; then
  [[ "$release_dir" == "$APP_ROOT/releases/$commit" ]] || die "拒绝清理异常发布目录。"
  rm -rf -- "$release_dir"
fi
if [[ ! -d "$release_dir" ]]; then
  install -d -o root -g root -m 0755 "$release_dir"
  if [[ "$source_kind" == git ]]; then
    "${git_repo[@]}" archive --format=tar HEAD | tar -xf - -C "$release_dir"
  else
    cp -a -- "$repo_root/." "$release_dir/"
  fi
fi
find "$release_dir" -type d -exec chmod a+rx {} +
cd "$release_dir"
if [[ ! -f .deployment-built || ! -f dist/index.html || ! -d node_modules ]]; then
  /usr/local/bin/npm ci
  /usr/local/bin/npm run validate:content
  /usr/local/bin/npm run build
  /usr/local/bin/npm prune --omit=dev
  touch .deployment-built
  chmod 0644 .deployment-built
fi
if [[ ! -e "$ENV_FILE" ]]; then
  umask 077
  read -r -p '最高管理员登录邮箱（OWNER_EMAIL）: ' owner_email
  [[ "$owner_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "OWNER_EMAIL 格式无效。"
  read -r -s -p "腾讯企业邮箱 SMTP 密码（输入不可见）: " smtp_pass; printf '\n'
  [[ -n "$smtp_pass" && "$smtp_pass" != *$'\n'* && "$smtp_pass" != *$'\r'* ]] || die "SMTP 密码不能为空或包含换行。"
  session_secret="$(openssl rand -hex 32)"
  {
    printf 'NODE_ENV=production\nPORT=3001\nHOST=127.0.0.1\n'
    printf 'PUBLIC_ORIGIN=https://%s\nTRUST_PROXY=1\n' "$DOMAIN"
    printf 'SESSION_SECRET=%s\n' "$session_secret"
    printf 'DATABASE_PATH=%s/site.sqlite\nUPLOAD_DIR=%s/uploads\n' "$STATE_DIR" "$STATE_DIR"
    printf 'OWNER_EMAIL=%s\nOWNER_NICKNAME=Admin\n' "$owner_email"
    printf 'SMTP_HOST=%s\nSMTP_PORT=%s\nSMTP_SECURE=%s\n' "$SMTP_HOST" "$SMTP_PORT" "$SMTP_SECURE"
    printf 'SMTP_USER=%s\nSMTP_PASS=' "$SMTP_USER"; env_quote "$smtp_pass"; printf '\nSMTP_FROM=%s\n' "$SMTP_FROM"
  } >"$ENV_FILE"
  chown root:root "$ENV_FILE"; chmod 0600 "$ENV_FILE"
  unset smtp_pass session_secret
  umask 022
else
  printf '保留已有 %s，未覆盖任何密钥。\n' "$ENV_FILE"
fi

systemd-run --quiet --wait --collect --uid="$APP_USER" --gid="$APP_USER" \
  --property="EnvironmentFile=$ENV_FILE" --working-directory="$release_dir" \
  /usr/local/bin/node server/verify-smtp.js

previous_target="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
release_rollback_active=1
rollback_release() {
  local status=$?
  trap - ERR INT TERM
  if [[ $release_rollback_active -eq 1 ]]; then
    if [[ -n "$previous_target" && -d "$previous_target" ]]; then
      ln -sfn "$previous_target" "$APP_ROOT/current.rollback"
      mv -Tf "$APP_ROOT/current.rollback" "$APP_ROOT/current"
      systemctl restart electronic-pancake.service || true
    else
      rm -f "$APP_ROOT/current"
      systemctl stop electronic-pancake.service || true
    fi
  fi
  exit "$status"
}
trap rollback_release ERR INT TERM
ln -sfn "$release_dir" "$APP_ROOT/current.new"
mv -Tf "$APP_ROOT/current.new" "$APP_ROOT/current"

install -o root -g root -m 0644 deploy/electronic-pancake.service /etc/systemd/system/electronic-pancake.service
install -o root -g root -m 0644 deploy/electronic-pancake-backup.service /etc/systemd/system/electronic-pancake-backup.service
install -o root -g root -m 0644 deploy/electronic-pancake-backup.timer /etc/systemd/system/electronic-pancake-backup.timer
install -o root -g root -m 0644 deploy/nginx/electronic-pancake-staging.conf /etc/nginx/sites-available/electronic-pancake-staging.conf
if [[ ! -e /etc/nginx/sites-enabled/electronic-pancake.conf ]]; then
  ln -sfn /etc/nginx/sites-available/electronic-pancake-staging.conf /etc/nginx/sites-enabled/electronic-pancake-staging.conf
  rm -f /etc/nginx/sites-enabled/default
fi
systemd-analyze verify /etc/systemd/system/electronic-pancake.service
nginx -t
systemctl daemon-reload
systemctl enable electronic-pancake.service electronic-pancake-backup.timer nginx
systemctl restart electronic-pancake.service
systemctl start electronic-pancake-backup.timer
systemctl reload-or-restart nginx
healthy=0
for _ in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3001/healthz >/dev/null; then healthy=1; break; fi
  sleep 1
done
if [[ $healthy -ne 1 ]]; then
  echo "错误：新版本未在 30 秒内通过健康检查；正在恢复上一版本。" >&2
  false
fi
if [[ -e /etc/nginx/sites-enabled/electronic-pancake-staging.conf ]]; then
  curl --fail --silent --show-error http://127.0.0.1:8080/ >/dev/null
fi
release_rollback_active=0
trap - ERR INT TERM

if ! owner_count="$(sqlite3 "$STATE_DIR/site.sqlite" "SELECT count(*) FROM users WHERE role='owner';")"; then
  die "无法确认最高管理员状态；为避免覆盖账号，已停止初始化。"
fi
[[ "$owner_count" =~ ^[0-9]+$ ]] || die "最高管理员状态异常，未执行初始化。"
if [[ "$owner_count" == "0" ]]; then
  printf '\n现在初始化最高管理员。密码输入不可见，且不会写入环境文件。\n'
  systemd-run --quiet --wait --collect --pty --uid="$APP_USER" --gid="$APP_USER" \
    --property="EnvironmentFile=$ENV_FILE" --working-directory="$APP_ROOT/current" \
    /usr/local/bin/node server/init-owner.js
fi

if [[ -e /etc/nginx/sites-enabled/electronic-pancake.conf ]]; then
  printf '\n更新完成（提交 %s）。正式域名配置保持启用。\n' "$commit"
else
  printf '\n安装完成（提交 %s）。完整站点仅监听服务器 127.0.0.1:8080。\n' "$commit"
  printf '本机测试：ssh -L 8080:127.0.0.1:8080 <SSH用户>@%s，然后访问 http://127.0.0.1:8080\n' "$SERVER_IP"
  printf 'HTTP 临时地址不能登录；生产 Secure Cookie 未被降低。域名就绪后运行 sudo bash deploy/enable-https.sh。\n'
fi
