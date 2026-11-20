# Question bank logic audit

`scripts/audit-question-bank.cjs` checks that a question is *well formed* (four choices, a valid key, an
explanation). This audit checks that the keyed answer is *right*: every live question is solved a second way
and compared with its key.

```bash
node scripts/verify-question-logic.cjs          # summary and findings, exit 1 on any hard failure
node scripts/verify-question-logic.cjs --json   # machine-readable
node tests/question-logic.test.cjs              # the same, as a test (fails on any finding or any uncovered question)
```

## Result

All **2,141 live questions** (everything not withheld) are covered by an independent check. **No wrong keys.**
The audit did find and fix real defects (below), so it is not a rubber stamp.

| Set | Live | Re-solved by code | Solved by hand, blind to the key |
|---|---:|---:|---:|
| SAT Math | 951 | 798 | 153 |
| ACT Math | 175 | 175 | 0 |
| ACT Science | 381 | 275 | 106 |
| SAT Reading & Writing | 577 | 385 | 192 |
| ACT English | 20 | 0 | 20 |
| ACT Reading | 37 | 0 | 37 |

## How each question was checked

- **Templated math (about 85% of the math bank).** A solver per question family reads the *stem alone*, computes the
  answer, and the keyed choice must be the only choice equal to it. Covers linear and quadratic equations, systems,
  percent, ratio, probability, triangles and trigonometry, circles, statistics, exponential growth, margin of error.
- **Templated ACT Science.** The data table in the stem is parsed and the answer recomputed (greatest value, fastest
  change, interpolation, differences, "rises steadily"), plus a fixed rule per reasoning template (which observation
  supports which scientist, how to isolate a variable, and so on).
- **Templated Reading & Writing.** One grammar or logic rule per family (subject-verb agreement, pronouns,
  modifiers, parallelism, tense, possessives, punctuation, transitions, notes-synthesis numbers, text structure,
  evidence, inference, vocabulary in context), written independently of the generator and applied to every instance.
- **Hand-written questions with no template.** Solved from the stem (and passage) alone, *without looking at the
  key*, then compared. The answers are stored as text in `scripts/data/*-hand-solved.json`, so reordering choices
  never invalidates them.
- **Every question:** blank choices, answer leaks (only the key is labelled, has a decimal, or lacks the shared first word),
  numerically equal choices, contradictions between identical questions, runs of the same keyed position, broken
  wording (template leaks, "1 copies", non-word distractors, "a umbrella"), explanation that never reaches the key.

## Defects found and fixed

| Defect | Count | Fix |
|---|---:|---|
| ACT Science "fastest change" had perfectly linear data, so every interval tied: no single correct answer | 25 | generator now builds data with distinct steps |
| ACT Science "greatest value": only the correct choice was labelled ("Load = 400") | 18 | all choices labelled |
| ACT Science interpolation: two choices equal in value ("31" and "31.0"), awkward "250.0" | 21 | numeric-aware distractors, clean number format |
| Subject-verb agreement distractors that are not words ("expandses", "improveing", "growed") | 25 | real verb forms |
| Subject-verb agreement stems with "1 copies" | 18 | counts start at 2 |
| Pronoun stems missing an article ("submitted rule book") | 25 | "submitted the rule book" |
| Text-structure correct answer was garbled text ("a change  describing a change") | 51 | one clear sentence |
| Cross-text answer was the only choice not starting "By ..." (a giveaway) | 15 | key starts "By noting ..." |
| Purpose-of-text answer was the only choice not starting "to ..." (a giveaway) | 12 | key starts "to ..." |
| Two defensible answers: colon vs semicolon (w112), "they" vs "he or she" (w2008), a second grammatical option (w2022) | 3 | distractors replaced, explanations rewritten |
| ACT English item with no grammatical answer (ae4146) | 1 | withheld |
| Punctuation family ("The reading guide, ___ , was filed...") offered a blank choice and a second grammatical answer ("which is first of its kind"). Found afterwards by looking at a rendered test; the first pass of this audit had accepted it | 20 | rebuilt as a comma-placement item (all four choices carry the same words, one has a comma on each side); `verify-question-logic.cjs` now solves it and rejects any blank choice |
| Nine exact duplicates inflating topic counts | 9 | made distinct questions again (new topics and nouns) |
| 19-21 questions in a row all keyed to one letter | 4 runs | keys spread by a documented load-time pass in `app.js` |
| Typography ("___ :") | 3 | fixed |

`scripts/expand-topic-banks.py` carries the generator fixes, so regenerating reproduces them.

## What this does not establish

- The hand-solved tables were solved by an AI assistant, not by a credentialed human reviewer. They are an
  independent derivation, which catches key errors; they are not a substitute for editorial review.
- Answer-length bias was found and fixed afterwards (see `docs/STUDY_TOOL_AUDIT.md`): the keyed answer is now the
  longest choice in 19-28% of questions in each section, about chance. `tests/question-logic.test.cjs` guards it.
- Difficulty labels, alignment with the real tests, and the roughly 600 withheld questions were not audited.
- Some Reading items are weak in a different way: the vocabulary-in-context stems do not constrain the word's meaning
  by context alone. The keys are defensible; the items are easy to guess.

## Adding questions

`tests/question-logic.test.cjs` fails if a live question has no check. Either add a solver or rule to
`scripts/verify-question-logic.cjs`, or solve the question from its stem alone and add the *correct choice text* to
the matching `scripts/data/*-hand-solved.json`.
