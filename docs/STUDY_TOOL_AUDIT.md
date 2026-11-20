# Study-tool audit: is this a great way to prepare, and does it match the best tools?

Two questions: (1) are the questions, as a set, a good study tool (not only correct), and (2) does the app have
the features students expect from Bluebook, Khan Academy, UWorld, Magoosh/PrepScholar and Anki.
`docs/QUESTION_LOGIC_AUDIT.md` covers whether every key is right; this covers everything else.

## 1. The questions as a study tool

### Fixed in this pass

| Problem | Before | After |
|---|---|---|
| Practice tests did not follow the real blueprint. The sampler had the weights but its freshness rules crowded out scarce domains. | SAT Math Algebra 22%, Advanced Math 27%; Reading & Writing Conventions 45%, Craft & Structure 19% | SAT Math 34/34/16/16 (real: 35/35/15/15); Reading & Writing 26/26/20/28 (real: 26/26/20/28). Per-domain quotas, with the rotation rules kept inside each domain. |
| The correct answer was the longest choice (a test-wiseness giveaway). Chance is about 25%. | ACT Reading 95%, ACT Science 55%, SAT Reading & Writing 41% | 19%, 28%, 24% (guarded by `tests/question-logic.test.cjs`) |
| Wrong keys, ambiguous or broken items | see the logic audit | none among the 2,141 live questions |

### Known gaps (not fixed here)

- **Bank shape vs the real tests.** The bank is still skewed (SAT Math 32% Geometry & Trig, 20% Algebra; Reading &
  Writing 42% Conventions, 16% Craft & Structure). Tests now draw correctly from it, but there are only 190 Algebra and
  90 Craft & Structure questions to draw from. More Algebra, Advanced Math and Craft & Structure questions would help most.
- **ACT English has 20 live questions and ACT Reading 37.** A real ACT has 50 and 36 per test. These are too few to
  practise from, and English covers only Conventions (no Production of Writing or Knowledge of Language).
- **No figures.** Only 29 math items mention a graph or table, all as text. The real digital SAT leans on charts and graphs.
- **Grid-in (student-produced response).** 69 questions exist but are withheld because the engine cannot take a typed
  answer. The real SAT has about 25% of its math in this format.
- **Explanation depth.** Median explanation is 73 characters; 80 questions have generic "this option misreads..."
  distractor notes. Leading tools write a full worked solution per question and a reason per wrong choice.
- **Vocabulary-in-context items** do not constrain the word by context (the keys are defensible, the items are guessable).
- **Difficulty labels** and calibration against real score data have not been validated.

## 2. Features

| Feature | Notable tools | This app |
|---|---|---|
| Full-length adaptive digital SAT modules, timer with hide, question navigator, mark for review, answer elimination, highlighter, line reader | Bluebook | Had |
| Desmos graphing calculator, formula reference | Bluebook | Had |
| Tutor-style immediate feedback with explanations, AI help | Khan, UWorld | Had |
| Skill drills by topic, bookmarks, retry saved questions | Khan, UWorld | Had |
| Predicted score, score history | Magoosh, PrepScholar | Had; official-report import and history chart added earlier |
| Study plan from weak areas and a goal | Magoosh, PrepScholar, Khan | Added earlier (Plan tab) |
| Printable worksheets | Princeton Review, Kaplan | Added earlier |
| **Spaced repetition of missed questions** | Anki; UWorld flags | **Added:** Leitner queue, 1/3/7/14/30-day intervals, due count on the Practice desk and Plan, one-click review |
| **Skill mastery levels** (Not started to Mastered) | Khan | **Added:** shown in Subjects and tallied on Plan; small samples cannot reach the top levels |
| **Daily goal** with progress | Khan, Duolingo-style tools | **Added:** 10 to 100 questions a day |
| **Installable app that works offline** | Bluebook (native app), Khan | **Added:** web manifest, service worker (network first, so online users always get the current version), install button |
| Practice tests that match the real domain mix | Bluebook | **Fixed** (above) |
| Grid-in answer entry | Bluebook | Missing |
| Charts and figures in questions | Bluebook, Khan | Missing |
| Video or long-form lessons | Khan, Magoosh | Missing |
| Performance compared with other students | UWorld | Missing (needs a user base and a server) |
| Full-length ACT with real section timing | official ACT, Magoosh | Partial |

## 3. What to do next, in order of value

1. Grid-in input and scoring (unlocks 69 questions and the realistic math section).
2. Many more Algebra, Advanced Math and Craft & Structure questions, then a full ACT English and Reading bank.
3. Worked-solution explanations with a reason per wrong choice, starting with the most-missed skills.
4. Charts and tables rendered as figures.
5. Validate difficulty labels and the score predictor against uploaded official reports.
