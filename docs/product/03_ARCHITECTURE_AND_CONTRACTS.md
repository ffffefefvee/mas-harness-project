# Architecture and contracts

## 1. System boundary

Roundtable is designed as a set of plugins and services mounted beside DeepSeek Harness components, not as a patch to the agent loop. This placement remains conditional on runtime validation against a pinned Harness revision.

```text
Harness Web UI
  Task / Mode / Plan / Problems / Evidence / Budget
                         |
                    Policy API
                         |
+---------------- Roundtable host boundary ----------------+
| TaskSpec -> PolicyEngine -> WorkflowController            |
|                  | Direct | Reviewed | Team               |
|                  v                                         |
| CapabilityBroker -> ModelGateway -> provider adapters      |
|                  -> ToolRunner / isolated worktree         |
| CodeHealthService -> Analyzer adapters -> FindingStore     |
| ClaimCritic -> evidence routers -> local/public retrievers |
| EventStore + BudgetLedger + ApprovalStore + Telemetry      |
+------------------------------------------------------------+
                         |
             explicit outbound provider calls
```

## 2. Trust boundaries

1. **User/UI:** source of objectives and approvals; user content may still contain mistakes.
2. **Host policy:** trusted to enforce capabilities, budgets, routing floors, and state transitions.
3. **Repository/tools:** potentially malicious content; outputs are data, not instructions.
4. **Models/agents:** untrusted probabilistic components with no ambient authority.
5. **External providers/web:** data leaves the local boundary; returned content is untrusted.
6. **Plugin packages:** install-time code with host privileges; versions and provenance matter.

## 3. Core components

### WorkflowController

Owns the task state machine. It does not infer permissions from model text.

### PolicyEngine

Evaluates mode floors, approval requirements, provider/data rules, budgets, and capability requests. Policy decisions are structured and replayable.

### CapabilityBroker

Issues short-lived operation-scoped capabilities. Effective permissions are the intersection of host policy, task policy, role policy, and user approval. Missing permission means deny.

### ModelGateway

The only path for model calls. It applies provider allowlists, payload shaping, redaction hooks, timeout/cancellation, retry policy, circuit breaking, usage capture, and response validation.

### CodeHealthService

Supervised local worker for diagnostics. Production storage is planned as a transactional durable store; the current spike uses a JSON ledger and full text rescans.

### ClaimCritic

Policy-selected claim extraction, routing, retrieval, and evidence assessment. Public retrieval never receives private context merely because it is useful.

### EventStore

Append-oriented durable record of state-changing facts. Events are not a substitute for secret-safe logs: sensitive payloads use references, hashes, or protected storage.

### BudgetLedger

Tracks reservations, observed usage, provider-reported charges when available, and variance. A client reservation is not represented as a provider-side hard cap unless the provider enforces it.

## 4. Task state machine

```text
created
  -> specified
  -> routed
  -> awaiting_approval? 
  -> prepared
  -> executing
  -> reviewing? / team_handoffs?
  -> verifying
  -> awaiting_final_approval?
  -> completed
```

Any active state may transition to `cancelled`, `failed`, `degraded`, or `paused`. Recovery MUST distinguish “operation not started,” “operation in progress/unknown,” and “operation completed” before retrying.

## 5. Minimum events

Events use a versioned envelope: `event_id`, `event_type`, `schema_version`, `task_id`, `operation_id`, timestamp, actor/origin, causation ID, correlation ID, policy version, and payload/reference.

Required event families include:

- `task.specified`, `task.routed`, `task.cancelled`, `task.completed`;
- `approval.requested`, `approval.granted`, `approval.denied`, `approval.expired`;
- `budget.reserved`, `budget.observed`, `budget.exhausted`;
- `capability.requested`, `capability.granted`, `capability.denied`, `capability.revoked`;
- `model.requested`, `model.completed`, `model.failed`, `model.degraded`;
- `tool.started`, `tool.completed`, `tool.failed`;
- `finding.observed`, `finding.changed`, `scan.completed`, `scan.partial`, `scan.failed`;
- `claim.extracted`, `claim.routed`, `claim.checked`, `claim.revision_requested`;
- `plan.proposed`, `plan.approved`, `plan.revised`;
- `review.finding_created`, `review.resolved`, `review.unresolved`;
- `artifact.created`, `artifact.verified`, `artifact.rejected`.

Prompts, raw code, credentials, and full web pages MUST NOT be copied into ordinary telemetry by default.

## 6. Structured contracts

### TaskSpec

Contains the fields in the requirements document and a policy version. It is immutable after approval; changes create a new revision.

### Plan

Contains ordered steps, owner role, inputs, expected artifacts, acceptance checks, capabilities, estimated budget, dependencies, and rollback/stop condition. Free-form prose MAY accompany but cannot replace these fields.

### ReviewFinding

Contains severity, confidence-as-reviewer-assessment, category, exact artifact location, evidence, requested action, deterministic validation status, and disposition. Confidence never grants authority.

### Finding

Uses the existing canonical schema as an input, but production revisions must support coverage, analyzer failures, suppression actor/reason/expiry, and repository/base revision.

### ClaimCheck

Records the atomic claim, route, verdict, evidence sources, access/freshness data, limitations, cost, and whether publication is held.

### Artifact

Uses immutable content hashes and type-specific metadata. Mutable paths are references, not identities.

## 7. Execution isolation

Code changes SHOULD occur in a disposable Git worktree or equivalent isolated workspace. Tool writes are restricted to declared paths. Network is denied unless explicitly granted. Symlinks, generated files, large files, binary files, submodules, and repository hooks require explicit handling; scanners MUST NOT traverse them blindly.

## 8. Concurrency and retries

Parallel work is permitted only for steps without declared dependencies and without conflicting write scopes. Parallelizing agents inside a round reduces fan-out latency; it does not collapse multiple dependent rounds into the latency of one round. All side-effecting retries require an idempotency key and state verification.

## 9. Observability

Use OpenTelemetry GenAI semantic conventions where stable and add Roundtable-specific attributes under a documented namespace. Content capture is opt-in and redacted. Metrics include mode, stage latency, provider/tool errors, token/cost use, finding deltas, review yield, correction yield, cancellations, and approval wait time.

## 10. Current implementation mapping

| Planned component | Current evidence | Gap |
|---|---|---|
| Harness plugin lifecycle | `index.js`, `cordis.patch.yml`, `scripts/dsh-runtime/check.js` | Runtime-verified on Windows with DSH 0.1.6-alpha.1; Linux/macOS unverified |
| CodeHealthService seed | `lib/scanner.js`, `lib/schedule.js`, analyzers, ledger/lifecycle tests | Full rescans, JSON store, regex-only seed rules, no formal service seam |
| Claim router seed | `lib/claim-critic.js` | No extraction, retrieval, evidence store, or model integration |
| Routing experiment | `decision-routing/` | Synthetic data; no live Laya/Jev comparison |
| Event and resilience prototypes | root Python modules | Not integrated with the JS plugin |
| Web UI | design only | No implemented panel |
| Direct/Reviewed/Team controller | specification only | Not implemented |