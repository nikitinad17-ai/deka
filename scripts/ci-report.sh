#!/usr/bin/env bash
# Запускает команду; если она падает, выводит последние строки как аннотации GitHub,
# чтобы причину было видно без полного лога.
log=$(mktemp)
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  echo "::error::Команда «$*» завершилась с кодом $code"
  { grep -E "^e: |^w: .*deprecated|What went wrong" -A2 "$log" | head -n 12
    grep -iE "error|failed|exception|cannot|could not|not found|unresolved" "$log" | tail -n 6; } | head -n 16 | while IFS= read -r line; do
    echo "::error::$(printf %s "${line:0:600}" | sed "s/\x1b\[[0-9;]*m//g")"
  done
fi
exit "$code"
