# Offline evaluation harness

Infrastructure for comparing deterministic baseline, Direct, Reviewed and Team modes on identical
tasks with deterministic acceptance tests. **No network, no model providers, no API keys.** Live
arms are deliberately not implemented; the preregistered plan is in
`docs/experiments/PREREGISTRATION.md`.

## What is a measurement here and what is not

| Output | Kind |
|---|---|
| `results/code-health.{json,md}`: analyzer precision/recall per rule | **measurement** of `lib/analyzers.js` on a small synthetic single-author corpus |
| `validate`: reference passes, empty patch fails for every task | **measurement** of corpus validity |
| `results/baseline-arms.json`: noop / deterministic / reference | **measurement** of deterministic baselines (lower/upper bounds) |
| `results/agent-arms-mechanics-only.json`: `scripted-*` arms | **mechanics only, not quality evidence** — replayed hand-written responses |

## Commands

```powershell
node evaluation/src/cli.mjs list
node evaluation/src/cli.mjs validate
node evaluation/src/cli.mjs code-health --write
node evaluation/src/cli.mjs run --write                          # noop, deterministic, reference
node evaluation/src/cli.mjs run --arms scripted-direct,scripted-reviewed,scripted-team --tasks t01,t03,t05,t06,t07,t12 --max-cost 50 --write
node evaluation/src/cli.mjs power --delta 0.1 --discordant 0.15,0.2,0.3,0.4
node evaluation/fixtures/build-scripted-responses.mjs            # regenerate scripted fixture
node --test                                                      # includes evaluation/test (< 10 s)
```

## Layout

```text
evaluation/
  corpus/code-health/   labelled snippets (positives + negative twins) for analyzer rules
  tasks/tNN-*/          task.json, repo/ (visible fixture), acceptance/ (hidden tests), reference/ (oracle)
  fixtures/             scripted responses (mechanics only) and their generator
  src/                  patch, grader, tasks, arms, runner, stats, code-health, cli
  test/                 node:test suites
  results/              committed outputs of the commands above
```

## Task format

`task.json` fields: `id`, `title`, `class` (`easy | medium | multi-component | security-sensitive |
ambiguous-spec`), `instruction` (the only prose an arm sees), `timeoutMs`, and `labels` following
`docs/product/06` §2: `minimumSafeMode`, `impact`, `reversible`, `securitySensitive`,
`acceptanceCriteria`, `materialDefectsInFixture`, `allowedDataDestinations`, `requiredApprovals`,
`labeler`. Security-sensitive tasks must have `minimumSafeMode >= reviewed` (validated).

Arms receive `publicView(task)` only: `{ id, title, class, instruction, files }`.

## Arm contract

```js
arm.run(task, budget) -> { patch, usage, latencyMs, transcriptRef, status, trace? }
```

- `patch`: `null | { type: 'none' } | { type: 'files', files: { path: content|null } } | { type: 'unified-diff', diff }`
- `usage`: `{ modelCalls, inputTokens, outputTokens, costUnits }`
- `status`: `completed | refused | budget-exhausted | error` — every status is graded; none is dropped.
- Budgets are enforced by the arm driver before each call: scripted arms enforce `maxRounds` and
  `maxCostUnits`; `maxLatencyMs` is part of the contract but only a live arm (with real waiting) can
  enforce it.

## Grader

1. Copies `repo/` to a temporary directory.
2. Applies the patch. Paths escaping the work dir, absolute paths, `.git/`, and `acceptance/` are
   rejected (`patch-rejected`). Diffs apply with offset search and keep the file's EOL style.
3. Copies hidden tests into `acceptance/` and runs `node --test` in a subprocess with a timeout, a
   scrubbed environment (no inherited API keys), and Node's permission model limited to the work
   directory, with no child processes (`--test-isolation=none`).
4. Returns `pass`, `outcome` (`pass | tests-failed | timeout | patch-rejected | arm-error`), changed
   lines, files changed, and durations.

**Not a security sandbox:** network access is not blocked. Model-written code needs a
network-isolated container before live runs.

## Statistics (`src/stats.mjs`)

Wilson intervals; exact McNemar and sign test; paired bootstrap CI of the pass-rate difference
(seeded); cost per accepted task (failures keep their cost, value undefined when nothing is
accepted); p50/p95 latency (type-7 quantiles, missing values counted); sample size via the Connor
normal approximation and exact McNemar power enumeration.
