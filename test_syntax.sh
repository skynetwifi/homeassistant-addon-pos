#!/bin/bash
get_json_value() {
  local key="$1" default="$2"
  if [ -f /data/options.json ]; then
    local val
    val=$(sed -n 's/.*"'"${key}"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /data/options.json || true)
    if [ -n "${val}" ]; then
      echo "${val}"
      return 0
    fi
  fi
  echo "${default}"
}
