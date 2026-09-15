# Roundtable — Master Implementation Plan

This is the build document. It assumes the reader has either read `01_vision_and_scope.md` and `02_validation_and_justification.md`, or will refer to them for the *why*; this file is entirely about *what gets built, in what order, and how*.

---

# Part A — General Project Plan

## A.1 Project principles

- **Paper-first, then phase-gated spending.** Every architectural question that could be settled by reasoning or local computation was settled before writing implementation code (see the audit, deepened-analysis, and validation documents). Real API spend begins only at Phase 0, and only on the smallest slice that tests something.
- **Human checkpoints are permanent features, not scaffolding.** Role approval and plan approval are not "temporary until the system proves itself" — they stay in the product because the cost asymmetry (cheap to review before, expensive to fix after) doesn't go away as the system matures.
- **Every phase ends in a smoke test, not a benchmark.** Given the budget constraint, no phase is gated on statistical confidence — each is gated on "does this concrete, cheap scenario work end to end without breaking."
- **Extend, don't rebuild.** Anything DeepSeek Harness already provides — chat rendering, credential storage, plugin settings, Web UI shell — is reused, not duplicated.

## A.2 Workstreams

Framed as workstreams rather than headcount, since this may be built by one person wearing several hats or a small team:

1. **Plugin/backend engineering** — Cordis plugins: orchestrator, planner, critic, event log, circuit breaker.
2. **UI/Web panel engineering** — the six panels described in the Vision document, built as Harness Web UI extensions.
3. **Prompt and role design** — the actual role definitions, peer-review rubrics, and critic checklists (content, not code).
4. **Security hardening** — sandbox permission model, message-origin tagging, credential handling.

## A.3 Milestone summary

| Phase | Focus | Real API spend? |
|---|---|---|
| 0 | Skeleton + first smoke test | Minimal — one cheap call |
| 1 | Keys, models, registry | None (no model calls needed) |
| 2 | Orchestrator + role auction | Yes — 3-4 live models |
| 3 | Planner + plan approval | Yes |
| 4 | Team execution: chat + gated disputes | Yes — first multi-agent run |
| 5 | Critic + verification | Yes |
| 6 | Resilience + security hardening | Simulated failures, minimal live spend |
| 7 | Diversity monitor + UX polish | Minimal |

## A.4 Risk register

| Risk | Mitigation | Addressed in |
|---|---|---|
| Harness plugin UI contract differs from what third-party plugin release notes suggest | Confirm directly in Phase 0 before building any panel; keep all Harness calls behind `HarnessGateway` | Phase 0, §B.2 |
| Self-report gaming by real deployed models | Peer-review-only scoring, never self-scored bids | §B.2 RoleAuction, Validation §3.1 |
| Cost overrun from unbounded debate | Confidence gating + adaptive stopping + hard budget ceiling | §B.7 Phase 4 |
| Vendor outage mid-task | Circuit breaker + same-class fallback | §B.2 CircuitBreaker |
| Cross-vendor subagent sandbox conflict | Permission intersection, never union | §B.5 |
| Harness dev-preview breaking changes | Anti-corruption layer (`HarnessGateway`) isolates the rest of the codebase | §B.2 HarnessGateway |

## A.5 Budget and resourcing approach

Spending is tied to phase, not calendar time. A phase does not start its live-API portion until its predecessor's smoke test has passed. The worst-case-cost calculator (Validation §3.3) is run before Phase 4 specifically, since that's the first phase where multi-agent, multi-round costs can compound — everything before it is single-call or zero-call.

---

# Part B — Technical Implementation

## B.1 Architecture recap

