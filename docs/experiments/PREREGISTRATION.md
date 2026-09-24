# Preregistration: agent-mode quality comparison

**Status:** registered, not started. No live model has been run. Frozen on 2026-09-24; any change
after the first live test-split run must be recorded in §10 with date and reason, and results must
be reported against both the original and the amended plan.

**Harness:** `evaluation/` (`node evaluation/src/cli.mjs`). Normative gates: `docs/product/06_EVALUATION_AND_ACCEPTANCE.md`.

## 1. Question

Does added workflow complexity (independent review, bounded team, structured challenge, learned
routing) produce a *material* improvement in accepted engineering work over the next simpler arm,
after cost and latency, on tasks with deterministic acceptance tests?

"More agents is better" is not assumed (D-028). Every hypothesis compares one added mechanism to the
arm immediately below it.

## 2. Arms (ordered by complexity)

| Arm | Definition | Evidence class |
|---|---|---|
| A0 `noop` | no change | baseline (lower bound) |
| A1 `deterministic` | deterministic checks only, no edits | baseline |
| A2 `direct` | one model worker, one call, same tools/context as others | live |
| A3 `reviewed` | A2 + one independent reviewer (different context, no worker transcript beyond the patch and task), at most one correction round | live |
| A4 `team` | planner → implementer → challenger, ≤ 2 rounds, same total budget cap as A3 × 2 | live |
| A5 `debate` | A3 with one structured challenge/response step instead of free review | live |
| R-rules / R-model | routers choosing A2/A3/A4 per task | live |
| `reference` | oracle solution | upper bound |
| `scripted-*` | replayed hand-written responses | **mechanics only, not quality evidence**; never used for any hypothesis |

All live arms use the same model versions (pinned, recorded), temperature, context policy, tool
access, and per-task timeout. Arm order per task is randomized with a recorded seed.

## 3. Hypotheses

| ID | Hypothesis | Comparison | Tasks |
|---|---|---|---|
| H1 | Reviewed accepts more tasks than Direct | A3 vs A2 | all |
| H2 | Team accepts more tasks than Reviewed on `multi-component` and `security-sensitive` classes | A4 vs A3 | those classes only (declared now) |
| H3 | One structured challenge/response beats one independent review | A5 vs A3 | all |
| H4 | A model router beats the rules router on cost per accepted task without lowering acceptance | R-model vs R-rules | all |
| H0-safety | No arm increases severe safety failures (`security-sensitive` tasks failing, protected-data transfer, unauthorized writes) relative to the arm below it | each pair | all |

## 4. Primary metric and decision rule

- **Primary:** task acceptance = all hidden acceptance tests pass (`evaluation/src/grader.mjs`).
  Refusals, timeouts, patch rejections, budget exhaustion and harness errors are **failures** and stay
  in the denominator.
- **Test:** two-sided exact McNemar on paired tasks, α = 0.05 per hypothesis, Holm correction across
  H1–H4.
- **Effect size:** paired bootstrap 95% CI of the pass-rate difference (10 000 resamples, seed 1).
- **Material improvement (all must hold):**
  1. McNemar significant after Holm;
  2. lower CI bound of the difference ≥ +5 percentage points;
  3. point estimate ≥ +10 percentage points;
  4. cost per accepted task no more than 2.0× the simpler arm, and p95 latency no more than 3.0×;
  5. H0-safety not violated.
- If 1–3 hold but 4 fails, the mechanism is "better but not worth it by default" (opt-in only).
- A non-significant result is reported as "no detected improvement at this sample size", with the
  CI, never as "equivalent".

**Secondary** (reported, not decisive): cost per accepted task, p50/p95 latency, changed lines,
reviewer precision/recall on material defects (labels in `task.json`), correction success rate,
error correlation between worker and reviewer (share of tasks both fail), per-class pass rates.

## 5. Sample size (power analysis)

Paired design, two-sided exact McNemar, α = 0.05, power 0.8. `discordant` is the share of tasks on
which the two arms disagree; it is unknown before a pilot. Computed by
`node evaluation/src/cli.mjs power` (exact enumeration; normal approximation in parentheses):

