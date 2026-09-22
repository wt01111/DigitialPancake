#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ ${EUID} -eq 0 ]] || { echo "deployment-smoke must run as root on a disposable CI runner" >&2; exit 1; }
command -v nginx >/dev/null
command -v openssl >/dev/null
command -v curl >/dev/null
command -v ss >/dev/null

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
smoke_root="$(mktemp -d /tmp/electronic-pancake-nginx.XXXXXX)"
running_pid=""
cleanup() {
  if [[ -n "$running_pid" ]] && kill -0 "$running_pid" 2>/dev/null; then
    kill -TERM "$running_pid" 2>/dev/null || true
    wait "$running_pid" 2>/dev/null || true
  fi
  rm -rf -- "$smoke_root"
}
trap cleanup EXIT INT TERM

mkdir -p "$smoke_root/www/.well-known/acme-challenge" "$smoke_root/logs"
printf 'smoke-index\n' >"$smoke_root/www/index.html"
printf 'acme-probe\n' >"$smoke_root/www/.well-known/acme-challenge/smoke-token"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=digitalpancake.test' \
  -keyout "$smoke_root/key.pem" -out "$smoke_root/cert.pem" >/dev/null 2>&1

base_port=$((20000 + RANDOM % 10000))
staging_port=$base_port
http_port=$((base_port + 1))
https_port=$((base_port + 2))

render_common() {
  sed \
    -e "s#DOMAIN_PLACEHOLDER#digitalpancake.test#g" \
    -e "s#root /opt/electronic-pancake/current/dist;#root $smoke_root/www;#g" \
    -e "s#/var/log/nginx/electronic-pancake.access.log#$smoke_root/logs/access.log#g" \
    -e "s#/var/log/nginx/electronic-pancake.error.log#$smoke_root/logs/error.log#g" \
    "$1"
}

start_fragment() {
  local fragment=$1
  cat >"$smoke_root/nginx.conf" <<EOF
user root;
pid $smoke_root/nginx.pid;
error_log $smoke_root/logs/main-error.log;
events { worker_connections 64; }
http {
  access_log $smoke_root/logs/main-access.log;
  include $fragment;
}
EOF
  nginx -p "$smoke_root/" -c "$smoke_root/nginx.conf" -t
  nginx -p "$smoke_root/" -c "$smoke_root/nginx.conf"
  running_pid="$(cat "$smoke_root/nginx.pid")"
}

stop_fragment() {
  kill -TERM "$running_pid"
  for _ in {1..50}; do kill -0 "$running_pid" 2>/dev/null || break; sleep 0.1; done
  ! kill -0 "$running_pid" 2>/dev/null
  running_pid=""
  rm -f "$smoke_root/nginx.pid"
}

render_common "$project_root/deploy/nginx/electronic-pancake-staging.conf" |
  sed "s#127.0.0.1:8080#127.0.0.1:$staging_port#" >"$smoke_root/staging.conf"
start_fragment "$smoke_root/staging.conf"
ss -ltn | grep -Fq "127.0.0.1:$staging_port"
curl --noproxy '*' --fail --silent "http://127.0.0.1:$staging_port/" | grep -Fq smoke-index
stop_fragment

render_common "$project_root/deploy/nginx/electronic-pancake-domain.conf" |
  sed -e "s/listen 80;/listen 127.0.0.1:$http_port;/" -e '/listen \[::\]:80;/d' \
  >"$smoke_root/domain.conf"
start_fragment "$smoke_root/domain.conf"
curl --noproxy '*' --fail --silent --resolve "digitalpancake.test:$http_port:127.0.0.1" \
  "http://digitalpancake.test:$http_port/.well-known/acme-challenge/smoke-token" | grep -Fq acme-probe
stop_fragment

render_common "$project_root/deploy/nginx/electronic-pancake-tls.conf" |
  sed \
    -e "s/listen 80;/listen 127.0.0.1:$http_port;/" \
    -e '/listen \[::\]:80;/d' \
    -e "s/listen 443 ssl;/listen 127.0.0.1:$https_port ssl;/" \
    -e '/listen \[::\]:443 ssl;/d' \
    -e "s#/etc/letsencrypt/live/digitalpancake.test/fullchain.pem#$smoke_root/cert.pem#" \
    -e "s#/etc/letsencrypt/live/digitalpancake.test/privkey.pem#$smoke_root/key.pem#" \
  >"$smoke_root/tls.conf"
start_fragment "$smoke_root/tls.conf"
curl --noproxy '*' --fail --silent --resolve "digitalpancake.test:$http_port:127.0.0.1" \
  "http://digitalpancake.test:$http_port/.well-known/acme-challenge/smoke-token" | grep -Fq acme-probe
curl --noproxy '*' --silent --head --resolve "digitalpancake.test:$http_port:127.0.0.1" \
  "http://digitalpancake.test:$http_port/check" | grep -Fiq 'Location: https://digitalpancake.test/check'
curl --noproxy '*' --fail --silent --insecure --resolve "digitalpancake.test:$https_port:127.0.0.1" \
  "https://digitalpancake.test:$https_port/" | grep -Fq smoke-index
stop_fragment

echo "PASS: isolated Nginx staging, ACME and TLS template smoke tests"
