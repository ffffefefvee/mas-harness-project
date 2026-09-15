# Roundtable — Complete Concept & Mechanics

This is the one document where every part of the idea is explained twice on purpose: once as a concept (what it is, why it exists) and once as a mechanism (exactly how it works — the actual data, logic, and events involved). If you only want the product framing, `01_vision_and_scope.md` covers that alone. If you only want the build plan, `03_implementation_plan.md` covers that alone. This is the merge of the two, organized by feature instead of by document purpose.

---

## 1. The core idea, in one paragraph

A task goes to a small team of AI agents instead of one model. Who's on the team is decided by a mechanism designed specifically not to be gamed by confident-sounding self-description, the user approves that team before anything is spent, a planner turns the approved team and the task into a concrete plan the user also approves, execution happens with a fully visible general conversation plus small disputes that trigger only when something is genuinely uncertain, a critic checks work at every step rather than only at the end, and everything is logged in a way that survives crashes, degrades gracefully under vendor outages, and never gives any single agent more system access than its role strictly needs.

## 2. Multi-vendor keys and model registry

**The idea:** the user should be able to add a handful of API keys from different vendors in one action, and see every model they've registered against those keys in one place, without needing separate setup flows per provider.

**How it actually works:** this doesn't create a new storage system — it extends Harness's own `llm` plugin credential store, which already lives locally under `~/.dsh` with the service bound only to `127.0.0.1`. The bulk-add UI validates each pasted key with one lightweight test call and marks it green or red immediately. The model registry is a small table with four mandatory fields per model: `model_id`, vendor, `historical_score` (a float, starting neutral), and a version/fingerprint string paired with a last-updated date. The date field isn't decorative — without it, there's no way to later notice that a vendor silently changed a model out from under a historical score that was computed against the old version. Budget and rate-limit values entered here become the actual `threshold` and `recovery_timeout` parameters passed into that model's `ModelCircuitBreaker` instance (§9) — this panel is the configuration surface for that component, not a separate concern.

## 3. Team and role configuration

**The idea:** the user decides which roles a given task even needs, and can hand-pick the model for any role they care about, leaving the rest to automatic assignment.

**How it actually works:** a small default role catalogue (Planner, Implementer, Critic) is used unless the user adds or removes roles for a specific task. Locking a role to a model happens before the orchestrator runs at all: a locked `(role, model_id)` pair is removed entirely from the candidate pool passed into the auction (§4) — it isn't merely given a scoring bonus, because a bonus can still theoretically be outbid, and a manual lock is supposed to mean exactly what it says.

## 4. Orchestrator and role auction

**The idea:** whoever fills a role should be chosen by a real combination of track record and a demonstrated approach to *this* task — never by a model's own claim about how good it would be.

