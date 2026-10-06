#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/ai-select-model.sh --role optimize|split|work|review [--explain] [--] REQUEST

Selects a coding model locally without making an AI request. The policy is
documented in docs/AI_MODEL_ROUTING.md. Set AI_ROUTER_MODEL to force a model.
EOF
}

role=""
explain=0
request_parts=()
while (($#)); do
  case "$1" in
    --role)
      (($# >= 2)) || { usage >&2; exit 1; }
      role="$2"
      shift 2
      ;;
    --explain)
      explain=1
      shift
      ;;
    --)
      shift
      while (($#)); do request_parts+=("$1"); shift; done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      request_parts+=("$1")
      shift
      ;;
  esac
done

case "$role" in
  optimize|split|work|review) ;;
  *) usage >&2; exit 1 ;;
esac

if [[ -n "${AI_ROUTER_MODEL:-}" ]]; then
  model="$AI_ROUTER_MODEL"
  reason="explicit AI_ROUTER_MODEL override"
else
  request="${request_parts[*]}"
  normalized="$(printf '%s' "$request" | tr '[:upper:]' '[:lower:]')"

  high_risk_pattern='security|authentication|authorization|payment|billing|privacy|secret|credential|database migration|data loss|concurrency|race condition|architecture|infrastructure|deployment|production outage|root cause'
  visual_pattern='frontend|front-end|ui|ux|css|layout|theme|color|visual|animation|canvas|game|racing|drift|responsive|accessibility|design|mockup'

  if [[ "$role" == "optimize" ]]; then
    model="opencode/deepseek-v4.1-flash"
    reason="low-cost prompt normalization does not need a premium model"
  elif printf '%s' "$normalized" | grep -Eq "$high_risk_pattern"; then
    model="opencode/gpt-5.6-sol"
    reason="high-risk architecture, security, data, deployment, or difficult debugging"
  elif printf '%s' "$normalized" | grep -Eq "$visual_pattern"; then
    model="opencode/claude-opus-5"
    reason="frontend, visual, interaction, accessibility, or game experience work"
  elif [[ "$role" == "split" ]]; then
    model="opencode/gpt-5.6-sol"
    reason="large multi-part request needs stronger coordination"
  else
    model="opencode/deepseek-v4.1-flash"
    reason="routine coding or review favors the strongest cost/performance default"
  fi
fi

printf '%s\n' "$model"
if ((explain)); then
  printf 'Reason: %s\n' "$reason" >&2
fi