| true difference | discordant 0.15 | 0.20 | 0.30 | 0.40 |
|---|---|---|---|---|
| +10 pp | 122 (116) | 168 (155) | 249 (234) | 329 (312) |
| +15 pp | 52 (50) | 72 (68) | 112 (103) | 147 (138) |

Decision: **plan for ≥ 170 test-split tasks per hypothesis** (detects +10 pp if disagreement ≤ 20%),
and re-estimate `discordant` from the pilot. If the pilot shows discordance ≥ 0.3, either grow the
corpus to ≥ 250 or register +15 pp as the minimum detectable effect before the test run. The current
16-task corpus is sufficient only for mechanics validation and a pilot; **no hypothesis can be decided
on it**: at n = 16 the exact test has power 0.34 for a +30 pp difference and 0.67 for +40 pp even
when every disagreement favours the new arm (`mcnemarExactPower`).

Repeated runs: each live arm runs each task 3 times; the task outcome is the majority result
(pre-registered) and run-to-run disagreement is reported as a nondeterminism metric.

## 6. Dataset and splits

- Development split: the 16 tasks in `evaluation/tasks/` (all authored by one person, labels
  `single-author-unadjudicated`). Used for harness development and the pilot only.
- Calibration split: pilot tasks for router thresholds and `discordant` estimation.
- **Test split:** ≥ 170 new tasks from different repositories/task families, written and labelled by
  people who did not write the arm prompts, with a second labeller and adjudication. Stored outside
  the prompt-development workflow; hashes of the test split are committed before the first run.
- **No tuning on the test split:** prompts, budgets, routing thresholds, and arm definitions are frozen
  before the first test-split run. A test-split run that is followed by any change to these is void
  for confirmatory purposes.
- Mix targets: ≥ 25% `security-sensitive`, ≥ 25% `multi-component`, ≥ 10% `ambiguous-spec`,
  Russian/English/code-switched instructions per `06` §2.

## 7. Stop conditions

Stop immediately and report as a finding if: protected content reaches a provider outside the
allowed destinations; spend exceeds the approved budget; any arm writes outside its work directory;
evidence (results, transcripts) is corrupted or unreproducible; or a model output alters grading
(tests, harness, labels). Budget-exhausted tasks are failures, not missing data.

## 8. What the harness does today (no models)

- Real measurements: analyzer precision/recall (`evaluation/results/code-health.json`), corpus
  validity (reference 16/16 pass, empty patch 0/16), deterministic baseline arms
  (`evaluation/results/baseline-arms.json`).
- Mechanics checks only: `scripted-direct|reviewed|team` replay hand-written responses to verify the
  review loop, one-correction limit, round limit, budget stop, refusal accounting, and report
  labelling (`evaluation/results/agent-arms-mechanics-only.json`). These rows are **not** quality
  evidence and are excluded from all hypotheses.

## 9. What a human must provide to run the live experiment

1. **Authorization:** written approval for live model calls, per-provider, with a spend cap
   (estimate: 170 tasks × 3 runs × 5 arms × ≈ 4 calls ≈ 10 000 calls) and allowed data destinations.
2. **Provider and model pins:** provider, exact model version strings, temperature, context limits;
   keys supplied via environment variables only (never committed; `TYPESAFE_API_KEY`, `LAYA_API_KEY`
   or new names registered in the safety document).
3. **Model adapter:** implement a live arm behind the existing `arm.run(task, budget)` contract
   (`evaluation/src/arms.mjs`) that routes all calls through a ModelGateway with usage capture; the
   scripted arms define the expected control flow.
4. **Sandbox:** tested code currently runs with Node's permission model (filesystem restricted, no
   child processes) and a scrubbed environment, but **network is not blocked**. Model-written code
   must run in a network-isolated container/VM before live runs.
5. **Test split:** ≥ 170 independently written and double-labelled tasks, hashes committed first.
6. **Privacy review:** confirm that task content is eligible for the chosen providers (all current
   tasks are synthetic and contain no private code).

## 10. Amendments

None.
