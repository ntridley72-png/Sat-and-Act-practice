#!/usr/bin/env bash

set -euo pipefail

if (($#)) && [[ "$1" == "component" ]]; then
  shift
  (($# >= 11)) || { printf 'Usage: scripts/ai-usage-log.sh component QUESTION_ID PROVIDER MODEL ROLE STATUS INPUT OUTPUT CACHE_READ CACHE_WRITE COST DURATION [NOTE]\n' >&2; exit 1; }
  question_id="$1" provider="$2" model="$3" role="$4" status="$5" input_tokens="$6" output_tokens="$7" cache_read="$8" cache_write="$9"
  shift 9
  reported_cost="$1" duration_seconds="$2"
  shift 2
  note="${*:-}"
  repo_root="$(git rev-parse --show-toplevel)"; log_dir="$repo_root/logs"; json_log="$log_dir/ai-usage.jsonl"; markdown_log="$repo_root/docs/AI_USAGE_LOG.md"
  mkdir -p "$log_dir"
  timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  jq -cn --arg timestamp "$timestamp" --arg question_id "$question_id" --arg provider "$provider" --arg model "$model" --arg role "$role" --arg status "$status" --arg note "$note" \
    --argjson input_tokens "${input_tokens:-0}" --argjson output_tokens "${output_tokens:-0}" --argjson cache_read "${cache_read:-0}" --argjson cache_write "${cache_write:-0}" --argjson duration_seconds "${duration_seconds:-0}" --arg reported_cost "$reported_cost" \
    '{timestamp:$timestamp,question_id:$question_id,provider:$provider,model:$model,role:$role,status:$status,duration_seconds:$duration_seconds,usage:{input_tokens:$input_tokens,output_tokens:$output_tokens,cache_read_tokens:$cache_read,cache_write_tokens:$cache_write},reported_cost_usd:(if $reported_cost=="" then null else ($reported_cost|tonumber) end),note:$note}' >> "$json_log"
  if [[ -f "$markdown_log" ]]; then
    printf '| %s | `%s` | %s | `%s` | %s | %s | %s | %s |\n' "$(date +'%Y-%m-%d %H:%M %Z')" "$question_id" "$provider" "$model" "$role" "$status" "$((input_tokens + output_tokens))" "$(if [[ -n "$reported_cost" ]]; then printf '$%s' "$reported_cost"; else printf 'subscription/unavailable'; fi)" >> "$markdown_log"
  fi
  exit 0
fi

if (($# < 10)) || [[ "$1" != "record" ]]; then
  printf 'Usage: scripts/ai-usage-log.sh record MODEL MODE STATUS START_COST END_COST START_INPUT END_INPUT START_OUTPUT END_OUTPUT DURATION_SECONDS [NOTE]\n' >&2
  exit 1
fi

shift
model="$1" mode="$2" status="$3" start_cost="$4" end_cost="$5" start_input="$6" end_input="$7" start_output="$8" end_output="$9"
shift 9
duration_seconds="$1"
shift
note="${*:-}"

repo_root="$(git rev-parse --show-toplevel)"
log_dir="$repo_root/logs"
json_log="$log_dir/ai-usage.jsonl"
markdown_log="$repo_root/docs/AI_USAGE_LOG.md"
mkdir -p "$log_dir"

input_delta=$((end_input - start_input))
output_delta=$((end_output - start_output))
cost_delta="$(awk -v a="$start_cost" -v b="$end_cost" 'BEGIN { printf "%.4f", b-a }')"
timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

input_rate="" output_rate="" price_source=""
case "$model" in
  *deepseek-v4-flash*|*deepseek-v4.1-flash*) input_rate="0.14"; output_rate="0.28"; price_source="OpenCode Zen, checked 2026-10-06" ;;
  *gpt-5.6-sol*) input_rate="4.00"; output_rate="20.00"; price_source="OpenAI API pricing, checked 2026-10-06" ;;
  *claude-opus-5*) input_rate="5.00"; output_rate="25.00"; price_source="Anthropic/OpenCode Zen, checked 2026-10-06" ;;
esac

estimated_cost=""
if [[ -n "$input_rate" && -n "$output_rate" ]]; then
  estimated_cost="$(awk -v i="$input_delta" -v o="$output_delta" -v ir="$input_rate" -v orate="$output_rate" 'BEGIN { printf "%.6f", (i*ir + o*orate)/1000000 }')"
fi

jq -cn \
  --arg timestamp "$timestamp" --arg model "$model" --arg mode "$mode" --arg status "$status" \
  --arg note "$note" --arg price_source "$price_source" \
  --argjson duration_seconds "$duration_seconds" --argjson input_tokens "$input_delta" --argjson output_tokens "$output_delta" \
  --arg billed_cost_delta_usd "$cost_delta" --arg estimated_cost_usd "$estimated_cost" \
  --arg aggregate_cost_usd "$end_cost" --arg aggregate_input_tokens "$end_input" --arg aggregate_output_tokens "$end_output" \
  '{timestamp:$timestamp,provider:"OpenCode",model:$model,mode:$mode,status:$status,duration_seconds:$duration_seconds,usage:{input_tokens:$input_tokens,output_tokens:$output_tokens},cost:{reported_aggregate_delta_usd:($billed_cost_delta_usd|tonumber),estimated_model_cost_usd:(if $estimated_cost_usd=="" then null else ($estimated_cost_usd|tonumber) end),estimate_basis:$price_source},provider_totals:{cost_usd:($aggregate_cost_usd|tonumber),input_tokens:($aggregate_input_tokens|tonumber),output_tokens:($aggregate_output_tokens|tonumber)},note:$note}' >> "$json_log"

if [[ -f "$markdown_log" ]]; then
  printf '| %s | OpenCode | `%s` | %s | %s | %s | %s | $%s reported aggregate delta; %s |\n' \
    "$(date +'%Y-%m-%d %H:%M %Z')" "$model" "$mode" "$status" "$input_delta" "$output_delta" "$cost_delta" \
    "$(if [[ -n "$estimated_cost" ]]; then printf '$%s estimated at current token rates' "$estimated_cost"; else printf 'model-rate estimate unavailable'; fi)" >> "$markdown_log"
fi
