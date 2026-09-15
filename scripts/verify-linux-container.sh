#!/usr/bin/env bash
# Bootstrap only a disposable container, never a user's desktop.
set -euo pipefail
# shellcheck disable=SC1091
. /etc/os-release
case "$ID" in
  debian)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y --no-install-recommends sudo ca-certificates
    ;;
  fedora)
    dnf install -y sudo shadow-utils util-linux ca-certificates
    ;;
  *) echo "Unsupported container distribution: $ID" >&2; exit 1 ;;
esac
useradd -m -s /bin/bash verifier
printf 'verifier ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/verifier
chmod 440 /etc/sudoers.d/verifier
exec runuser -u verifier -- bash /checks/verify-linux.sh /artifacts
