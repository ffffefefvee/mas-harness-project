# Roundtable

Roundtable is a planned local-first engineering control plane for DeepSeek Harness. It combines deterministic repository diagnostics, bounded AI-assisted work, independent review, selective fact checking, explicit approvals, and auditable execution.

The product goal is not to create an autonomous committee of models. It is to give a developer the cheapest adequate workflow for each task while keeping permissions, budgets, irreversible actions, and publication under deterministic policy and human control.

> **Project status:** research and feasibility. The repository contains a tested scanner core, a source-aligned DeepSeek Harness plugin spike, and an isolated decision-routing evaluation harness. It does not yet contain a production Roundtable release, a completed UI, or evidence that multi-agent execution outperforms simpler workflows.

## Canonical documentation

The current product specification lives in [`docs/product/`](docs/product/README.md):

1. [Vision, scope, and principles](docs/product/01_VISION_AND_SCOPE.md)
2. [Requirements and execution modes](docs/product/02_REQUIREMENTS_AND_MODES.md)
3. [Architecture and contracts](docs/product/03_ARCHITECTURE_AND_CONTRACTS.md)
4. [Safety, privacy, and governance](docs/product/04_SAFETY_PRIVACY_AND_GOVERNANCE.md)
5. [Research basis and corrected claims](docs/product/05_RESEARCH_AND_EVIDENCE.md)
6. [Evaluation and acceptance plan](docs/product/06_EVALUATION_AND_ACCEPTANCE.md)
7. [Delivery roadmap and current status](docs/product/07_DELIVERY_ROADMAP.md)
8. [Decision register](docs/product/08_DECISION_REGISTER.md)

These documents are normative unless a section is marked **Experimental**, **Provisional**, or **Historical**. If another repository document conflicts with them, `docs/product/` wins.

## Product in one minute

Every task enters a policy router and is assigned the least expensive safe mode:

- **Direct:** one worker, deterministic checks, and no model-created authority.
- **Reviewed:** one worker plus an independent review/correction step.
- **Team:** an explicitly approved plan and bounded multi-role execution for high-impact work or research experiments.

Risk floors can only escalate a mode. A model may advise routing, staffing, or review, but cannot lower a deterministic safety floor, grant itself tools, approve spending, publish output, or authorize an irreversible action.

Two supporting systems operate independently of team execution:

- **CodeHealthService** maintains a persistent inventory of compiler, test, security, quality, and heuristic findings.
- **ClaimCritic** selectively checks material factual claims against project evidence or public sources without becoming a truth oracle.

All state-changing decisions are represented as durable events. Failures, skipped checks, degraded providers, budget exhaustion, and human overrides remain visible.

## What exists today

- Root JavaScript package: host-only feasibility spike for continuous scanning.
- [`docs/FEASIBILITY_RESULT.md`](docs/FEASIBILITY_RESULT.md): source-level DeepSeek Harness compatibility findings and runtime gates still to prove.
- [`corrected/`](corrected/README.md): earlier architecture addendum for diagnostics and claim checking.
- [`decision-routing/`](decision-routing/README.md): research harness for deterministic, Laya, Jev, and cascade routing.
- Root Python files and the original numbered documents: prototypes and design history.

These artifacts are evidence and inputs to the specification, not proof of production readiness.

## Historical documents

The original `01_...` through `05_...` files, `mas_*` audit files, Python experiments, and `corrected/` package are intentionally preserved. They record how the idea evolved and include useful experiments, but some contain superseded requirements, provisional mechanisms, or corrected calculations. They are **non-normative historical material** unless the canonical specification cites and adopts a point explicitly.

## Development rules

1. Deterministic policy owns permissions, budgets, approvals, and safety floors.
2. Use Direct before Reviewed and Reviewed before Team unless measured evidence justifies escalation.
3. Treat model confidence and model self-evaluation as untrusted signals.
4. Keep private repository content local unless an explicit data policy permits a named provider and payload.
5. Prefer deterministic evidence: tests, compilers, linters, scanners, diffs, and repository state.
6. Never convert skipped or failed verification into success.
7. Record implementation status separately from planned behavior.
8. Promote experimental mechanisms only after a predeclared evaluation passes.

## Immediate next gate

Host-lifecycle feasibility passed with `@deepseek-ai/dsh@0.1.6-alpha.1` on Windows, Linux and macOS (`docs/RUNTIME_VERIFICATION.md`). Stage 0 CodeHealthService slice and the offline evaluation harness (`evaluation/`, `docs/experiments/PREREGISTRATION.md`) are implemented. Next gate: grow the held-out task corpus to the preregistered size and, with explicit approval for provider use, run Direct vs Reviewed.

## License and contribution status

No stable public contribution or release policy has been declared yet. Treat interfaces as pre-release and subject to change.