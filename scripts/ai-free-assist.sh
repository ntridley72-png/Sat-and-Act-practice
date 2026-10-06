#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/ai-free-assist.sh optimize [--dry-run] [--] REQUEST
  scripts/ai-free-assist.sh split [--dry-run] [--] REQUEST
  scripts/ai-free-assist.sh work [--paths PATH ...] [--dry-run] [--] TASK

If REQUEST or TASK is omitted, input is read from stdin. All modes use your
DeepSeek API (deepseek/deepseek-flash) when that provider is configured, and
fall back to the routed OpenCode model otherwise.
Override either with AI_FREE_PROMPT_MODEL or AI_FREE_WORKER_MODEL, or override
all modes with AI_FREE_MODEL.
EOF
}

die() {
  printf 'ai-free-assist: %s\n' "$*" >&2
  exit 1
}

(($#)) || { usage >&2; exit 1; }
mode="$1"
shift
case "$mode" in
  optimize|split|work) ;;
  -h|--help) usage; exit 0 ;;
  *) die "mode must be optimize, split, or work" ;;
esac

dry_run=0
paths=()
request_parts=()
while (($#)); do
  case "$1" in
    --dry-run)
      dry_run=1
      shift
      ;;
    --paths)
      shift
      while (($#)) && [[ "$1" != "--" ]]; do
        paths+=("$1")
        shift
      done
      ;;
    --)
      shift
      while (($#)); do
        request_parts+=("$1")
        shift
      done
      ;;
    *)
      request_parts+=("$1")
      shift
      ;;
  esac
done

if ((${#request_parts[@]})); then
  request="${request_parts[*]}"
elif [[ ! -t 0 ]]; then
  request="$(cat)"
else
  die "provide a request as arguments or stdin"
fi
[[ -n "${request//[[:space:]]/}" ]] || die "request cannot be empty"

command -v git >/dev/null 2>&1 || die "git is required"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "run this inside a Git repository"
command -v opencode >/dev/null 2>&1 || die "OpenCode is not installed"

case "$mode" in
  optimize)
    agent="prompt-optimizer"
    selected_model="$("$repo_root/scripts/ai-select-model.sh" --role optimize -- "$request")"
    default_model="${AI_FREE_PROMPT_MODEL:-$selected_model}"
    ;;
  split|work)
    agent="free-worker"
    selected_model="$("$repo_root/scripts/ai-select-model.sh" --role "$mode" -- "$request")"
    default_model="${AI_FREE_WORKER_MODEL:-$selected_model}"
    ;;
esac
model="${AI_FREE_MODEL:-$default_model}"
if [[ -z "${AI_FREE_MODEL:-}" && -z "${AI_FREE_PROMPT_MODEL:-}" && -z "${AI_FREE_WORKER_MODEL:-}" ]] && opencode models 2>/dev/null | grep -Fqx "deepseek/deepseek-flash"; then
  model="deepseek/deepseek-flash"
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/sat-free-assist.XXXXXX")"
child_pid=""
cleanup() {
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -rf "$temp_dir"
}
trap cleanup EXIT
request_file="$temp_dir/request.md"
{
  printf 'Mode: %s\n' "$mode"
  if ((${#paths[@]})); then
    printf 'Allowed paths (do not inspect anything else):\n'
    printf -- '- %s\n' "${paths[@]}"
  elif [[ "$mode" == "work" ]]; then
    printf 'Allowed paths: none supplied; do not inspect the repository.\n'
  fi
  printf '\nUser request:\n%s\n' "$request"
} > "$request_file"

if ((dry_run)); then
  printf 'Mode: %s\nAgent: %s\nModel: %s\n' "$mode" "$agent" "$model"
  printf 'Dry run complete; the free model was not called.\n'
  exit 0
fi

if ! opencode models 2>/dev/null | grep -Fqx "$model"; then
  die "model is unavailable in OpenCode: $model"
fi

case "$mode" in
  optimize) instruction="Optimize the attached request. Output only the compact execution brief." ;;
  split) instruction="Split the attached request into scoped task packets for the primary model." ;;
  work) instruction="Complete the attached read-only scoped worker task for the primary model." ;;
esac

timeout_seconds="${AI_FREE_TIMEOUT_SECONDS:-20}"
[[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] || die "AI_FREE_TIMEOUT_SECONDS must be a positive integer"

stats_value() {
  local label="$1" kind="${2:-tokens}"
  opencode stats 2>/dev/null | awk -v label="$label" -v kind="$kind" '$0 ~ label { raw=$NF; if (kind=="cost") { gsub(/[^0-9.]/, "", raw); print raw; exit } mult=1; if (raw ~ /K$/) mult=1000; else if (raw ~ /M$/) mult=1000000; else if (raw ~ /B$/) mult=1000000000; gsub(/[^0-9.]/, "", raw); printf "%.0f\n", raw*mult; exit }'
}
start_cost="$(stats_value 'Total Cost' cost)"; start_input="$(stats_value '^.Input')"; start_output="$(stats_value '^.Output')"
start_cost="${start_cost:-0}"; start_input="${start_input:-0}"; start_output="${start_output:-0}"
start_epoch="$(date +%s)"
record_usage() {
  local run_status="$1" run_note="${2:-}"
  local end_cost end_input end_output duration
  end_cost="$(stats_value 'Total Cost' cost)"; end_input="$(stats_value '^.Input')"; end_output="$(stats_value '^.Output')"
  end_cost="${end_cost:-$start_cost}"; end_input="${end_input:-$start_input}"; end_output="${end_output:-$start_output}"
  duration=$(($(date +%s) - start_epoch))
  "$repo_root/scripts/ai-usage-log.sh" record "$model" "$mode" "$run_status" "$start_cost" "$end_cost" "$start_input" "$end_input" "$start_output" "$end_output" "$duration" "$run_note" || true
}

variant=""
case "$model" in
  opencode/gpt-5.6-sol|opencode/claude-opus-5) variant="low" ;;
esac

if [[ -n "$variant" ]]; then
  opencode run "$instruction" --pure --dir "$repo_root" --agent "$agent" --model "$model" \
    --variant "$variant" --file "$request_file" &
else
  opencode run "$instruction" --pure --dir "$repo_root" --agent "$agent" --model "$model" \
    --file "$request_file" &
fi
child_pid=$!
elapsed=0
while kill -0 "$child_pid" 2>/dev/null; do
  if ((elapsed >= timeout_seconds)); then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
    child_pid=""
    record_usage "timed_out" "Provider totals are exact aggregate counters; per-run deltas can include concurrent OpenCode activity."
    die "free model timed out after ${timeout_seconds}s; continue with the original request"
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
if ! wait "$child_pid"; then
  child_pid=""
  record_usage "failed" "Provider totals are exact aggregate counters; per-run deltas can include concurrent OpenCode activity."
  die "free model call failed; continue with the original request"
fi
child_pid=""
record_usage "completed" "Provider totals are exact aggregate counters; per-run deltas can include concurrent OpenCode activity."
