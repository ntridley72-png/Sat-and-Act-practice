# Evidence-based coding model routing

Last reviewed: 2026-10-06

This policy chooses a model locally before a spawned coding-helper call. It does not ask multiple models to vote, so selection itself uses zero tokens. The primary AI still owns edits, integration, testing, and final judgment.

## Routing table

| Work type | Default model | Why |
|---|---|---|
| Prompt cleanup | DeepSeek V4.1 Flash | Cheapest sufficient option for concise normalization |
| Routine code research or patch drafting | DeepSeek V4.1 Flash | Strong agentic-coding cost/performance and positive current developer reports |
| Architecture, security, authentication, payments, data migration, deployment, or difficult root-cause work | GPT-5.6 Sol | Stronger judgment for complex professional work; use low reasoning unless risk requires more |
| Frontend, CSS, visual design, interaction, accessibility, games, or animation | Claude Opus 5 | Premium coding model suited to polished, long-running implementation work |
| Large mixed-feature task decomposition | GPT-5.6 Sol | Coordinated planning benefits from the stronger general engineering model |
| Independent budget review | DeepSeek V4.1 Flash | Preserves provider diversity at lower cost |

The selector uses high-risk rules before visual rules. For example, a payment-screen redesign routes to GPT-5.6 Sol because payment correctness outweighs visual specialization.

## Evidence used

- [OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection) describes Sol as appropriate for complex projects where quality and cost both matter.
- [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol) identifies it as a flagship professional-work model.
- [Anthropic's Claude Opus page](https://www.anthropic.com/claude/opus?lang=us) recommends Opus 5 for demanding production coding and long-running agent work.
- [OpenCode Zen pricing](https://dev.opencode.ai/docs/zen/) shows the available model IDs and current relative token prices.
- [DeepSeek V4.1 Flash discussion in the OpenCode community](https://www.reddit.com/r/opencodeCLI/comments/1wcca5d/deepseek_v41_flash_is_now_available_on_opencode_go/) reports its focus on faster agentic coding.
- [Current developer experience thread](https://www.reddit.com/r/DeepSeek/comments/1wgohh2/deepseek_v41_flash_is_truly_amazing/) is positive about V4.1 Flash but also notes that independent checking can catch gaps.
- [Contrary Claude Code experience](https://www.reddit.com/r/ClaudeCode/comments/1vwec8t/im_done_with_opus_5/) is kept as a caution that no premium model wins every maintenance task.

Vendor benchmarks and forum reports are directional, not guarantees. Forum anecdotes are lower-confidence evidence than official documentation and reproducible project tests.

## Updating the policy

Recheck this file when models, pricing, or real project outcomes materially change. Prefer, in order:

1. This project's measured success rate, regressions, latency, and cost.
2. Reproducible independent benchmarks.
3. Official model documentation and pricing.
4. Multiple recent developer reports rather than a single enthusiastic post.

Record actual usage and outcomes in `docs/AI_USAGE_LOG.md`. Do not switch models solely because of one benchmark or forum comment.
