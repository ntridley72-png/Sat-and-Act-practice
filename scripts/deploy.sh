#!/usr/bin/env bash
# Deploy, then tell the search engines immediately.
#
# WHY THIS EXISTS. IndexNow submission already runs, but on a 7-day Temporal
# schedule (temporal/client.js). A page published the day after a run waits up
# to a week before Bing, Yandex, Seznam or Naver hear about it. Submitting
# right after a deploy closes that to minutes, and costs one HTTP call.
#
# ORDER MATTERS: submit AFTER wrangler finishes, never before. IndexNow tells
# a crawler "this URL changed, come and look"; if it arrives before the deploy
# is live the crawler fetches the old page, records it as unchanged, and the
# submission is worse than useless because it burns the URL's quota.
#
# The weekly schedule stays as the safety net for anything this misses.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> deploying"
npx wrangler deploy "$@"

echo "==> submitting changed URLs to IndexNow"
# Never let a submission failure fail the deploy: the site is already live and
# the weekly run will catch up. Report it loudly and carry on.
if node scripts/indexnow.mjs; then
  echo "==> submitted"
else
  echo "WARNING: IndexNow submission failed (exit $?). The deploy is live;" >&2
  echo "         the weekly Temporal run will pick these URLs up." >&2
fi
