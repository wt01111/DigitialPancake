#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ ${1:-} == "--help" ]]; then
  cat <<'EOF'
用法：sudo bash ./deploy/enable-https.sh
仅在 ICP 备案通过、域名已解析且 80/443 已放行后，申请证书并开放正式站点。
EOF
  exit 0
fi
[[ $# -eq 0 ]] || { echo '错误：未知参数（用 --help 查看用法）。' >&2; exit 2; }

DOMAIN="${DOMAIN:-digitalpancake.top}"
EXPECTED_IP="${SERVER_IP:-43.142.159.194}"
ENV_FILE="/etc/electronic-pancake/app.env"
APP_ROOT="/opt/electronic-pancake/current"
[[ ${EUID} -eq 0 ]] || { echo '错误：请用 sudo 运行。' >&2; exit 1; }
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || { echo '错误：域名格式无效。' >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo '错误：请先运行 quick-install.sh。' >&2; exit 1; }
grep -qFx "PUBLIC_ORIGIN=https://$DOMAIN" "$ENV_FILE" || {
  echo "错误：$ENV_FILE 的 PUBLIC_ORIGIN 必须为 https://$DOMAIN；未修改 Nginx。" >&2
  exit 1
}

mapfile -t resolved < <(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u)
printf '%s\n' "${resolved[@]:-}" | grep -Fxq "$EXPECTED_IP" || {
  printf '错误：%s 尚未解析到 %s，未申请证书。\n' "$DOMAIN" "$EXPECTED_IP" >&2
  exit 1
}

certificate="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
active_config="/etc/nginx/sites-available/electronic-pancake.conf"
backup_config="$(mktemp /etc/nginx/sites-available/.electronic-pancake.backup.XXXXXX)"
had_config=0
had_staging=0
[[ -f "$active_config" ]] && { cp -a "$active_config" "$backup_config"; had_config=1; }
[[ -e /etc/nginx/sites-enabled/electronic-pancake-staging.conf ]] && had_staging=1
rollback_active=1
restore_previous() {
  local status=$?
  trap - ERR INT TERM
  if [[ $rollback_active -eq 1 ]]; then
    if [[ $had_config -eq 1 ]]; then cp -a "$backup_config" "$active_config"; else rm -f "$active_config"; fi
    if [[ $had_config -eq 1 ]]; then
      ln -sfn "$active_config" /etc/nginx/sites-enabled/electronic-pancake.conf
    else
      rm -f /etc/nginx/sites-enabled/electronic-pancake.conf
    fi
    if [[ $had_staging -eq 1 ]]; then
      ln -sfn /etc/nginx/sites-available/electronic-pancake-staging.conf /etc/nginx/sites-enabled/electronic-pancake-staging.conf
    fi
    nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  fi
  rm -f "$backup_config"
  exit "$status"
}
trap restore_previous ERR INT TERM
install_config() {
  local template=$1 candidate
  candidate="$(mktemp /etc/nginx/sites-available/.electronic-pancake.candidate.XXXXXX)"
  sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$template" >"$candidate"
  chown root:root "$candidate"; chmod 0644 "$candidate"
  mv -f "$candidate" "$active_config"
  ln -sfn "$active_config" /etc/nginx/sites-enabled/electronic-pancake.conf
  nginx -t
  systemctl reload nginx
}
if [[ ! -f "$certificate" ]] || ! openssl x509 -checkend 86400 -noout -in "$certificate" >/dev/null; then
  install_config "$APP_ROOT/deploy/nginx/electronic-pancake-domain.conf"
  certbot certonly --webroot --webroot-path "$APP_ROOT/dist" --non-interactive \
    --agree-tos -d "$DOMAIN" --register-unsafely-without-email
fi
install_config "$APP_ROOT/deploy/nginx/electronic-pancake-tls.conf"

rm -f /etc/nginx/sites-enabled/electronic-pancake-staging.conf
install -d -o root -g root -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/bin/systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
systemctl enable --now certbot.timer
nginx -t
systemctl reload nginx
systemctl restart electronic-pancake.service
healthy=0
for _ in {1..30}; do
  if curl --fail --silent --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" >/dev/null && \
     curl --fail --silent http://127.0.0.1:3001/healthz >/dev/null; then healthy=1; break; fi
  sleep 1
done
if [[ $healthy -ne 1 ]]; then
  echo '错误：HTTPS 或应用未在 30 秒内通过健康检查；正在恢复原Nginx配置。' >&2
  false
fi
rollback_active=0
rm -f "$backup_config"
trap - ERR INT TERM
printf 'HTTPS 已启用：https://%s\n' "$DOMAIN"
