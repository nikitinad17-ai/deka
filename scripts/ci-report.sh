#!/usr/bin/env bash
# Запускает команду; если она падает, выводит последние строки как аннотации GitHub,
# чтобы причину было видно без полного лога.
log=$(mktemp)
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  echo "::error::Команда «$*» завершилась с кодом $code"
  grep -iE "error|failed|exception|cannot|could not|not found" "$log" | tail -n 8 | while IFS= read -r line; do
    echo "::error::${line:0:900}"
  done
fi
exit "$code"
