#!/data/data/com.termux/files/usr/bin/bash
set -eu

AUTHORIZED_KEYS="$HOME/.ssh/authorized_keys"
MARKER="codex-tablet-temporary-setup"

if [ -f "$AUTHORIZED_KEYS" ] && grep -Fq "$MARKER" "$AUTHORIZED_KEYS"; then
  sed -i "/$MARKER/ { /^# DISABLED /! s/^/# DISABLED /; }" "$AUTHORIZED_KEYS"
  chmod 600 "$AUTHORIZED_KEYS"
fi

pkill -x sshd 2>/dev/null || true
printf 'SSH access disabled; the marked key remains saved.\n'
