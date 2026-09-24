# Evaluation and acceptance plan

## 1. Evaluation principle

Every additional model, reviewer, role, round, retriever, or heuristic must beat a simpler baseline on a declared outcome after accounting for cost, latency, privacy, and failure rate. “Interesting behavior” is not an acceptance criterion.

## 2. Dataset construction

Create consented task traces that contain no secrets and have explicit provider eligibility. Include:

- low-, medium-, and high-impact tasks;
- reversible and irreversible requests;
- security-sensitive and ordinary work;
- clear and ambiguous requirements;
- single- and multi-component changes;
- Russian, English, and code-switched prompts;
- adversarial privacy and prompt-injection cases;
- provider failure and malformed-output fixtures.

Each task receives independent labels for minimum safe mode, acceptance criteria, material defects, allowed data destinations, and required approvals. Disagreements are retained and adjudicated. Split by repository/task family into development, calibration, and untouched test sets to limit leakage.

## 3. Baselines

At minimum compare:

1. deterministic policy + deterministic checks;
2. Direct;
3. Reviewed;
4. Team candidate;
5. rules router;
6. Laya router;
7. Jev router;
8. Laya → Jev → rules cascade.

Model comparisons use matched tasks, equivalent context/data policy, pinned versions, recorded hardware for local inference, and repeated runs where nondeterminism matters.

## 4. Metrics

### Routing

Per-class confusion, under-escalation, severe under-escalation, over-escalation, abstention/coverage, Brier score, expected calibration error, fallback rate, and policy-floor interventions.

### Engineering quality

Acceptance-test pass rate, seeded defect detection, escaped material defects, regression rate, patch applicability, reviewer precision/recall on material findings, correction success, and human rework time.

### Reliability

Cancellation latency, recovery success, duplicate side effects, provider/analyzer error rate, malformed response rate, partial-coverage visibility, and event-store integrity.

### Cost and performance

Observed provider bill where available, tokens, search calls, local CPU/GPU/RAM, cold/warm latency, p50/p95 task latency, retries, and cost per accepted task.

### Safety and privacy

Unauthorized capability attempts, protected payload escapes, secret exposure, stale approval use, prompt-injection success, unsafe fallback, and unlogged external transfer.

### Human factors

Approval frequency, override rate, time-to-understand, false-alarm burden, and whether users can identify current mode, unresolved risks, and data destinations.

## 5. Acceptance gates

### Harness feasibility gate

Pass only after the pinned runtime demonstrates load, configuration validation, file events, cancellation, unload/HMR cleanup, clean shutdown, and ledger creation on supported platforms.

### Deterministic kernel gate

Pass only when event persistence, capabilities, budgets, cancellation, scanner coverage/failure semantics, and recovery are tested under faults.

### Direct gate

Pass only when isolated patch execution and deterministic post-checks complete reliably without unauthorized writes or silent partial checks.

### Reviewed gate

Pass only if independent review yields a material improvement over Direct on held-out tasks, with acceptable false positives, correction behavior, cost, and latency.

### Claim Critic gate

Pass only if routing keeps protected project content out of public retrieval, citations/freshness are retained, high-impact contradictions are handled correctly, and failures remain `insufficient_evidence` rather than success.

### Router-model pilot gate

No protected content reaches remote providers; critical under-escalation is zero in a meaningful held-out sample; calibration is measured; and the learned policy provides a material cost/latency/quality advantage over rules. Zero observed errors in a tiny sample is not a guarantee.

### Team experiment gate

Team mode must outperform Reviewed on predeclared task classes after total cost and latency, without worsening critical safety outcomes. Otherwise it remains opt-in research or is removed.

### Release gate

Requires documented supported Harness revision(s), migration/rollback, threat-model tests, reproducible installation, user documentation, telemetry/data controls, and no unresolved critical security defects.

## 6. Statistical discipline

- Freeze metrics and thresholds before test evaluation.
- Report sample size and uncertainty, not only point estimates.
- Use paired analysis for matched tasks.
- Do not tune on the final test set.
- Report raw model output separately from policy-adjusted outcome.
- Preserve failures and abstentions in denominators.
- Treat vendor and local model upgrades as new evaluated versions.

## 7. Experiment report template

Every report states hypothesis, baseline, dataset and exclusions, exact versions, hardware/environment, data policy, procedure, metrics, raw and adjusted results, uncertainty, failures, cost, limitations, decision, and artifact links.

## 8. Stop conditions

Stop an experiment early for protected data leakage, uncontrolled spending, unauthorized side effects, corrupted evidence, repeated critical under-escalation, or inability to reproduce the environment. Safety stop results are findings, not missing data to ignore.