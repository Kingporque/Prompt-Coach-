#!/usr/bin/env sh
set -eu

REPOSITORY='Kingporque/Prompt-Coach-'
ASSET_URL="https://github.com/${REPOSITORY}/releases/latest/download/prompt-optimizer.zip"
DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="${DATA_ROOT}/prompt-coach-extension"
TEMP_DIR="$(mktemp -d)"
EXTENSION_DIR=''

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT HUP INT TERM

if ! command -v unzip >/dev/null 2>&1; then
  printf '%s\n' 'unzip is required to extract the extension.' >&2
  exit 1
fi

printf '%s\n' 'Choose how to get Prompt Coach:'
printf '%s\n' '  1) Download the latest GitHub release'
printf '%s\n' '  2) Use an extension ZIP or extracted folder already on this computer'
printf 'Choice [1/2]: '
read -r choice

case "$choice" in
  1)
    if ! command -v curl >/dev/null 2>&1; then
      printf '%s\n' 'curl is required to download the extension.' >&2
      exit 1
    fi
    printf '%s\n' 'Downloading the latest Prompt Coach release...'
    curl --fail --location --retry 2 "$ASSET_URL" --output "$TEMP_DIR/prompt-optimizer.zip"
    mkdir -p "$INSTALL_DIR"
    unzip -oq "$TEMP_DIR/prompt-optimizer.zip" -d "$INSTALL_DIR"
    EXTENSION_DIR="$INSTALL_DIR"
    ;;
  2)
    printf 'Path to the extension ZIP or extracted folder: '
    read -r source_path
    if [ -d "$source_path" ]; then
      EXTENSION_DIR="$source_path"
    elif [ -f "$source_path" ]; then
      mkdir -p "$INSTALL_DIR"
      unzip -oq "$source_path" -d "$INSTALL_DIR"
      EXTENSION_DIR="$INSTALL_DIR"
    else
      printf 'Could not find: %s\n' "$source_path" >&2
      exit 1
    fi
    ;;
  *)
    printf '%s\n' 'Choose 1 or 2.' >&2
    exit 1
    ;;
esac

if [ ! -f "$EXTENSION_DIR/manifest.json" ]; then
  printf 'No manifest.json found at the top level of: %s\n' "$EXTENSION_DIR" >&2
  printf '%s\n' 'Choose the extracted extension folder, not its parent folder.' >&2
  exit 1
fi

printf '\nExtension files are ready at:\n%s\n\n' "$EXTENSION_DIR"

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
