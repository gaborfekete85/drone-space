#!/usr/bin/env bash
# Outputs JSON for the highest-priority project item matching the given
# label in the AI-ready column, or the literal string "No task" if none
# match.
#
# usage: get_next_task.sh <label>
#
# Buckets are tried HIGH → NORMAL → LOW; the first non-empty bucket wins
# and only its FIRST item is returned (so the caller can pipe straight
# into `jq -r .id`).
#
# Project / owner / column are read from ../config.json so swapping
# boards doesn't require touching this script.

set -euo pipefail

label="${1:?usage: $0 <label>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${SCRIPT_DIR}/../config.json"
[[ -f "$CONFIG" ]] || { echo "config not found: $CONFIG" >&2; exit 2; }

proj=$(jq -r '.project_number' "$CONFIG")
owner=$(jq -r '.owner' "$CONFIG")
col=$(jq -r '.ready_column' "$CONFIG")

for prio in HIGH NORMAL LOW; do
  # `-c` (compact) keeps the whole object on one line so callers can pipe
  # the response straight into `jq -r .id` without re-parse issues from
  # newlines inside the body field.
  match=$(gh project item-list "$proj" --owner "$owner" --format json --limit 200 2>/dev/null \
    | jq -c --arg s "$col" --arg l "$label" --arg p "$prio" '
        # Suffix-based priority match — tolerant of label prefix spelling
        # ("priority:HIGH", "proirity:HIGH", "urgency:HIGH" all work).
        first(
          .items[]
          | select(.status == $s)
          | select((.labels // []) | any(test($l; "i")))
          | select((.labels // []) | any(test(":" + $p + "$"; "i")))
          | { id, title, url, body: .content.body, labels }
        ) // empty')
  if [ -n "$match" ]; then
    printf '%s\n' "$match"
    exit 0
  fi
done

echo "No task"
