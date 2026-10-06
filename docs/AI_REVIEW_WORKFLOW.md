# Cross-AI change review

This project can use Codex, Claude Code, or OpenCode as the primary implementer. After the primary finishes and tests a requested change, the other two tools can review that change without editing it.

## Use it from any AI

Add this to your request:

> Implement this, test it, then cross-review only the files you changed.

The project instructions tell each supported AI which `--primary` value to use. The runner automatically selects the other two reviewers.

## Run it yourself

```sh
scripts/ai-review-changes.sh --primary codex --paths subjects.js subjects.css
scripts/ai-review-changes.sh --primary claude --paths subjects.js subjects.css
scripts/ai-review-changes.sh --primary opencode --paths subjects.js subjects.css
```

Replace the file list with only the files changed for that task. This is important in a working tree that already contains unrelated work.

Reports and diagnostic logs are saved under `.ai-reviews/`, which Git ignores. Each reviewer is given the same diff and mandatory instructions to avoid whole-repository review, unrelated issues, edits, deployments, and recursive AI calls. The primary AI must verify findings before changing code.

## Usage

Each run makes two additional AI requests: one to each non-primary tool. Codex review calls are pinned to GPT-5.6 Sol with low reasoning; Claude review calls are pinned to Claude Opus 5 with low effort; OpenCode review calls are pinned to DeepSeek V4.1 Flash. Usage is charged by those tools according to their own account or plan. The workflow limits Claude to four turns and sends only the selected diff, with a default 500 KB safety cap. Use one round for normal changes and narrow `--paths` to keep usage predictable.

To validate the package without spending AI usage:

```sh
scripts/ai-review-changes.sh --primary codex --dry-run --paths subjects.js subjects.css
```

## Free prompt and task helper

The project routes coding helpers with the local evidence-based selector in `scripts/ai-select-model.sh`. General questions, writing, brainstorming, status checks, and casual conversation stay with the single AI you are using. Large, separable coding requests can be split into task packets, and scoped code research can be drafted by the selected worker:

```sh
scripts/ai-free-assist.sh optimize -- "Add subject-specific SAT practice"
scripts/ai-free-assist.sh split -- "Rebuild the two racing games and add controls"
scripts/ai-free-assist.sh work --paths games.js games.css -- "Identify the smallest safe control-system patch"
```

Prompt cleanup and routine work default to DeepSeek V4.1 Flash. High-risk architecture, security, data, deployment, and difficult debugging route to GPT-5.6 Sol. Frontend, visual, accessibility, interaction, animation, and game work route to Claude Opus 5. Large mixed-feature decomposition routes to GPT-5.6 Sol. The optimizer asks up to three material clarification questions by default; include “don't ask questions” to proceed with assumptions. Set `AI_ROUTER_MODEL` to force a model, or use the existing role-specific environment overrides. Calls time out after 20 seconds and never silently substitute another model.

DeepSeek is a remote, usage-billed model rather than a local model. The workflow falls back to the original request if a helper call fails, and it never silently substitutes another model.
