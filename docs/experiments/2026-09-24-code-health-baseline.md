# Experiment report: deterministic analyzer baseline

**Date:** 2026-09-24 · **Evidence class:** measurement (deterministic, no models)
**Artifacts:** `evaluation/results/code-health.json` (per-case outcomes, analyzer source SHA-256), `evaluation/results/code-health.md`
**Reproduce:** `node evaluation/src/cli.mjs code-health --write`

## Hypothesis

None to confirm. This establishes the precision and recall of the deterministic baseline (arm A1),
so that later claims about model reviewers can be compared with what cheap rules already catch.

## Dataset

81 synthetic snippets in `evaluation/corpus/code-health/cases/`: 41 positives, 40 negative twins,
5 rules, including CRLF, multi-line, TS optional catch binding, placeholders in tests, and markers
inside strings/Markdown. Labels follow rule **intent** (`evaluation/corpus/code-health/README.md`) and
were written without running the analyzer. Single author, not adjudicated. A case is counted only when
the workspace scanner would read its extension (`.md` is not scanned; this counts as a correct negative).

## Results (Wilson 95% intervals)

| Rule | Cases (+/−) | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|---|
| `empty-catch` | 19 (9/10) | 8 | 2 | 2 | 80% [49–94] | 80% [49–94] |
| `merge-conflict-marker` | 12 (6/6) | 18 | 5 | 1 | 78% [58–90] | 95% [75–99] |
| `not-implemented-stub` | 17 (9/8) | 5 | 4 | 4 | 56% [27–81] | 56% [27–81] |
| `probable-hardcoded-secret` | 20 (10/10) | 6 | 3 | 4 | 67% [35–88] | 60% [31–83] |
| `unexplained-ts-ignore` | 13 (7/6) | 7 | 2 | 1 | 78% [45–94] | 88% [53–98] |
| **all** | 81 (41/40) | 44 | 16 | 12 | 73% [61–83] | 79% [66–87] |

Intervals are wide: the corpus is small, so these numbers separate "works on the canonical form" from
"fails on common variants", nothing finer. Counts for `merge-conflict-marker` are per marker line.

## Analyzer errors and proposed rule changes

Proposals only; the analyzer was not changed in this experiment. Each change must be re-measured on
this corpus **and** on a held-out corpus written afterwards (to avoid tuning to these cases).

| Rule | Error (case) | Cause | Proposal |
|---|---|---|---|
| empty-catch | FP in string (`ec-n05`) and comment (`ec-n06`) | regex over raw text | strip/mask string, template and comment spans before matching (a small tokenizer, or delegate to a JS/TS parser adapter) |
| empty-catch | FN promise `.catch(() => {})` (`ec-07`) | pattern requires `catch (…) {` | add a separate rule id `empty-promise-catch` so precision is tracked independently |
| empty-catch | FN Python `except …: pass` (`ec-09`) | rule is JS-only while `.py` is scanned | add a language-scoped rule or stop scanning `.py` for this rule; the scanner should declare per-rule languages |
| merge-conflict-marker | FP inside template literal (`mc-n01`, 3) and Python string underline (`mc-n03`, 2) | line-anchored regex without context | require the full `<<<<<<<` … `=======` … `>>>>>>>` structure in order, and mask string spans; a lone `=======` should not fire |
| merge-conflict-marker | FN diff3 base marker `\|\|\|\|\|\|\|` (`mc-04`) | not in pattern | add `\|{7}` |
| not-implemented-stub | FN `throw Error(...)` without `new` (`ni-05`), `new TypeError` (`ni-09`), `NotImplementedError` class (`ni-06`), Python `raise NotImplementedError` (`ni-07`) | pattern hard-codes `new Error(` | match `throw (new )?\w*Error\(` plus `NotImplementedError`; Python variant per language |
| not-implemented-stub | FP on domain words "todo list", "Stub server" (`ni-n05`, `ni-n06`) | `\b(todo|stub)\b` anywhere at start of message | require the message to be only the marker, optionally followed by `:`/punctuation and a short reason (`^(not implemented|todo|stub)(\b[: ].{0,40})?$`) |
| not-implemented-stub | FP in comment (`ni-n04`) and string (`ni-n07`) | raw text | same masking as above |
| probable-hardcoded-secret | FN compound names `githubToken`, `AWS_SECRET_ACCESS_KEY`, `client_secret` (`hs-04`, `hs-05`, `hs-09`) | `\b` word boundaries around the keyword | match keyword as a component of camelCase/snake_case identifiers or quoted JSON keys |
| probable-hardcoded-secret | FN bearer literal (`hs-07`) | no value-shape rule | add value-shape detectors (JWT, `Bearer `, known prefixes such as `ghp_`, `sk-`), as dedicated scanners do |
| probable-hardcoded-secret | FP placeholders `xxxx…`, `changeme-changeme`, `test-token-000…` (`hs-n01`, `hs-n03`, `hs-n09`) | no entropy/placeholder filter | reject low-entropy values (e.g. Shannon < 3.0 bits/char) and a placeholder list; keep confidence `medium` |
| unexplained-ts-ignore | FN `@ts-ignore --` with empty reason (`ti-05`) | in the lookahead `[^\n]*--\s*\S`, `\s*` crosses the newline and takes the first character of the next line as the "reason" | use `[^\S\n]*` instead of `\s*` so the reason must be on the same line |
| unexplained-ts-ignore | FP in string (`ti-n04`) and doc prose (`ti-n05`) | raw text | require a directive position: `^\s*(//|/\*|\{/\*)\s*@ts-ignore` |

Cross-cutting: 9 of 16 FPs come from matching inside strings or comments. A shared
"code span" mask would address most of them; a real parser adapter (Stage 0 roadmap: analyzer
adapters) would address them properly.

## Limitations

Synthetic snippets written by the same person who wrote the rule-intent table; no real-repository
prevalence; negative twins are adversarially chosen, so precision here is a lower bound for typical
code and not an estimate of alert burden in practice.

## Decision

Keep the rules as a cheap baseline, but treat `not-implemented-stub` and `probable-hardcoded-secret`
as low-confidence until the proposals are implemented and re-measured. Any claim that a model reviewer
"adds value" must be measured on defects **not** already caught by these rules.
