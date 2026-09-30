#!/usr/bin/env sh
set -eu

REPOSITORY='Kingporque/Prompt-Coach-'
ASSET_URL="https://github.com/${REPOSITORY}/releases/latest/download/prompt-optimizer.zip"
DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="${DATA_ROOT}/prompt-coach-extension"
TEMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT HUP INT TERM

if ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'curl is required to download the extension.' >&2
  exit 1
fi
if ! command -v unzip >/dev/null 2>&1; then
  printf '%s\n' 'unzip is required to extract the extension.' >&2
  exit 1
fi

printf '%s\n' 'Downloading the latest Prompt Coach release...'
curl --fail --location --retry 2 "$ASSET_URL" --output "$TEMP_DIR/prompt-optimizer.zip"
mkdir -p "$INSTALL_DIR"
unzip -oq "$TEMP_DIR/prompt-optimizer.zip" -d "$INSTALL_DIR"
printf '\nExtension files are installed at:\n%s\n\n' "$INSTALL_DIR"

if command -v google-chrome >/dev/null 2>&1; then
  google-chrome --new-window 'chrome://extensions' >/dev/null 2>&1 &
elif command -v chromium >/dev/null 2>&1; then
  chromium --new-window 'chrome://extensions' >/dev/null 2>&1 &
elif command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser --new-window 'chrome://extensions' >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open -a 'Google Chrome' 'chrome://extensions' >/dev/null 2>&1 || true
else
  printf '%s\n' 'Open chrome://extensions in Chrome to finish installation.'
fi

printf '%s\n' 'In Chrome, enable Developer mode, choose Load unpacked, and select the folder above.'
printf '%s\n' 'Chrome requires this final step for extensions installed outside the Web Store.'
