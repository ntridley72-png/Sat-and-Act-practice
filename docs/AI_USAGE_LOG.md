# AI usage log

This file tracks AI usage for this project over time. Add a new dated snapshot instead of replacing older entries. Usage scopes differ by provider, so do not add unlike figures together unless the scope and time period match.

Machine-readable run history is written automatically to `logs/ai-usage.jsonl` whenever `scripts/ai-free-assist.sh` calls an OpenCode model. Each record includes the requested model, outcome, duration, input/output deltas, the exact aggregate cost delta reported by OpenCode, the price table date/source, and a token-rate estimate when the model has a configured rate. Aggregate deltas may include other OpenCode activity running at the same time, so they are labeled honestly rather than presented as provider invoice line items.

## Current routing policy

- Non-coding prompts use only the AI receiving the prompt.
- Coding prompt cleanup defaults to DeepSeek V4.1 Flash.
- Large coding helpers are selected locally: DeepSeek V4.1 Flash for routine work, GPT-5.6 Sol for high-risk or complex coordination, and Claude Opus 5 for frontend/visual/game work.
- Codex, Claude, and OpenCode cross-review runs only when explicitly requested.
- Cross-reviewers receive only the selected changed files.
- OpenCode helper calls have a 20-second timeout and never substitute another model automatically.
- Spawned Codex review uses GPT-5.6 Sol with low reasoning; spawned Claude review uses Claude Opus 5 with low effort.

## Snapshot history

### 2026-10-06 02:15 EDT

| Provider or model | Measurement scope | Usage | Cost | Notes |
|---|---|---:|---:|---|
| Codex | Current 5-hour account window | 43% used, 57% remaining | Included in Plus plan | Resets 2026-10-06 06:31 EDT |
| Codex | Current 7-day account window | 24% used, 76% remaining | Included in Plus plan | Resets 2026-10-09 21:09 EDT |
| OpenCode, all configured models | OpenCode stored history across 27 days | 36 sessions; 3,764 messages; 14.2M input; 1.9M output; 1,039.6M cache-read; 695.3K cache-write tokens | $26.97 total; $1.00 average/day | Account-wide OpenCode history, not isolated to this repository |
| Claude Code | Current account | Unavailable | Unavailable | Interactive `/usage` was not available to this automated tracker |
| Automatic per-run log | This repository | No completed tracked run yet | $0 recorded | Tracking was installed after the latest timed-out helper call; future helper calls append automatically |

### 2026-10-06 01:52 EDT

| Provider or model | Measurement scope | Usage | Cost | Notes |
|---|---|---:|---:|---|
| Codex | Current 5-hour account window | 21% used, 79% remaining | Included in Plus plan | Resets 2026-10-06 06:31 EDT |
| Codex | Current 7-day account window | 20% used, 80% remaining | Included in Plus plan | Resets 2026-10-09 21:09 EDT |
| OpenCode, all configured models | OpenCode's stored history across 27 days | 35 sessions; 3,748 messages; 14.2M input; 1.9M output; 1,024.8M cache-read; 695.3K cache-write tokens | $26.92 total | Account-wide OpenCode history, not isolated to this repository |
| Claude Code | Current account | Unavailable | Unavailable | Claude's interactive `/usage` view was not available through the non-interactive tracker |
| DeepSeek through OpenCode | Included in OpenCode aggregate | No trustworthy model-level split available | Included in OpenCode's $26.92 aggregate where used | Do not estimate a separate amount |
| MiMo V2.6 Flash Free | Live connection tests | 0 completed responses | $0 reported | Request reached the model route but timed out |
| Nemotron 3 Ultra Free | Live connection tests | 0 completed responses | $0 reported | Request reached the model route but timed out |

## Coding-run ledger

Use one row per coding request that invokes additional models. Record zero-cost calls too, because they still affect latency and provider limits.

| Date and time | Primary AI | Task | Prompt optimizer | Free worker | Cross-reviewers | Result | Reported cost or usage |
|---|---|---|---|---|---|---|---|
| 2026-10-06 01:52 EDT | Codex | Configure cross-AI review and cost-aware routing | MiMo V2.6 Flash Free attempted | Nemotron 3 Ultra Free connection attempted | None | Configuration validated; hosted free calls timed out | $0 reported for free calls; Codex included in account limits |

## Automatically recorded OpenCode runs

| Date and time | Provider | Model | Mode | Result | Input delta | Output delta | Cost |
|---|---|---|---|---|---:|---:|---|


## How to update this log

## Per-question reviewer usage

Rows with the same question ID belong to one coding question. Token counts come from each CLI when exposed; `subscription/unavailable` means the tool did not report a per-call dollar charge.

| Date and time | Question ID | Provider | Model | Role | Result | Tokens | Reported cost |
|---|---|---|---|---|---|---:|---:|

1. Add a timestamped snapshot under **Snapshot history**.
2. Record each provider's exact reporting scope: current window, billing period, lifetime history, or project-only.
3. Copy reported numbers exactly. Use `Unavailable` rather than estimating missing usage.
4. Add coding requests to **Coding-run ledger** only when another model was actually invoked.
5. Record failed and timed-out calls as attempts, not completed responses.
6. Never include API keys, account IDs, access tokens, or full private prompts.

