# Project instructions for Claude Code

## Cost-aware request routing

Spawned coding helpers use `scripts/ai-select-model.sh` and the evidence in `docs/AI_MODEL_ROUTING.md`. The default is DeepSeek V4.1 Flash for routine work, GPT-5.6 Sol for high-risk architecture/security/data/debugging, and Claude Opus 5 for frontend, visual, accessibility, interaction, and game-experience work. Selection is local and consumes no model tokens. It does not change the model of an interactive chat that is already running.

Use this routing only for coding requests: implementation, code changes, debugging, tests, refactors, or code review. Never invoke another AI for general questions, explanations, brainstorming, writing, status checks, casual conversation, or other non-coding prompts.

For each actionable coding implementation request, run `scripts/ai-free-assist.sh optimize -- <request>` once and use the result as a compact execution brief. Skip requests that are already precise implementation briefs. Unless the user explicitly says not to ask questions, relay the optimizer's material clarification questions before implementation, without repeating questions already answered in the conversation. If the free call fails, continue from the original request.

For a large request with multiple independent features or four or more likely files, run `scripts/ai-free-assist.sh split -- <optimized brief>`. Keep architecture, sensitive decisions, actual edits, integration, tests, and final verification with the primary model. Bounded research or patch-drafting may use `scripts/ai-free-assist.sh work --paths <exact files> -- <task>`; verify its output before applying anything. Use each mode at most once per request and never recursively optimize AI output.

## Cross-AI review

When the user explicitly asks for a cross-review of coding work, asks the other AIs to check a code change, or includes `cross-review` in a coding request:

1. Be the primary implementer and keep a list of the exact repo-relative files changed for this request.
2. Complete the change and its relevant local tests before requesting reviews.
3. Run `scripts/ai-review-changes.sh --primary claude --paths <only files changed for this request>`.
4. Read the Codex and OpenCode reports saved in the printed `.ai-reviews/...` directory.
5. Independently verify each finding. Apply only valid fixes, then rerun relevant tests and summarize the result.

The review scope is only the supplied changes. Do not include unrelated dirty-tree files or request a whole-repository audit. Use one review round unless the user asks for more. Do not run this workflow unless the user requested cross-review, because it consumes usage in two additional AI tools.

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
