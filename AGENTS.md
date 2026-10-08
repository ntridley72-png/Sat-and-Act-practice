# Project agent instructions

## Cost-aware request routing

Spawned coding helpers use `scripts/ai-select-model.sh` and the evidence in `docs/AI_MODEL_ROUTING.md`. The default is DeepSeek V4.1 Flash for routine work, GPT-5.6 Sol for high-risk architecture/security/data/debugging, and Claude Opus 5 for frontend, visual, accessibility, interaction, and game-experience work. Selection is local and consumes no model tokens. It does not change the model of an interactive chat that is already running.

Use this routing only for coding requests: implementation, code changes, debugging, tests, refactors, or code review. Never invoke another AI for general questions, explanations, brainstorming, writing, status checks, casual conversation, or other non-coding prompts.

For each actionable coding implementation request, use `scripts/ai-free-assist.sh optimize -- <request>` once to produce a compact execution brief before starting. Skip requests already expressed as a precise implementation brief. Unless the user explicitly says not to ask questions, relay the optimizer's material clarification questions to the user before implementation. Never ask questions already answered in the conversation. If the free call fails, continue from the original request instead of blocking.

For a large request with multiple independent features or four or more likely files, also use `scripts/ai-free-assist.sh split -- <optimized brief>`. The primary model owns architecture, security-sensitive decisions, edits, integration, tests, and final verification. It may send bounded research or patch-drafting tasks to `scripts/ai-free-assist.sh work --paths <exact files> -- <task>`, then must verify any returned guidance before applying it. Never give the free worker unrelated dirty-tree files.

Use the free helper at most once per mode per user request unless the user asks for more. Do not recursively optimize reviewer or worker output.

## Cross-AI review

When the user explicitly asks for a cross-review of coding work, asks the other AIs to check a code change, or includes `cross-review` in a coding request:

1. Act as the primary implementer. Do not delegate implementation to the reviewer CLIs.
2. Track the exact repo-relative files changed for this request.
3. Finish the implementation and run the relevant local tests first.
4. Run the command with the identity of the AI currently acting as primary:
   - Codex: `scripts/ai-review-changes.sh --primary codex --paths <only files changed for this request>`
   - Claude Code: `scripts/ai-review-changes.sh --primary claude --paths <only files changed for this request>`
   - OpenCode: `scripts/ai-review-changes.sh --primary opencode --paths <only files changed for this request>`
5. Read both reports in the printed `.ai-reviews/...` directory. Verify every finding against the code; reviewer output is advisory and may be wrong.
6. Fix only verified findings, rerun the relevant tests, and summarize the review outcome.

Reviewers must only review the supplied changes. Never ask them to audit the whole repository, and never include unrelated dirty-tree files. Use one review round unless the user asks for more. Do not trigger cross-review automatically when the user did not request it, because it consumes usage in two additional AI tools.
---
Active coordination: see docs/QUESTION_BANK_IN_PROGRESS.md — app.js is being written by the question-bank pipeline; avoid editing it until the note says DONE.

## Personal writing voice

When the user asks an agent to write, rewrite, edit, revise, polish, summarize,
or draft text "in my voice," "in my own voice," "in my style," "sound like
me," or with equivalent wording, use the installed `humanizer` skill. Treat
the user's supplied writing samples as the primary voice reference and match
their sentence length, word choice, punctuation, rhythm, and deliberate
quirks. Preserve the source's meaning and every supported fact; do not invent
details to make the voice stronger. If no reliable sample is available and an
accurate personal match materially matters, ask for 2-3 representative
paragraphs. Otherwise produce a natural Humanizer rewrite and do not claim it
is an exact imitation of the user's voice.
