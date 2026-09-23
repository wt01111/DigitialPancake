#!/usr/bin/env bash
set -Eeuo pipefail

package_root="$(cd -- "${1:-.}" && pwd -P)"
release_file="$package_root/DIGITALPANCAKE_RELEASE"
manifest="$package_root/DIGITALPANCAKE_SHA256SUMS"
[[ -f "$release_file" && -f "$manifest" ]] || { echo "missing release metadata" >&2; exit 1; }
if find "$package_root" -mindepth 1 \( -type l -o \( ! -type f ! -type d \) \) -print -quit | grep -q .; then
  echo "package contains a link or special file" >&2; exit 1
fi
release_id="$(tr -d '\r\n' <"$release_file")"
[[ "$release_id" =~ ^[0-9a-f]{40,64}$ ]] || { echo "invalid release id" >&2; exit 1; }

expected_list="$(mktemp)"; actual_list="$(mktemp)"
cleanup() { rm -f "$expected_list" "$actual_list"; }
trap cleanup EXIT
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[0-9a-f]{64}\ \ (.+)$ ]] || { echo "invalid manifest line" >&2; exit 1; }
  relative=${BASH_REMATCH[1]}
  [[ "$relative" != /* && "$relative" != *\\* && "$relative" != "DIGITALPANCAKE_SHA256SUMS" ]] || { echo "unsafe manifest path" >&2; exit 1; }
  [[ "/$relative/" != *"/../"* && "/$relative/" != *"/./"* ]] || { echo "manifest path traversal" >&2; exit 1; }
  [[ -f "$package_root/$relative" && ! -L "$package_root/$relative" ]] || { echo "manifest file missing" >&2; exit 1; }
done <"$manifest"
sed -E 's/^[0-9a-f]{64}  //' "$manifest" | LC_ALL=C sort >"$expected_list"
(cd "$package_root" && find . -type f ! -name DIGITALPANCAKE_SHA256SUMS -printf '%P\n' | LC_ALL=C sort) >"$actual_list"
cmp -s "$expected_list" "$actual_list" || { echo "package file set differs from manifest" >&2; exit 1; }
(cd "$package_root" && sha256sum --check --strict DIGITALPANCAKE_SHA256SUMS >/dev/null)
echo "PASS: digitalpancake package file set and SHA-256 manifest"
