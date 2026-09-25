# Delivery roadmap and current status

## 1. Status on 2026-09-24

### Implemented in repository

- source-aligned Cordis/DeepSeek Harness bundle shape;
- lifecycle-managed host scanner spike;
- deterministic seed analyzers and secret-value redaction;
- stable finding fingerprints and JSON finding lifecycle ledger;
- deterministic project/public claim-routing skeleton;
- dependency-free unit tests for the spike;
- Stage 0 slice of CodeHealthService: targeted (changed-file) rescans with full-scan fallback, `complete`/`partial` coverage where unread files are never marked fixed, O(n) location mapping, cancellable scans, and the `ctx.roundtableCodeHealth` Cordis service (v1, internal, no authority);
- offline evaluation harness (`evaluation/`): 16 graded tasks, sandboxed-by-permission grader, arms interface, paired statistics, preregistration, and a labeled 81-case corpus measuring the deterministic analyzer;
- isolated Direct/Reviewed/Team routing evaluation harness;
- mocked Jev/Laya provider plumbing, loopback-only Laya policy, fallback, and safety floor;
- historical Python prototypes for selected mechanisms.

### Runtime-verified (`@deepseek-ai/dsh@0.1.6-alpha.1`, 2026-09-24)

Platforms: Windows 10 x64 locally (9/9 scenarios incl. service and partial coverage); GitHub Actions run 36116878136 green on `ubuntu-latest` and `macos-latest` (9/9) and `windows-latest` (8/9 + partial-coverage inconclusive under an elevated account), each on Node 22.19.0 and 24.

- bundle install, config validation, plugin load, initial scan and ledger creation;
- file-event rescans, debounce with bounded wait, ignored paths, no self-triggered scans;
- HMR config reload and 5 unload/reload cycles without watcher leaks;
- cancellation of an in-flight scan on unload and clean shutdown without hanging handles.

Evidence: `docs/RUNTIME_VERIFICATION.md`, `docs/evidence/dsh-runtime/`.

### Not runtime-verified


- OS-delivered SIGINT/SIGTERM (only in-process emission tested);
- `web`, `headless`, `sdk`, Desktop profiles and any agent/session interaction;
- live Jev and Laya calls and quality comparison.

### Not implemented

- production event/issue store;
- formal capability and approval brokers;
- integrated budget ledger/model gateway;
- analyzer adapter subprocesses (incremental scheduling is implemented, see above);
- repository/commit identity in the ledger and authorization of `requestScan` callers;
- Problems/Plan/Mode/Evidence/Budget UI;
- complete Claim Critic retrieval and evidence pipeline;
- Direct, Reviewed, or Team workflow controllers;
- production sandbox/worktree integration;
- release packaging and migrations.

## 2. Stage -1 — Host feasibility

Deliver runtime evidence for the pinned Harness revision, document exact installation, and close lifecycle uncertainties.

Exit: all Harness feasibility gates in the evaluation document pass, or the host strategy is revised.

Status 2026-09-25: **passed** for host lifecycle on Windows, Linux and macOS (`docs/RUNTIME_VERIFICATION.md` §8). Open: OS signal delivery, non-base profiles.

## 3. Stage 0 — Deterministic kernel

Build versioned TaskSpec, WorkflowController skeleton, EventStore/IssueStore, BudgetLedger, CapabilityBroker, cancellation, idempotency, and CodeHealthService contracts. Replace whole-repository watch rescans with changed-file/range scheduling and a formal analyzer adapter.

Exit: fault-injected tests prove durable state, visible partial coverage, capability denial, cancellation, and no duplicate side effects.

## 4. Stage 1 — Direct mode

Add isolated worktree execution, one model worker through ModelGateway, structured artifacts, post-change diagnostics, result provenance, and minimal task/mode/problems UI.

Exit: representative low-risk tasks complete end to end within policy and recover cleanly from cancellation/provider failure.

## 5. Stage 2 — Reviewed mode and Claim Critic

Add structured independent review, one bounded correction loop, local project-evidence routing, public retrieval with strict payload policy, evidence cache, and review/evidence UI.

Exit: Reviewed and Claim Critic gates pass on held-out tasks. If no material improvement over Direct, do not promote the mode by default.

## 6. Stage 3 — Routing evaluation

Collect independently labeled traces, complete metrics in `decision-routing`, run rules/Laya/Jev/cascade on matched cases, and document calibration, local compute, provider charges, privacy, and failure behavior.

Exit: keep rules unless a candidate passes the router pilot gate.

## 7. Stage 4 — Team experiment

Implement the smallest bounded team workflow: explicit roles with artifact contracts, approved plan, limited parallel work, one structured challenge step, deterministic verification, and hard round/cost limits. Do not begin with dynamic auctions, open-ended chat, confidence-only gating, or diversity intervention.

Exit: Team beats Reviewed for declared task classes. Otherwise retain it as an opt-in experiment or remove it.

## 8. Stage 5 — Product hardening

Add supported-platform tests, migration and rollback, telemetry controls, accessibility, supply-chain controls, release artifacts, threat-model regression tests, and operator/user documentation.

Exit: release gate passes for a named Harness version and explicit feature set.

## 9. Deferred experiments

These remain behind flags until separately justified:

- dynamic role auctions and historical model scoring;
- adaptive multi-round debate;
- confidence-triggered disputes;
- embedding-based diversity monitoring;
- automatic selection-versus-synthesis aggregation;
- model-driven policy thresholds;
- unattended external side effects.

## 10. Work planning rules

Each implementation PR should state requirements implemented, contracts changed, threats affected, tests added, measured cost/latency where relevant, migration impact, rollback, and documentation updates. A stage is not complete because code exists; its exit evidence must be recorded.