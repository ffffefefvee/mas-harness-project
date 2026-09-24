# Requirements and execution modes

## 1. Task contract

Every task MUST be normalized into a versioned specification containing:

- task identifier and workspace/repository identity;
- user objective;
- in-scope and out-of-scope artifacts;
- acceptance criteria;
- risk signals: impact, reversibility, security sensitivity, data sensitivity, uncertainty, and affected domains;
- requested capabilities;
- provider/data policy;
- cost and time ceilings;
- selected mode and routing rationale;
- approval requirements;
- base revision and expected output type.

Missing high-impact fields MUST cause clarification or conservative escalation, never optimistic inference.

## 2. Execution modes

### 2.1 Direct

Use for bounded, reversible, low-impact work with clear acceptance criteria.

Required flow:

1. validate task contract;
2. establish base revision and allowed capabilities;
3. run relevant preflight diagnostics;
4. invoke one worker;
5. validate structured output;
6. apply or stage changes in an isolated worktree/sandbox;
7. run deterministic post-change checks;
8. present result, evidence, unresolved findings, and cost.

Direct MUST NOT mean unchecked. It omits an independent model reviewer, not deterministic validation.

### 2.2 Reviewed

Use when a task is moderately impactful, spans components, has meaningful uncertainty, affects a public interface, or needs independent inspection.

Reviewed includes Direct plus:

1. an independent reviewer receives the task, diff/artifact, acceptance criteria, and compact evidence;
2. the reviewer returns structured findings, not a free-form vote;
3. deterministic tools validate checkable reviewer claims where possible;
4. the worker receives at most one bounded correction cycle by default;
5. unresolved material disagreements are shown to the user.

Worker and reviewer SHOULD differ by model or prompt lineage when feasible, but vendor diversity is not treated as proof of independence.

### 2.3 Team

Use for high-impact, security-sensitive, irreversible, cross-domain work, or explicitly approved experiments where multiple specialized roles have a defensible purpose.

Team adds:

1. a proposed structured plan and role set;
2. a pre-execution budget/data/capability preview;
3. required human approval of plan and consequential role/provider choices;
4. bounded role-specific execution with explicit artifact ownership;
5. independent verification at handoffs;
6. capped challenge/review exchanges;
7. final human approval before irreversible or external effects.

Team is not “many agents discussing everything.” Each participant MUST have a concrete input, output, and termination condition.

## 3. Routing policy

A deterministic policy computes the minimum permitted mode. High impact, irreversibility, security sensitivity, protected data, or an external side effect may establish Reviewed or Team floors.

A learned or model-based router MAY recommend a higher mode, or recommend a lower mode for measurement, but MUST NOT execute below the deterministic floor. Router failures fall back to deterministic rules.

Jev, Laya, and their cascade remain evaluation candidates. They have no production authority.

## 4. Human approvals

Human approval is mandatory for:

- irreversible repository or infrastructure actions;
- publication, deployment, merging, sending, or external side effects unless separately pre-authorized;
- expanded filesystem, shell, network, credential, or provider access;
- material budget increases;
- Team plan start;
- privacy exceptions;
- acceptance of unresolved critical findings.

Routine reversible steps MAY be pre-authorized by a scoped policy. Approvals MUST identify the exact artifact, capabilities, budget, and expiry; “approve everything” is not a valid durable grant.

## 5. Continuous code intelligence requirements

The CodeHealthService MUST:

- run independently of model activity;
- support watch, diff, targeted, gate, and scheduled/full modes;
- normalize analyzer results into stable findings;
- record analyzer version, configuration, coverage, and freshness;
- distinguish new, existing, regressed, resolved, suppressed, stale, and unknown states;
- baseline existing debt without hiding it;
- prefer compilers, tests, type checkers, linters, and security tools over heuristics;
- treat “AI slop” indicators as triage signals, never proof of authorship or incorrectness;
- expose failure and partial coverage visibly;
- prevent a model assertion from closing a deterministic finding.

## 6. Claim Critic requirements

The Claim Critic MUST:

- extract bounded atomic claims from selected drafts;
- classify claims as project-verifiable, public-web-verifiable, deterministic, opinion/recommendation, private, time-sensitive, or not verifiable;
- route project claims to repository evidence and never to public search by default;
- retrieve sources rather than answer from model memory;
- preserve `insufficient_evidence`, `mixed`, and `stale` outcomes;
- use authoritative/primary sources where practical;
- retain claim, evidence, access date, limitations, verdict, and correction history;
- offer at most one correction cycle by default;
- have no repository write, shell, credential, or deployment capability.

The Claim Critic is evidence middleware, not a debate participant or truth authority.

## 7. Common functional requirements

- **FR-01 Cancellation:** every model, tool, scan, review, and team operation is cancellable.
- **FR-02 Idempotency:** retries use operation identifiers and do not duplicate side effects.
- **FR-03 Recovery:** durable state can reconstruct an interrupted task.
- **FR-04 Budgets:** per-call, per-stage, per-task, and provider ceilings are enforced before calls where possible.
- **FR-05 Capabilities:** each operation receives an explicit least-privilege capability set.
- **FR-06 Provenance:** outputs identify model/provider/version when available, tools, base revision, and relevant evidence.
- **FR-07 Degradation:** provider or analyzer failure yields visible degraded/unknown state.
- **FR-08 Versioning:** contracts, policies, prompts, schemas, and evaluation datasets are versioned.
- **FR-09 Overrides:** human overrides are logged with scope and rationale.
- **FR-10 Accessibility:** approvals and status MUST remain understandable without relying only on color or animation.

## 8. Non-functional targets

Targets are provisional until measured on reference hardware:

- idle scanning consumes negligible sustained CPU when no workspace is open;
- save-event analysis is debounced and avoids duplicate content work;
- no secrets appear in logs or model payload previews;
- crash recovery does not corrupt the durable event/finding store;
- default mode routing adds minimal latency before Direct work;
- all external transfers are attributable to a provider and policy decision.

Numerical SLOs will be set only after Stage 0 measurements; invented precision is explicitly avoided.