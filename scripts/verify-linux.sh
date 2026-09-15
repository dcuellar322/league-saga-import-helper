#!/usr/bin/env bash
# Run as a regular user on a supported Debian/Ubuntu or Fedora system with sudo.
set -euo pipefail
artifacts=$(realpath "${1:?Usage: verify-linux.sh ARTIFACT_DIRECTORY}")
# shellcheck disable=SC1091
. /etc/os-release
case "$ID" in
  ubuntu|debian)
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends xvfb xauth dbus-x11 desktop-file-utils python3-yaml libglib2.0-bin xdg-utils
    ;;
  fedora)
    sudo dnf install -y xorg-x11-server-Xvfb xorg-x11-xauth dbus-daemon desktop-file-utils python3-pyyaml glib2 xdg-utils
    ;;
  *) echo "Unsupported verification distribution: $ID" >&2; exit 1 ;;
esac

# Validate every updater payload against its published SHA-512 and size.
python3 - "$artifacts" <<'PY'
import base64
import hashlib
import pathlib
import sys
import yaml
root = pathlib.Path(sys.argv[1])
metadata = yaml.safe_load((root / 'latest-linux.yml').read_text())
seen = set()
for entry in metadata['files']:
    name = entry['url']
    assert pathlib.Path(name).name == name, 'Update payload must be a local filename'
    payload = root / name
    assert payload.is_file(), f'Missing update payload: {name}'
    assert payload.stat().st_size == entry['size'], f'Incorrect update size: {name}'
    digest = base64.b64encode(hashlib.sha512(payload.read_bytes()).digest()).decode()
    assert digest == entry['sha512'], f'Incorrect update checksum: {name}'
    seen.add(payload.suffix)
assert {'.AppImage', '.deb', '.rpm'} <= seen, 'All three Linux update formats are required'
PY

shopt -s nullglob
images=("$artifacts"/*-linux-x86_64.AppImage)
test "${#images[@]}" = 1
if [[ "$ID" == fedora ]]; then
  packages=("$artifacts"/*-linux-x86_64.rpm)
  test "${#packages[@]}" = 1
  test "$(rpm -qp --queryformat '%{ARCH}' "${packages[0]}")" = x86_64
  sudo dnf install -y "${packages[0]}"
  test "$(cat "/opt/LeagueSaga Import Helper/resources/package-type")" = rpm
else
  packages=("$artifacts"/*-linux-amd64.deb)
  test "${#packages[@]}" = 1
  test "$(dpkg-deb --field "${packages[0]}" Architecture)" = amd64
  sudo apt-get install -y "${packages[0]}"
  test "$(cat "/opt/LeagueSaga Import Helper/resources/package-type")" = deb
fi
desktop=/usr/share/applications/league-saga-import-helper.desktop
desktop-file-validate "$desktop"
grep -Fq 'x-scheme-handler/leaguesaga-import' "$desktop"
xdg-mime default league-saga-import-helper.desktop x-scheme-handler/leaguesaga-import
test "$(xdg-mime query default x-scheme-handler/leaguesaga-import)" = league-saga-import-helper.desktop

# Exercise the installed desktop entry, including URL substitution and the packaged renderer.
# Only this synthetic launch gets the existing smoke-test flag; the installed entry is unchanged.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sed 's/^Exec=\(.*\) %U/Exec=\1 --smoke-test %U/' "$desktop" > "$work/helper-smoke.desktop"
grep -q -- '--smoke-test %U' "$work/helper-smoke.desktop"
link='leaguesaga-import://start?apiBase=https%3A%2F%2Fportal.leaguesaga.com&token=smoke-token&leagueId=424242&startYear=2025&importSessionId=smoke-session'
# The nested shell owns $1 and $2.
# shellcheck disable=SC2016
timeout 70s dbus-run-session -- xvfb-run -a bash -c '
  set -euo pipefail
  gio launch "$1/helper-smoke.desktop" "$2" > "$1/installed.log" 2>&1
  for attempt in $(seq 1 60); do
    if grep -q PACKAGED_SMOKE_OK "$1/installed.log"; then exit 0; fi
    sleep 1
  done
  cat "$1/installed.log"
  exit 1
' bash "$work" "$link"
cat "$work/installed.log"
grep -q PACKAGED_SMOKE_OK "$work/installed.log"

# Ubuntu 24.04 restricts user namespaces for uninstalled AppImages. Recommend the .deb there.
if [[ "$ID" != ubuntu || "$VERSION_ID" == 22.04 ]]; then
  cp "${images[0]}" "$work/helper.AppImage"
  chmod +x "$work/helper.AppImage"
  if ! timeout 60s dbus-run-session -- xvfb-run -a "$work/helper.AppImage" --appimage-extract-and-run --smoke-test "$link" > "$work/appimage.log" 2>&1; then
    tail -60 "$work/appimage.log"
    exit 1
  fi
  grep PACKAGED_SMOKE_OK "$work/appimage.log"
  grep -q PACKAGED_SMOKE_OK "$work/appimage.log"
fi
