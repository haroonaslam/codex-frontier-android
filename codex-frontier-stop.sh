#!/data/data/com.termux/files/usr/bin/bash
set -eu

APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"
RUNTIME_ENTRY="$APP_HOME/vendor/codexapp-frontier-src/dist-cli/index.js"
RUN_DIR="$APP_HOME/runtime/.codex/run"
PID_FILE="$RUN_DIR/codexapp.pid"
STATE_FILE="$RUN_DIR/runtime-state.json"
PORT=5902

is_owned_pid() {
  pid_value="$1"
  case "$pid_value" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ -r "/proc/$pid_value/cmdline" ] || return 1
  command_line="$(tr '\000' ' ' < "/proc/$pid_value/cmdline" 2>/dev/null || true)"
  case "$command_line" in
    *"$RUNTIME_ENTRY"*"-p $PORT"*) return 0 ;;
    *) return 1 ;;
  esac
}

mkdir -p "$RUN_DIR"
pid_value="$(sed -n '1p' "$PID_FILE" 2>/dev/null || true)"
if ! is_owned_pid "$pid_value"; then
  rm -f "$PID_FILE"
  printf '{"state":"stopped","pid":0,"port":%s,"updatedAt":%s}\n' "$PORT" "$(date +%s)" > "$STATE_FILE"
  exit 0
fi

stat_line="$(sed -n '1p' "/proc/$pid_value/stat" 2>/dev/null || true)"
stat_tail="${stat_line#*) }"
set -- $stat_tail
process_group="${3:-0}"
session_id="${4:-0}"
if [ "$process_group" != "$pid_value" ] || [ "$session_id" != "$pid_value" ]; then
  printf 'Refusing to stop an unverified process group.\n' >&2
  exit 75
fi

kill -TERM -- "-$pid_value" 2>/dev/null || true
attempt=0
while is_owned_pid "$pid_value" && [ "$attempt" -lt 10 ]; do
  attempt=$((attempt + 1))
  sleep 1
done
if is_owned_pid "$pid_value"; then
  kill -KILL -- "-$pid_value" 2>/dev/null || true
fi
rm -f "$PID_FILE"
printf '{"state":"stopped","pid":0,"port":%s,"updatedAt":%s}\n' "$PORT" "$(date +%s)" > "$STATE_FILE"
