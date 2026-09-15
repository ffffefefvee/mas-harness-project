# Roundtable — Vision & Scope
*(Working title for the multi-agent developer-team plugin for DeepSeek Harness. Rename freely — used here only so the document isn't forced to say "the system" every sentence.)*

---

## 1. Vision statement

Give a person working inside DeepSeek Harness a way to hand a development task to a small, accountable team of AI agents — playing distinct roles, deliberately drawn from different model vendors — that plans, executes, and checks its own work the way a competent small dev team would, while keeping the human in control of the two decisions that actually matter (who's on the team, and what the plan is) and out of the way for everything else.

## 2. Problem and motivation

- A single model call is fast, but it has no built-in second opinion, no dedicated verification step, and no diversity of professional judgment — it's one perspective, however capable.
- Existing multi-agent frameworks (AutoGen, MetaGPT, CAMEL) already give role-based teams, but none of them do capability-aware *dynamic* role assignment, and none are built around a sandboxed, keys-stay-on-your-machine environment.
- DeepSeek Harness supplies exactly the substrate this needs: a plugin architecture with no privileged core, native multi-agent orchestration, cross-vendor subagent support, and a real local Web UI that can be extended instead of rebuilt from zero.
- The gap Roundtable fills: a configurable, transparent, human-checkpointed multi-agent dev team that a solo developer or small team can point at a task and trust — not because it's a black box that's "smarter," but because every step of *who* was chosen, *why*, and *what they argued about* is visible and approvable.

## 3. Goals

- **G1.** Let a user submit a development task and have it handled by a small team of role-specialized agents, not one model in isolation.
- **G2.** Assign roles based on a defensible combination of track record *and* a demonstrated approach to this specific task — not a single vendor's marketing claim of being "the best model."
- **G3.** Keep the two decisions with real downstream cost — team composition and the plan — in the user's hands as fast, low-friction approvals, never buried settings.
- **G4.** Make disagreement between agents productive (catch real problems) without turning every task into an expensive, slow committee meeting.
- **G5.** Run entirely inside the user's own sandboxed Harness install — their own keys, their own machine, nothing shipped to a third-party server.
- **G6.** Degrade gracefully. A vendor outage, a rate limit, a malformed agent output — none of these should silently produce a wrong answer or hard-crash the task.
- **G7.** Make cost and time visible *before* they're spent, not discovered afterward.

## 4. Non-goals (explicit scope boundaries)

- **Not** a general chat replacement — Roundtable is for tasks substantial enough to be worth a team. Trivial one-shot questions should be recognized as such and routed to a single agent, not forced through a full team every time.
- **Not** a benchmarking or leaderboard product — internal historical scores exist to inform role-fit decisions, not to publicly rank models.
- **Not** a fully autonomous, unsupervised agent — the two approval checkpoints (roles, plan) are permanent product features, not training wheels meant to be removed later.
- **Not** vendor-exclusive — no assumption that a single provider is used throughout. Heterogeneity is a design goal, not a compromise to tolerate.
- **Not** a replacement for the Harness Web UI — an extension of it, reusing its chat rendering, credential storage, and settings rather than duplicating them.

## 5. Core concept

The mental model is a small, visible dev team — not a monolithic assistant wearing different hats.

- **Orchestrator** — the staffing manager. Looks at the task, looks at who's available (a model pool with historical performance plus how each candidate proposes to approach *this specific* task), assigns roles, and is the only component that spends the user's approval attention on a role-assignment screen.
- **Planner** — turns an approved team and a task into an actual plan, which the user approves — or sends back with a comment — before a single dollar is spent on execution.
- **Team execution** — a general chat visible in full, plus targeted, capped, confidence-gated sub-disputes that pull in only the agents actually relevant to a given disagreement.
- **Critic** — checks work at every handoff, not only at the end, and runs security/verification checks against a fixed checklist rather than a freeform "does this look okay?"

The team never runs as an unaccountable black box: the user always sees who's staffed, why, what the plan is, and — collapsed by default, expandable on demand — what the team argued about along the way.

## 6. Quality standards / product principles

These are the bar every feature is measured against — not features in themselves.

- **Nothing silent.** A degraded result, a skipped step, a rejected argument — always visibly flagged in the UI, never quietly absorbed.
- **Reversible before expensive.** Every step that costs real API money is preceded by a free, reviewable decision point wherever one can exist (role table, plan).
- **Cost before commitment.** Worst-case budget for a task is estimable and shown before the task runs, not just tallied afterward.
- **No unearned trust in self-report.** Nothing a model claims about itself — its own confidence, its own fit for a role — is ever the deciding signal without an independent check. This is a hard architectural rule, not a preference (see Validation & Justification, §3.2 and §4.1, for why).
- **Least privilege by default.** Every agent and subagent gets the minimum tool/file/network access its role needs, never a shared blanket permission set.
- **Local-first.** Keys, session history, and configuration live on the user's machine; nothing is sent anywhere it doesn't have to be.

## 7. User interface

Delivered as panels inside the native Harness Web UI (`dsh web`), not a separate application — following the precedent already set by third-party Harness plugins such as `dsh-dashboard` (a custom multi-project dashboard) and `dsh-usage-chart` (a live cost visualization embedded under the input box).

**Panels:**

1. **Keys & Models** — bulk-add API keys per vendor in one action; a model registry showing each model's id, vendor, historical score, and last-updated date; per-key budget and rate limits.
2. **Team setup** — choose which roles exist for this task; lock specific roles to specific models if desired; leave the rest to auto-assignment.
3. **Role approval table** — role / assigned model / historical score / peer-review score / one-line rationale, with per-row buttons: Approve, Reassign manually, Re-run auction for this role.
4. **Plan approval** — the planner's output, editable inline, with Approve or Send back with a comment.
5. **Live team view** — general chat, always expanded; sub-disputes collapse into a card by default, expandable on click; a small status strip per agent (idle / thinking / awaiting peer review).
6. **Budget & health strip** — running token/cost total against the pre-task estimate, plus (later phase) an optional team-diversity indicator, extending the existing `dsh-usage-chart` pattern rather than adding a new screen.

The mockup below shows the role approval table, since it's the most novel and consequential screen in the product — the point where the user directly overrides an automated decision that otherwise carries real weight for the rest of the task.

## 8. Complete user journey

1. **Install.** The user adds the Roundtable plugin bundle to their existing Harness install via the standard plugin-add flow.
2. **First run.** The Keys & Models panel is empty; the user is prompted to add at least one vendor key before anything else becomes usable.
3. **Bulk key entry.** The user pastes three API keys (different vendors) in one action; each is validated with a lightweight test call and shows a green/red status inline.
4. **Model registration.** The user registers five models against those keys. Historical scores start neutral until seeded manually or accumulated over real runs.
5. **Task submission.** The user submits: "Add OAuth login to this service and write tests for it."
6. **Team proposal.** The orchestrator proposes a team — Planner, two Implementers (different vendors), a Critic. Two roles are auto-assigned via the peer-reviewed auction; the user had pre-locked the Critic role to a specific model they trust for security review.
7. **Role approval.** The table appears. The user reads the peer-review rationale for one contested role, disagrees, clicks "Reassign manually," picks a different model, and re-approves the row.
8. **Plan.** The team is confirmed. The planner produces a plan. The approval screen shows it alongside an estimated worst-case budget.
9. **Plan revision.** The user edits one line (changes the test framework), adds a comment, and sends it back. The planner revises; the user approves the revision.
10. **Execution.** The live team view shows the general chat scrolling. A sub-dispute badge appears ("Implementer A and Critic disagree on token storage — 2 participants"), collapsed by default. The user expands it, reads it, and lets it resolve on its own — not required to intervene, because confidence-gating means this triggered as "worth a quick check," not "will hang without you."
11. **Degradation.** Mid-task, one vendor's API times out repeatedly. The health strip shows a degraded badge for that model; the circuit breaker routes to a same-class fallback; the task keeps running with a visible note in the log rather than crashing.
12. **Verification.** The critic runs its checklist at each handoff. The final output includes the code and tests, plus a decision log — who did what, where the team disagreed, what was approved and when.
13. **Completion.** The budget strip shows actual cost against the estimate. The user can drill into the full transcript or simply take the output.
14. **Next run.** Historical scores are nudged based on this run's peer-review outcomes; models the user was happy with can be pre-locked for future tasks.

## 9. Success signals

No large-scale benchmarking is possible under the current budget constraints, so success is tracked qualitatively per real run rather than against a leaderboard:

- Every phase's smoke test (see the Implementation Plan) passes before the next phase begins.
- The user is not surprised by cost — actual spend lands within a reasonable band of the pre-task estimate.
- Manual overrides at approval checkpoints are rare but effective when used — the checkpoints aren't rubber-stamped, but they also aren't a constant fight with the system.
- No silent failures across real runs — every degraded, rejected, or overridden event is visible in the log after the fact.