**How it actually works:** `score_role_fit(candidate, peer_reviewer_fn, task)` computes `W_HIST × historical_score + W_PEER × peer_score`, with both weights currently set to 0.5 as a placeholder pending calibration against real outcome data (Phase 2 of the implementation plan — there's no honest way to calibrate this before real runs exist). `peer_score` never comes from the candidate itself: an independent model — ideally from a different vendor family — reads the candidate's proposed approach as plain text and scores it against a fixed rubric. The candidate's own stated confidence is never a numeric input to the scoring function at all; it's only ever the text the peer reviewer is scoring. Ties are resolved by `deterministic_tiebreak(candidates, session_id)`, which hashes `session_id:agent_id` through SHA-256 and picks the minimum — the same session always reproduces the same winner, so debugging a run doesn't introduce a second source of randomness on top of whatever the models themselves already contribute. The reason the mechanism has this exact shape rather than something simpler: a naively self-scored bid has a failure mode where the rational move for every agent is to claim the maximum possible score, since self-report is free and only ever helps — at which point the signal disappears completely and selection becomes arbitrary. Peer review has no equivalent collapse mode, because it doesn't depend on what the candidate says about itself.

## 5. Role approval table

**The idea:** before a team starts working, the user sees exactly who was picked, why, and gets a real chance to override it — not a rubber-stamp confirmation dialog.

**How it actually works:** the orchestrator finishing its work emits a `role_assignment_proposed` event carrying, per role, the assigned `agent_id`, its historical score, its peer score, and the peer reviewer's rationale (shown truncated in the table, in full on expand). Each row has three possible actions, each mapping to a distinct follow-up event: **Approve** → `role_approved`; **Reassign manually** → `role_reassigned_manually`, which behaves like a one-run lock on the newly chosen model; **Re-run auction for this role** → `role_reauctioned`, which reruns the mechanism in §4 excluding the previously assigned candidate. Nothing downstream — planning, execution, spend of any kind — starts until every row in the table has resolved. This is a hard gate, implemented as a blocking wait on a `role_assignment_confirmed` event that only fires once every row is resolved, not a soft UI suggestion.

## 6. Planner and plan approval

**The idea:** the team doesn't start acting on a task until the user has seen and approved an actual plan, and can push back on it with a real comment rather than an all-or-nothing accept/reject.

**How it actually works:** the planner's output is a structured object — an ordered list of steps, an owning role per step, an explicit acceptance criterion per step — deliberately not free text, specifically so the approval UI can render a meaningful diff when the user edits something rather than treating any change as a full rewrite. "Send back with a comment" re-invokes the planner with three things: the original task, the rejected plan, and the comment — never a blank retry that discards the context of what was wrong with the first attempt. Approval fires a `plan_confirmed` event, which is the second and final blocking checkpoint before any execution-phase model spend can happen.

## 7. Team execution — general chat and gated disputes

**The idea:** the team's work should be fully visible, but disagreements should only interrupt the flow when they're actually worth interrupting for — not on a fixed schedule, and not involving everyone every time.

**How it actually works:** every step an agent produces carries its own confidence score. If that score falls below a configured threshold, a `dispute_triggered` event fires instead of the step proceeding directly — this is confidence-gating, the same principle behind the DOWN framework referenced in the validation document, and it's the reason disputes don't happen "just in case." Which agents are invited into a triggered dispute is decided by a relevance filter — functionally the same shape as a candidate function in AutoGen's `SelectorGroupChat` — that asks only "does this agent's role touch the artifact under dispute," never defaulting to the full team. The dispute itself doesn't run for a fixed number of rounds: an adaptive-stability check models the distribution of stated positions each round and tests whether that distribution has statistically stopped moving, ending the dispute the moment it has rather than after an arbitrary count. Both the general chat and every dispute transcript live in the same append-only event log described in §9 — "collapsed by default" in the UI is a rendering choice made over that shared log, not a separate, lower-fidelity data path.

## 8. Critic and verification

**The idea:** work gets checked continuously, not just inspected once at the very end, and arguments in a dispute have to be backed by something checkable, not just stated with confidence.

**How it actually works:** every handoff between agents — not only the final output — triggers a verification check against a fixed, pre-written checklist specific to that handoff's type (format check, logic check, security check), emitting either `verification_passed` or `verification_failed`. Before any argument is allowed into a live dispute, it passes through `filter_admissible_arguments`, which uses pattern-matching to require a checkable reference — a file path, a test identifier, a line number, a log reference — and rejects arguments that are purely assertions of confidence or tone. This means the other agents in a dispute never even see an unsupported "I'm confident this is right" — it's filtered before it reaches them, not merely discouraged by the prompt.

## 9. Persistence and resilience

**The idea:** a crash or a vendor outage mid-task should degrade the system, not destroy the task.

**How it actually works:** `SessionEventLog` is append-only — every state-changing thing that happens is written as one line, and the "current state" of a session is never read from memory; it's always the result of replaying the log from the start. This is what makes a process restart mid-dispute recoverable: a new process reconstructs the exact same state (messages, latest agent positions, round number) purely from what's on disk. `ModelCircuitBreaker` wraps every model call individually and holds one of three states — closed (normal), open (failing fast with a degraded result, no call attempted), half-open (letting exactly one call through after a cooldown to test recovery). After a configured number of consecutive failures it opens automatically; a successful half-open call closes it again automatically. Neither of these requires a human to notice and intervene for the task to keep moving.

## 10. Security

**The idea:** no agent — and no subagent from a different vendor — should end up with more access than its specific role needs, even by accident, and one agent's output should never be able to silently command another agent.

**How it actually works:** every agent's effective permission set is the *intersection*, never the union, of Harness's own sandbox policy and any subagent-specific policy it brings with it — a subagent bundle asking for both network access and shell execution only receives both if both policies independently allow both; if either policy is silent on one of them, that one is denied. Every inter-agent message carries an explicit origin tag, and the receiving agent's framing treats another agent's message content as data to consider, never as an instruction to act on directly. This specifically closes a gap that's easy to miss: a model that reliably resists a direct injected instruction has been shown to comply with the identical instruction when it arrives disguised as a message from a peer agent instead — origin tagging is the concrete fix for that blind spot, not a general "be careful" instruction.

## 11. Observability

**The idea:** it should be possible to reconstruct exactly what happened in any run after the fact, in a format that supports real failure analysis rather than just a wall of raw text.

**How it actually works:** every model invocation, tool call, and agent handoff is wrapped in an OpenTelemetry GenAI-convention span (`invoke_agent`, `chat`, `execute_tool`) carrying model, provider, and token attributes. This means a completed run can be analyzed using the same categories the published multi-agent failure taxonomy uses — coordination failures, specification failures, verification failures — against our own traces, rather than inventing a bespoke logging format that can't be compared to anything.

## 12. Diversity monitor and budget dashboard

**The idea:** the user should get an early, non-intrusive warning if the team is quietly converging into a rubber-stamp echo chamber, and should never be surprised by what a task cost.

**How it actually works:** the diversity monitor computes the average pairwise cosine distance across the team's stated-position embeddings on each round of a live dispute; if that value drops below a configurable rolling threshold, a non-blocking "team health" flag appears in the UI — informational only, never a gate. The budget dashboard performs no separate accounting: every model-call event already carries its own token count and price, so the dashboard is simply a live aggregation over the same event log, shown against the worst-case estimate computed before the task started.

## 13. End-to-end walkthrough, technically annotated

`role_assignment_proposed` → user resolves every row → `role_assignment_confirmed` → `plan_proposed` → user approves or sends back with a comment → `plan_confirmed` → execution begins, general-chat messages logged continuously → any step under the confidence threshold fires `dispute_triggered` with its relevant agent subset → the dispute ends on `dispute_resolved` once positions stabilize → each handoff produces `verification_passed` or `verification_failed` → task completion assembles its final output and full decision log directly from replaying this same event stream — the decision log isn't a separate artifact, it *is* the stream.

## 14. What's still provisional

The 0.5/0.5 weighting in `score_role_fit` is a placeholder until real outcome data exists to calibrate it. The exact UI framework underlying Harness's native Web UI panels is inferred from third-party plugin release notes, not confirmed from official documentation — Phase 0 of the implementation plan confirms it directly before any panel is built against an assumption. The diversity monitor's threshold is calibrated against a synthetic toy simulation, not real multi-agent behavior, and is explicitly flagged for revalidation once real runs exist.
