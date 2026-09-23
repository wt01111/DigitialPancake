#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-digitalpancake.top}"
EXPECTED_IP="${SERVER_IP:-43.142.159.194}"
APP_ROOT=/opt/electronic-pancake
STATE_DIR=/var/lib/electronic-pancake
ENV_FILE=/etc/electronic-pancake/app.env

die() { printf '验收失败：%s\n' "$*" >&2; exit 1; }
pass() { printf '通过：%s\n' "$*"; }

[[ ${EUID} -eq 0 ]] || die '请用 sudo 运行。'
[[ $(. /etc/os-release; printf '%s' "${ID}:${VERSION_ID}") == ubuntu:24.04 ]] || die '系统不是 Ubuntu 24.04 LTS。'
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || die '域名格式无效。'
[[ "$EXPECTED_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die 'IPv4 格式无效。'
pass '操作系统为 Ubuntu 24.04 LTS'

[[ -L "$APP_ROOT/current" && -d "$APP_ROOT/current" ]] || die 'current 发布链接无效。'
[[ -f "$APP_ROOT/current/.deployment-built" && -f "$APP_ROOT/current/dist/index.html" ]] || die '当前发布未完成构建。'
pass "当前发布：$(readlink -f "$APP_ROOT/current")"

[[ -f "$ENV_FILE" ]] || die '生产环境文件不存在。'
[[ $(stat -c '%U:%G:%a' "$ENV_FILE") == root:root:600 ]] || die '环境文件必须为 root:root 且权限 0600。'
grep -qFx "PUBLIC_ORIGIN=https://$DOMAIN" "$ENV_FILE" || die "PUBLIC_ORIGIN 不是 https://$DOMAIN。"
grep -qFx "DATABASE_PATH=$STATE_DIR/site.sqlite" "$ENV_FILE" || die 'DATABASE_PATH 未使用兼容持久化目录。'
grep -qFx "UPLOAD_DIR=$STATE_DIR/uploads" "$ENV_FILE" || die 'UPLOAD_DIR 未使用兼容持久化目录。'
pass '环境文件路径、属主和权限正确'

[[ -f "$STATE_DIR/site.sqlite" ]] || die '生产数据库不存在。'
[[ -d "$STATE_DIR/uploads" ]] || die '上传目录不存在。'
[[ $(stat -c '%U:%G' "$STATE_DIR") == electronic-pancake:electronic-pancake ]] || die '持久化目录属主错误。'
[[ $(sqlite3 "$STATE_DIR/site.sqlite" 'PRAGMA integrity_check;') == ok ]] || die 'SQLite 完整性检查失败。'
pass '数据库、上传目录和 SQLite 完整性正常'

systemctl is-active --quiet electronic-pancake.service || die '应用服务未运行。'
systemctl is-enabled --quiet electronic-pancake-backup.timer || die '备份定时器未启用。'
curl --fail --silent --show-error http://127.0.0.1:3001/healthz >/dev/null || die '应用健康检查失败。'
ss -ltnH 'sport = :3001' | awk '{print $4}' | grep -Eq '^(127\.0\.0\.1|\[::1\]):3001$' || die 'API 未监听本机回环地址。'
if ss -ltnH 'sport = :3001' | awk '{print $4}' | grep -Ev '^(127\.0\.0\.1|\[::1\]):3001$' | grep -q .; then
  die 'API 端口 3001 同时暴露在非回环地址。'
fi
pass '应用服务健康，API 端口只监听本机'

nginx -t
if [[ -e /etc/nginx/sites-enabled/electronic-pancake.conf ]]; then
  mapfile -t resolved < <(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u)
  printf '%s\n' "${resolved[@]:-}" | grep -Fxq "$EXPECTED_IP" || die "$DOMAIN 未解析到 $EXPECTED_IP。"
  curl --fail --silent --show-error --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" >/dev/null || die '本机 HTTPS 首页检查失败。'
  pass "正式 HTTPS 与 DNS 正常（$DOMAIN -> $EXPECTED_IP）"
else
  [[ -e /etc/nginx/sites-enabled/electronic-pancake-staging.conf ]] || die '预上线与正式 Nginx 配置均未启用。'
  curl --fail --silent --show-error http://127.0.0.1:8080/ >/dev/null || die '预上线页面检查失败。'
  pass '预上线站点只通过本机 127.0.0.1:8080 可用'
fi

printf '\n电子煎饼服务器验收通过。\n'
