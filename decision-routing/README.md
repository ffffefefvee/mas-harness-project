# Decision-routing evaluation (research only)

An isolated, dependency-free Node 22+ experiment comparing deterministic rules, Laya, Jev, and a local-first cascade for **Direct / Reviewed / Team** task routing. It does not mount into DeepSeek Harness or authorize tools, spending, approvals, or model selection in production.

## Safe offline start

```sh
cd decision-routing
npm test
npm run eval
```

The included six synthetic cases deliberately match the reference rules. An offline result of 100% is **not evidence** of real-world routing quality. Before any recommendation, create a human-labeled, consented, held-out dataset from Roundtable task traces; redact repository paths, code, secrets, and personal information. Review bilingual and ambiguous cases separately. Keep a train/calibration/test split and never tune thresholds on the final test set.

Fixture schema: array of `{id, text, publicSafe: true, label: "direct"|"reviewed"|"team", signals: {impact: "low"|"medium"|"high", irreversible: boolean, securitySensitive: boolean, multiDomain: boolean, uncertain: boolean}}`. `publicSafe: true` is a **manual assertion**, not an automatic privacy filter; review the exact text before using Jev.

## Explicit live runs

Start a trusted, locally bound Laya `/v1/systemone` server first. Pin its checkpoint, Python package, and server versions and record the machine's CPU/GPU and warm/cold state. The default URL is `http://127.0.0.1:8000`; only loopback HTTP is allowed.

```sh
npm run eval -- --live --provider laya --max-cases 6
```

Only after reviewing public-safe cases and setting the API key in the shell **without committing it**:

```sh
npm run eval -- --live --provider jev --allow-public-api --max-cases 6
npm run eval -- --live --provider cascade --allow-public-api --threshold 0.85 --max-cases 6
```

`TYPESAFE_API_KEY` and optional `JEV_MODEL` (`jev-1.13.0` by default) configure Jev. `LAYA_BASE_URL` and optional `LAYA_API_KEY` configure local Laya. The program never prints keys or raw provider responses. Use `--cases path.json` for labeled fixtures, `--output path.json` to write a new results file (refuses overwrite), and `--threshold 0.85` for a cascade sensitivity experiment. Do not use this on private tasks without an explicit privacy review and provider approval.

The `cascade` consults Laya first and calls Jev only if Laya fails or has top-option probability below the threshold. If both fail or remain uncertain it falls back to rules. High-impact, irreversible or security-sensitive signals enforce a fixed Team floor. **These safeguards do not establish safe autonomy**; the rule inputs themselves can be wrong. No tool permissions are granted by either model. Record both raw model predictions and the post-floor route separately.

## Metrics and go/no-go

Measure raw and floor-adjusted: coverage/abstention, exact accuracy, under-escalation, Direct-for-Team errors, over-escalation, per-class confusion, probability calibration (Brier/ECE), tail latency (p50/p95), local CPU/GPU and memory, measured billed cost per task including remote searches, and fallback rate. The current script reports a small initial subset of these metrics; missing metrics must be implemented before a production decision. Select thresholds on a calibration set, then freeze them. Compare matched cases across the four policies and perform paired confidence intervals; test Russian/English code-switching and privacy-sensitive cases separately.

A pilot can proceed only if held-out critical under-escalation is zero within a meaningful sample, no protected content reaches a remote provider, total cost/latency improve relative to rules, and the failure rate is acceptable. Zero observed failures in a tiny sample is not a reliability guarantee. Otherwise keep deterministic routing.

## Known limitations

- No actual Jev or Laya calls were made during development; no keys or model weights were available.
- Both models make typed decisions, not verified factual judgments. Confidence may be miscalibrated on our workload.
- A label asserted `publicSafe` is not automatically sanitized.
- The $0.02 reservation is an approximate client-side preflight, not a provider-side hard billing cap.
- Laya running locally still uses compute, memory, and startup time; not free operationally.
- The Laya API compatibility claim and local server security need to be retested on a pinned release.
- No DSH/Desktop UI integration, agent assignment, claim-checking, or production authority.

## Sources checked 2026-09-24

- Jev endpoint, question/answer schema: https://docs.typesafe.ai/api
- Jev 1.13 price and version pin: https://docs.typesafe.ai/models
- Laya models, local HTTP server, limitations: https://huggingface.co/convaiinnovations/laya
- Roundtable corrected plan: ../corrected/docs/13_INTEGRATION_AND_BETA_PLAN.md