Useful sources:

- Codex: account usage/limits view in the Codex app.
- Claude Code: `/usage` in an interactive Claude Code session.
- OpenCode: `opencode stats` for aggregate history.
- Provider billing dashboards: authoritative source for charged API usage.

## Blank snapshot template

### YYYY-MM-DD HH:MM timezone

| Provider or model | Measurement scope | Usage | Cost | Notes |
|---|---|---:|---:|---|
| Codex |  |  |  |  |
| Claude Code |  |  |  |  |
| OpenCode |  |  |  |  |
| DeepSeek |  |  |  |  |
| Free model |  |  | $0 or unavailable |  |
| 2026-10-06 02:36 EDT | OpenCode | `opencode/claude-opus-5` | work | timed_out | 0 | 0 | $0.0000 reported aggregate delta; $0.000000 estimated at current token rates |
| 2026-10-06 02:42 EDT | OpenCode | `opencode/claude-opus-5` | work | timed_out | 0 | 0 | $0.0000 reported aggregate delta; $0.000000 estimated at current token rates |
| 2026-10-06 02:55 EDT | `2026-10-06-cli-setup` | codex-cli | `gpt-5.6-sol` | cli-install | completed | 1991 | subscription/unavailable |
| 2026-10-06 02:55 EDT | `2026-10-06-cli-setup` | claude-cli | `claude-opus-5` | ui-design | failed | 0 | subscription/unavailable |
| 2026-10-06 03:12 EDT | `q-20261006-031004` | codex | `gpt-5.6-sol` | reviewer | completed | 750695 | subscription/unavailable |
| 2026-10-06 03:15 EDT | `q-20261006-031004` | claude | `claude-opus-5` | reviewer | completed | 8918 | $2.297049 |
| 2026-10-06 03:33 EDT | OpenCode | `opencode/claude-opus-5` | work | failed | 0 | 0 | $0.0000 reported aggregate delta; $0.000000 estimated at current token rates |
| 2026-10-06 03:44 EDT | `q-20261006-034354` | codex | `gpt-5.6-sol` | reviewer | completed | 122690 | subscription/unavailable |
| 2026-10-06 03:47 EDT | `q-20261006-034354` | claude | `claude-opus-5` | reviewer | completed | 10447 | $2.0657345 |
| 2026-10-06 04:21 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 04:24 EDT | OpenCode | `deepseek/deepseek-flash` | split | timed_out | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 04:25 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | timed_out | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 04:27 EDT | OpenCode | `deepseek/deepseek-flash` | work | timed_out | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 04:46 EDT | `q-20261006-044301` | claude | `claude-opus-5` | reviewer | completed | 14678 | $4.640740500000001 |
| 2026-10-06 04:48 EDT | `q-20261006-044301` | opencode | `opencode/deepseek-v4.1-flash` | reviewer | failed | 0 | subscription/unavailable |
| 2026-10-06 10:52 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:01 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | timed_out | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:08 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:13 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:18 EDT | `q-20261006-111646` | claude | `claude-opus-5` | reviewer | completed | 5587 | $0.9205819999999999 |
| 2026-10-06 11:19 EDT | `q-20261006-111646` | opencode | `opencode/deepseek-v4.1-flash` | reviewer | failed | 0 | subscription/unavailable |
| 2026-10-06 11:25 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:30 EDT | OpenCode | `deepseek/deepseek-flash` | work | timed_out | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:39 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:50 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 11:52 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 12:08 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 12:35 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 16:17 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 16:44 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 17:06 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-06 17:16 EDT | OpenCode | `deepseek/deepseek-flash` | optimize | completed | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-07 04:54 EDT | OpenCode | `deepseek/deepseek-flash` | work | timed_out | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-07 05:53 EDT | OpenCode | `deepseek/deepseek-flash` | work | timed_out | 0 | 0 | $0.0000 reported aggregate delta; model-rate estimate unavailable |
| 2026-10-07 05:56 EDT | `q-20261007-055615` | codex | `gpt-5.6-sol` | reviewer | completed | 22244 | subscription/unavailable |
| 2026-10-07 05:57 EDT | `q-20261007-055615` | claude | `claude-opus-5` | reviewer | completed | 3987 | $0.387088 |
| 2026-10-07 06:00 EDT | `q-20261007-045404` | codex | `gpt-5.6-sol` | reviewer | completed | 121569 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-053406` | codex | `gpt-5.6-sol` | designer | completed | 193425 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-055225` | codex | `gpt-5.6-sol` | reviewer | completed | 253047 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-045500` | claude | `claude-opus-5` | designer | completed | 11786 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-051300` | claude | `claude-opus-5` | designer | completed | 50767 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-053700` | claude | `claude-opus-5` | designer | failed | 2534 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-054000` | claude | `claude-opus-5` | designer | completed | 30531 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-042600` | codex | `gpt-5.6-sol` | designer | completed | 0 | subscription/unavailable |
| 2026-10-07 06:00 EDT | `q-20261007-042700` | claude | `claude-opus-5` | designer | completed | 0 | subscription/unavailable |
