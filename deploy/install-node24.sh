#!/usr/bin/env bash
set -Eeuo pipefail

# Run manually as root on Ubuntu 24.04. This installs an official, checksum-
# verified Node.js binary rather than Ubuntu's older default nodejs package.
NODE_VERSION="${NODE_VERSION:-24.21.0}"
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi
case "$NODE_VERSION" in 24.*) ;; *) echo "NODE_VERSION must be a Node 24 release." >&2; exit 1;; esac

archive="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
base="https://nodejs.org/dist/v${NODE_VERSION}"
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
cd "$temp_dir"
curl --fail --show-error --location --proto '=https' --tlsv1.2 -O "$base/$archive" -O "$base/SHASUMS256.txt"
grep "  $archive\$" SHASUMS256.txt | sha256sum --check --strict
install_dir="/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
if [[ -e "$install_dir" ]]; then echo "$install_dir already exists; refusing to overwrite." >&2; exit 1; fi
tar -xJf "$archive" -C /opt
ln -sfn "$install_dir/bin/node" /usr/local/bin/node
ln -sfn "$install_dir/bin/npm" /usr/local/bin/npm
ln -sfn "$install_dir/bin/npx" /usr/local/bin/npx
node --version
npm --version
