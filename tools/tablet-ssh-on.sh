#!/data/data/com.termux/files/usr/bin/bash
set -eu

AUTHORIZED_KEYS="$HOME/.ssh/authorized_keys"
MARKER="codex-tablet-temporary-setup"

if [ ! -f "$AUTHORIZED_KEYS" ] || ! grep -Fq "$MARKER" "$AUTHORIZED_KEYS"; then
  printf 'The marked Codex setup key is not installed.\n' >&2
  exit 1
fi

sed -i "/$MARKER/ s/^# DISABLED //" "$AUTHORIZED_KEYS"
chmod 700 "$HOME/.ssh"
chmod 600 "$AUTHORIZED_KEYS"

if pgrep -x sshd >/dev/null 2>&1; then
  printf 'SSH access is already enabled.\n'
else
  sshd
  printf 'SSH access enabled.\n'
fi
