#!/usr/bin/env bash

set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
log="$repo_root/logs/ai-usage.jsonl"

if [[ ! -s "$log" ]]; then
  printf 'No per-question AI usage has been recorded yet.\n'
  exit 0
fi

printf 'QUESTION ID                  CALLS   INPUT   OUTPUT   CACHE READ   REPORTED COST\n'
jq -sr 'map(select(.question_id != null)) | group_by(.question_id) | .[] | {id:.[0].question_id,calls:length,input:(map(.usage.input_tokens // 0)|add),output:(map(.usage.output_tokens // 0)|add),cache:(map(.usage.cache_read_tokens // 0)|add),cost:(map(.reported_cost_usd // 0)|add)} | [.id,.calls,.input,.output,.cache,(.cost|tostring)] | @tsv' "$log" |
while IFS=$'\t' read -r id calls input output cache cost; do
  printf '%-28s %5s %7s %8s %12s   $%s\n' "$id" "$calls" "$input" "$output" "$cache" "$cost"
done
