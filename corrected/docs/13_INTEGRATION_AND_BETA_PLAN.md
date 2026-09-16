# Integration and Beta Plan

## Architecture placement

```text
Editor / Git events
        |
        v
CodeHealthService -> DiagnosticRunner adapters -> FindingLedger -> Problems UI
        |                                         |
        +---------------- compact findings --------+--> Agent context

Agent draft -> ClaimExtractor -> VerifiabilityRouter
                                  |             |
                         project evidence     public web
                                  |             |
                                  +--> ClaimVerifier --> CorrectionFeedback
                                                        |
                                               agent revises once
```

## CodeHealthService lifecycle

The plugin starts a supervised local worker when a workspace opens and stops it when the workspace closes. File-save events are debounced and coalesced. Content hashes prevent duplicate analysis. Git diff scans take priority over full scans. Full scans are manual or low-frequency scheduled work. Idle CPU and memory budgets are enforced.

`DiagnosticRunner` adapters expose one contract for compiler, linter, type-checker, test, security, and AI-slop tools. Every run records configuration and tool versions. A partial or failed analyzer result cannot produce a clean gate.

`FindingFingerprint` is stable across ordinary line movement and drives `new`, `existing`, `resolved`, `regressed`, and `suppressed` states. Suppression is explicit, justified, and optionally expires. The ledger persists independently of model sessions.

## ClaimCritic boundary

The critic intercepts only draft messages selected by policy. `ClaimExtractor` emits atomic claims. `VerifiabilityRouter` classifies each as `web_verifiable`, `project_verifiable`, `logical_or_opinion`, or `ephemeral_or_private`.

Project claims go to repository search, tests, configuration inspection, or the event store. Public claims may use `SearchPlanner` and `EvidenceRetriever`. The cheap model launches searches and compresses retrieved excerpts; it does not supply factual evidence from memory.

`ClaimVerifier` returns `supported`, `contradicted`, `mixed`, `insufficient_evidence`, or `not_applicable`, with citations, freshness, limitations, confidence, and a short correction. `CorrectionFeedback` allows one bounded revision. The original claim and result stay in the audit log.

## Cost policy

- deterministic checks before model calls;
- claim-risk threshold before search;
- one to three search calls by default;
- small prompt and output caps;
- cache and deduplicate equivalent claims;
- per-claim hard budget with target $0.001–$0.005;
- per-message and per-task aggregate budgets;
- fail as `insufficient_evidence`, never “verified,” when budget or tools fail.

The dollar target must be tested against chosen provider prices and search API billing. It is not a contractual guarantee.

## Development order

### Stage -1 — Feasibility

Pin the actual DeepSeek Harness/Cordis APIs. Prove plugin startup/shutdown, model invocation, filesystem events, cancellation, event persistence, a disposable Git worktree, and one diagnostics panel.

### Stage 0 — Deterministic kernel

Implement event store, budgets, capability checks, cancellation, CodeHealthService contracts, FindingLedger, content hashing, fingerprints, and one compiler/linter adapter. No MAD yet.

### Stage 1 — Direct mode

Add patch-only worker flow, diff scans, gate semantics, AI-slop external-command adapter, baseline/ratchet behavior, and Problems UI.

### Stage 2 — Reviewed mode

Add bounded independent review, atomic-claim routing, targeted public search, evidence records, cache, cost enforcement, and one correction loop.

### Stage 3 — Optional MAD experiment

Add bounded team composition and structured challenge/response. Complex role auctions, confidence gates, diversity intervention, and extended debate remain experiments behind flags until traces show that each improves outcomes enough to justify cost and risk.

### Stage 4 — Packaging

Complete settings, migration, telemetry controls, signed artifact/reproducible build work, documentation, and rollback.

## Acceptance gates

- Scanner detects seeded defects and closes fixed findings without line-number churn.
- Analyzer crash, timeout, malformed output, and partial coverage remain visible.
- Watch mode stays within idle resource targets.
- AI-slop rules are evaluated for false positives and never replace ordinary analyzers.
- Claim routing keeps private/project facts out of public search.
- High-impact contradicted claims are held for revision; uncertainty is not rewritten as false.
- Search pages containing adversarial instructions cannot affect tools or repository state.
- Claim checks retain source URLs and dates and obey hard cost ceilings.
- UI clearly distinguishes current, baseline, resolved, suppressed, and stale findings.

## Explicit non-deliverables

This document does not claim that an installable DeepSeek Harness plugin, background daemon, diagnostics UI, or production ClaimCritic is already implemented. Those are beta implementation milestones after API feasibility is proven.
