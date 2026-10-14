# Offline calibration pipeline

Nothing here runs on the site, in the Worker, or during chats, and nothing here is published (it is not in either build's copy list). The site never reads these reports. **There is currently no real outcome dataset, so the status is "not validated".**

```sh
python3 -I calibration/make_synthetic_fixture.py      # writes a clearly fake pipeline-test file
python3 -I calibration/fit.py --data <rows.csv> --meta <dataset.json> --out calibration/reports/<id>.json
node tests/admissions-calibration.test.cjs            # leakage, synthetic-can't-validate, contract checks
```

## Data contract (one row per application)

| column | meaning |
|---|---|
| `applicant_id` | pseudonymous; the grouping key. An applicant is kept in only the earliest cycle they appear in |
| `application_id`, `unitid`, `cycle_year` | identifiers and the admissions cycle |
| `outcome` | 1 = admitted, 0 = denied. Withdrawn and incomplete applications are excluded, not counted as 0 |
| `inst_rate_prev` | the institution's official rate (percent) from an **earlier** cycle than `cycle_year` |
| `score_step` | -1 / 0 / +1: below / within / above the enrolled middle 50% published for an **earlier** cycle |
| `test_policy_at_cycle` | policy in force that cycle |
| `source_type` | `real_deidentified`, `consented_survey`, ... or a disallowed value (`synthetic`, `ai_generated`, `aggregate`, `anecdotal`, `scraped_private`) |
| `is_synthetic` | 1 for any invented row |

The dataset metadata JSON must state `datasetId`, `license`, `collectionMethod`, `samplingFrame`, `selectionMechanism`, `isSynthetic`, `sourceType`. Document sample size, missingness, duplicates and selection bias alongside it.

Same-cycle rates and ranges already contain the outcomes being predicted, so they leak. The script cannot check the feature cut-off; the data provider must assert it.

## What `fit.py` does

1. Splits by time (train < calibration < test cycle) and by applicant, and reports leakage counts.
2. Fits an L2-regularized logistic regression on `logit(inst_rate_prev)` and `score_step`, shrunk toward the official-rate baseline.
3. On the untouched test cycle compares: the institution-rate baseline, the uncalibrated model, the sigmoid-calibrated model, and isotonic only with at least 1000 calibration rows.
4. Writes log loss, Brier, expected calibration error, reliability bins and support counts as JSON.

A lower Brier score alone does not prove better calibration; read the reliability bins and counts. Results apply only to the schools and cycles in the report.

## Status values

The script can only write `not validated` or `evaluated; human review required`; it never writes `validated`. It forces `not validated` for synthetic rows or disallowed sources (even if the metadata is mislabeled), fewer than 3 cycles, fewer than 1000 test rows, or fewer than 10 institutions. Whether a sample is representative enough to call a model validated is a human decision.

Collecting real outcomes needs consent, FERPA/COPPA review, and storage outside this repo and the production database.
