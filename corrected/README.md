# Roundtable Corrected Architecture — Continuous Diagnostics Addendum

This package specifies two agent-independent subsystems for the planned DeepSeek Harness plugin:

1. **CodeHealthService** — continuous deterministic code diagnostics, AI-slop adapters, and a persistent FindingLedger.
2. **ClaimCritic** — selective, low-cost verification of material agent claims before MAD chat or final output.

This is an authoritative design/specification package, not an installable plugin or finished UI.

## Documents

- `docs/11_CONTINUOUS_CODE_INTELLIGENCE.md`
- `docs/12_CLAIM_CRITIC.md`
- `docs/13_INTEGRATION_AND_BETA_PLAN.md`
- `schemas/finding.schema.json`
- `schemas/scan-run.schema.json`
- `schemas/claim-check.schema.json`

## Binding boundaries

- Continuous analysis is a supervised local service, not an always-running paid LLM.
- Deterministic analyzers run before heuristic or model-backed checks.
- AI-slop scores are risk signals, never proof of correctness or authorship.
- Internal project claims use repository evidence, tests, and the event store—not public web search.
- The flash model may extract claims, plan queries, and summarize retrieved evidence; it is not a truth authority.
- Claim checks target $0.001–$0.005 each under configurable budgets, but vendor pricing makes this a target rather than a guarantee.
- No claim is silently rewritten; corrections and evidence are logged and shown to the originating agent.