Two regions inside one local Harness process: the Web UI (native chat + our panels) and the Cordis plugin layer (our backend plugins alongside Harness's native ones — `llm`, `session`, `tools`). The only external boundary is outbound calls to model providers, made through API keys the user supplies and controls. See the layered diagram and the plugin-embedding diagram from earlier in this project for the visual reference.

## B.2 Component specifications

For each component: purpose, contract, current status.

### HarnessGateway
- **Purpose:** the single point of contact with Harness's `ctx.llm` / `ctx.agents` / `ctx.tools` / `ctx.events`. Nothing else in the codebase calls Harness directly.
- **Contract:** `call_model(model_id, messages) -> response`, `spawn_subagent(bundle_id, task) -> handle`, `emit_event(session_id, event)`, `register_tool(tool_spec)`.
- **Status:** interface defined and syntax-verified (`harness_adapter.py`); real calls untestable until Phase 0, since they require the live Harness runtime.

### SessionEventLog
- **Purpose:** append-only journal of everything that happens in a session; the source of truth state is replayed from, not held only in memory.
- **Contract:** `append(event: dict)`, `replay() -> state`.
- **Status:** built and verified — a simulated process restart correctly reconstructed messages, latest agent positions, and round number from the log alone.

### ModelCircuitBreaker
- **Purpose:** wrap every model call; open after repeated failures, serve a degraded result while open, recover automatically once calls succeed again.
- **Contract:** `call(model_fn, *args) -> result_or_degraded`. States: `CLOSED`, `OPEN`, `HALF_OPEN`.
- **Status:** built and verified against a simulated flaky model — correctly cycled through all three states and recovered.

### Orchestrator / RoleAuction
- **Purpose:** assign roles by combining historical score with an independently peer-reviewed assessment of the candidate's proposed approach — never a raw self-report.
- **Contract:** `score_role_fit(candidate, peer_reviewer_fn, task) -> float`, `assign_role(candidates, peer_reviewer_fn, task, session_id) -> agent_id`. Ties broken deterministically via session-scoped hashing, never by re-querying a model.
- **Status:** mechanism validated by simulation (Validation §3.1); wiring to a real peer-review model call happens in Phase 2.

### Planner
- **Purpose:** turn an approved team and a task into an executable plan.
- **Contract:** takes team + task, returns a structured plan object (steps, owners, acceptance criteria per step) — not free text, so the approval UI can diff edits meaningfully.
- **Status:** not yet built; prompt/role design work for Phase 3.

### Critic + EvidenceRequirement
- **Purpose:** verify work at every handoff (not just the end) against a fixed checklist; only admit dispute arguments that cite a checkable reference (a file, a test, a log line).
- **Contract:** `filter_admissible_arguments(arguments: list[str]) -> list[str]`; separate fixed checklist per verification type (format, logic, security).
- **Status:** the evidence filter is built and verified (accepts referenced arguments, rejects unsupported ones); the checklist content itself is a Phase 5 deliverable.

### DiversityMonitor
- **Purpose:** optional, non-blocking early-warning signal for opinion collapse during a dispute.
- **Contract:** `pairwise_cosine_diversity(vectors) -> float`, compared against a rolling threshold.
- **Status:** mechanism demonstrated on synthetic data (Validation §3.2); real-data behavior is a Phase 7 open question, explicitly flagged as such.

### SandboxPermissions
- **Purpose:** resolve conflicting sandbox policies between Harness and a cross-vendor subagent by intersection, never union.
- **Contract:** `intersect_permissions(policy_a: set, policy_b: set) -> set`.
- **Status:** built and verified on a concrete example.

## B.3 Task lifecycle (end to end)

1. Task submitted → orchestrator proposes team → `role_assignment_proposed` event logged.
2. User reviews approval table → `role_assignment_confirmed` (or edited) event logged.
3. Planner drafts plan → `plan_proposed` event logged.
4. User approves or revises → `plan_confirmed` event logged.
5. Execution begins → general-chat messages logged continuously; confidence below threshold on any step → `dispute_triggered` event with the relevant agent subset.
6. Dispute resolves via adaptive stability detection → `dispute_resolved` event.
7. Critic runs at each handoff → `verification_passed` / `verification_failed` events.
8. Task completes → final output plus full decision log assembled from the event stream (not stored separately — it *is* the event stream, replayed).

## B.4 UI integration plan

Each panel subscribes to specific event types from the session log rather than polling: Keys & Models reads/writes the model registry directly; Team setup writes locked-role preferences before `role_assignment_proposed` fires; the Role approval table renders on `role_assignment_proposed` and writes `role_assignment_confirmed`; Plan approval mirrors this pattern for planning; the Live team view renders the general chat stream directly and collapses anything scoped to a `dispute_triggered`/`dispute_resolved` pair into a card; the Budget & health strip aggregates token/cost fields already present on every model-call event, so it requires no separate accounting pass.

## B.5 Security architecture summary

Every model call goes through `HarnessGateway`, which enforces per-agent tool/file/network scoping (least privilege). Every subagent's declared sandbox policy is intersected with Harness's own before being granted, never unioned. Every inter-agent message carries an origin tag; a receiving agent's prompt treats another agent's output as data by default, never as an instruction to follow — this is the direct countermeasure to the inter-agent injection risk documented in Validation §2.8.

## B.6 Observability plan

Every agent invocation, tool call, and handoff is instrumented using OpenTelemetry's GenAI Semantic Conventions (`invoke_agent`, `chat`, `execute_tool` spans plus token/model/provider attributes) so that a MAST-style post-hoc failure analysis is possible on our own traces, not just in principle. Full instrumentation lands in Phase 6; the event log itself (Phase 0) is the minimum viable predecessor.

## B.7 Phase-by-phase technical tasks

### Phase 0 — Skeleton and first smoke test
- Build `HarnessGateway` as a real Cordis plugin (not just the interface).
- Build `SessionEventLog` as a real session-backed plugin.
- Wire `ModelCircuitBreaker` around the one model call this phase makes.
- One agent, no team, no debate: task in → one model call → one critic check → output.
- **Exit criterion:** one real task passes through the full skeleton, using one cheap real model call, without crashing.

### Phase 1 — Keys, models, registry
- Build the bulk key-add UI panel extending Harness's `llm` credential plugin.
- Build the model registry data structure: `model_id`, vendor, `historical_score`, version/fingerprint, last-updated date.
- Wire per-key budget/rate-limit config into `ModelCircuitBreaker` thresholds.
- **Exit criterion:** 3+ vendor keys added, 5+ models registered, limits visible and editable in the UI.

### Phase 2 — Orchestrator and role auction
- Build the orchestrator as a real Cordis plugin implementing `score_role_fit` / `assign_role` against real peer-review model calls (not the stub used in validation).
- Build the manual role-lock UI and the role approval table UI.
- **Exit criterion:** a real run with 3–4 live models produces a sensible approval table; the user approves it; manually locked pairs are respected and not re-auctioned.

### Phase 3 — Planner and plan approval
- Build planner prompt/role logic, producing structured (not free-text) plan objects.
- Build the plan approval screen with inline editing and a "send back with comment" path.
- **Exit criterion:** a real task produces a plan; a user comment on a rejected plan produces a materially revised second draft, not a cosmetic one.

### Phase 4 — Team execution: general chat and gated disputes
- Wire confidence-based dispute triggering (DOWN-style gating).
- Implement the relevant-subset filter for dispute membership (candidate-function pattern).
- Implement adaptive-stability stopping for disputes in progress.
- Build the collapsed/expandable dispute-card UI.
- Run the worst-case budget calculator against this phase's actual team-size assumptions before enabling it against live models.
- **Exit criterion:** a real task triggers at least one gated dispute among a relevant subset, resolves via the stability criterion (not a fixed round count), and renders correctly in the UI.

### Phase 5 — Critic and verification
- Implement multi-level verification (per-handoff, not only final).
- Wire the evidence-requirement filter into the dispute UI (unsupported arguments visually flagged as inadmissible).
- Write the fixed security/verification checklist content.
- **Exit criterion:** the critic catches a deliberately injected format or logic error at an intermediate handoff, not only at the final step.

### Phase 6 — Resilience and security hardening
- Wire `ModelCircuitBreaker` around every model call without exception.
- Wire `SandboxPermissions` intersection for all subagent spawns.
- Implement message-origin tagging on all inter-agent messages.
- Full OpenTelemetry GenAI instrumentation.
- **Exit criterion:** a simulated vendor outage mid-task produces graceful degradation, not a crash; a simulated injected instruction in one agent's output is tagged as data and not acted on by the receiving agent.

### Phase 7 — Diversity monitor and UX polish
- Wire `DiversityMonitor` as an optional, non-blocking "team health" indicator in the UI.
- Extend the existing `dsh-usage-chart` pattern with a per-agent/per-role cost breakdown.
- Final visual polish matching the native Harness look.
- **Exit criterion:** the diversity indicator is validated (or explicitly caveated) against real multi-agent runs, not just the synthetic model from Validation §3.2.

## B.8 Tech stack and repo layout

- Backend: TypeScript/JS Cordis plugins, matching Harness's own plugin language — no separate runtime.
- State: the append-only event log over the filesystem inside `~/.dsh`; no external database, matching the local-first principle and the absence of infrastructure budget.
- UI: whatever stack Harness's own Web UI plugins use — confirmed directly in Phase 0, since the only evidence available pre-implementation is third-party plugin release notes, not official documentation.

## B.9 Explicitly deferred decisions

- The exact weighting in `score_role_fit` (currently 0.5 historical / 0.5 peer review) is a placeholder calibrated against real data starting in Phase 2 — calibrating it earlier would be calibrating against nothing.
- Full OpenTelemetry instrumentation is useful early but not blocking; it lands in Phase 6 with the rest of the hardening work, not before.
- The concrete UI framework for Harness Web UI panels is confirmed by direct inspection in Phase 0, not assumed from this document.
