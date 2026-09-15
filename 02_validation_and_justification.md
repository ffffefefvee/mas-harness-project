# Roundtable — Validation & Justification

This document exists to answer one question honestly: given that no large-scale benchmarking is possible right now, what is the actual basis for believing this architecture is sound enough to build? It draws a hard line between three kinds of evidence — published external research, our own local computation, and open questions that neither can close — because blurring that line would be dishonest, and because the phase-gated build plan (see the Implementation Plan) exists specifically to close the third category cheaply, one small step at a time.

---

## 1. How the system works, in one pass

A task is submitted. An orchestrator proposes a team by scoring candidate models on historical track record plus an independent peer review of how each proposes to approach this specific task — never on the model's own self-report directly. The user approves or edits the team. A planner drafts a plan; the user approves or revises it. The team then executes with a general chat that's always visible, plus small, targeted disputes that trigger only when a step's confidence is low and involve only the agents relevant to that disagreement — not the whole team, not on a fixed schedule. A critic verifies work at every handoff, not only at the end, against a fixed checklist rather than a freeform judgment call. Everything is logged to an append-only event log so state survives a crash mid-task, every model call goes through a circuit breaker so a vendor outage degrades gracefully instead of failing the whole task, and every agent runs with the minimum tool/file/network access its role needs. All of this runs as plugins inside the user's own local DeepSeek Harness install, extending its native Web UI rather than replacing it.

## 2. Decisions backed by external research

### 2.1 Structured task specs and multi-level verification
**Decision:** enforce a structured task schema, validate every inter-agent handoff, verify at every handoff rather than only at the end.
**Evidence:** the Multi-Agent System Failure Taxonomy (MAST; Cemri et al., 2025, UC Berkeley) analyzed 1,600+ execution traces across seven multi-agent frameworks and found that roughly 79% of failures trace to specification and coordination problems rather than model capability — and, tellingly, that a single-agent version of the same underlying model sometimes outperforms the multi-agent version when these problems are present. This is the single strongest piece of evidence behind the whole project: it says the risk we should worry about most is architectural, not "are the models good enough."

### 2.2 Never let a model score its own self-report
**Decision:** self-reports are always routed to an independent, cross-family reviewer — never scored by the reporting model itself.
**Evidence:** the LLM-as-judge literature documents self-preference bias as a reproducible effect; cross-family judging and peer-rank/discussion mechanisms are established mitigations. A dedicated study on quantifying and mitigating self-preference bias found that decomposing evaluation into independent, structured criteria — rather than one holistic score — cut the bias by roughly 31.5%.

### 2.3 Confidence-gated, adaptively-stopped disputes
**Decision:** disputes trigger on confidence, not a fixed schedule, and stop on stabilization, not a fixed round count.
**Evidence:** the DOWN framework (Debate Only When Necessary) reports up to 6x efficiency gains from confidence-gating without sacrificing accuracy against full-debate baselines. A separate adaptive-stability-detection method (a Beta-Binomial mixture combined with a Kolmogorov-Smirnov test) detects when debate opinions have statistically stabilized and stops there instead of running a fixed number of rounds.

### 2.4 Heterogeneous teams, aggregation-mode-aware
**Decision:** deliberately mixed-vendor teams; the critic's aggregation mode (select-best vs. synthesize) is an explicit configuration choice, never a silent default.
**Evidence:** Mixture-of-Agents research shows heterogeneous models outperform repeated sampling from a single model. A follow-up study, "When Agents Disagree: The Selection Bottleneck," shows synthesis-based aggregation can forfeit the value of a standout candidate while selection-based aggregation exploits exactly that variance — meaning the same diverse team can help or actively hurt depending on this one configuration choice. "Mixture of Complementary Agents" further shows that selecting models for complementarity with the aggregator beats selecting purely for accuracy or purely for diversity.

### 2.5 Heterogeneity as a safeguard against groupthink
**Decision:** enforce a minimum-diversity floor on team composition; treat sampling temperature as a safety parameter, not just a creativity knob.
**Evidence:** "Emergence of Biased Consensus in Multi-Agent LLM Debates" (Okawa, ICML 2026) identifies sampling noise as a key driver of a phase transition into collective bias, and shows that agent heterogeneity smooths and suppresses that transition.

### 2.6 Scoped sub-disputes, not always-everyone
**Decision:** mini-disputes pull in only the agents relevant to a given disagreement.
**Evidence:** this is the established pattern behind AutoGen's `SelectorGroupChat`, which supports a candidate function narrowing the eligible speaker pool before a model-based selection step runs.

### 2.7 Least privilege and sandbox intersection
**Decision:** every agent and subagent gets the minimum necessary tool/file/network access; conflicting sandbox policies from cross-vendor subagents resolve by intersection, never union.
**Evidence:** least-privilege enforcement for AI agents — short-lived, scoped credentials, human confirmation for irreversible actions — is a standing recommendation across NIST SP 800-53, ISO 27001, and CIS Controls. The "confused deputy problem" and the WASI deny-by-default capability model are the established framing and countermeasure for agents inheriting excess ambient authority.

### 2.8 Message-origin tagging against inter-agent injection
**Decision:** every inter-agent message is tagged with its origin; content from another agent is treated as data by default, never as an instruction.
**Evidence:** "Prompt Infection" (Lee & Tiwari, 2024) demonstrates a self-replicating LLM-to-LLM injection spreading through a multi-agent system and proposes LLM Tagging as a countermeasure. Separate work found models otherwise resistant to a direct injection complied with an identical malicious request 100% of the time when it arrived from a peer agent instead — inter-agent trust is a distinct blind spot from direct prompt injection, not the same problem under a different name.

### 2.9 No reliance on bitwise reproducibility
**Decision:** stability is judged by agreement across repeated runs, not identical output; every historical score is timestamped and versioned.
**Evidence:** multiple independent studies show temperature = 0 does not guarantee deterministic output on GPU hardware, due to floating-point operation ordering. One study on code generation found that 47.6%–75.8% of tasks produced different outputs between runs, depending on dataset, even under a nominally deterministic setting.

### 2.10 Auction-style, peer-reviewed role assignment
**Decision:** self-reports feed a peer-reviewed scoring mechanism; they never directly determine a self-scored bid.
**Evidence:** Agora (2026) demonstrates an auction-based task allocation mechanism explicitly designed to route work to the most capable agent rather than the most confident-sounding one. Separately, "Do LLM Agents Negotiate Rationally?" found that even under a mechanism that is truth-telling-optimal by construction, a tested model bid truthfully in only 3.3% of trials — theoretical incentive-compatibility does not automatically transfer to LLM agent behavior, which is precisely why self-report can't be trusted even when the mechanism "should" make honesty the rational choice.

### 2.11 Observability via an existing standard
**Decision:** trace every agent invocation, tool call, and handoff using OpenTelemetry's GenAI Semantic Conventions.
**Evidence:** this is an actively developed, vendor-neutral standard already adopted by major observability platforms, with a dedicated working group extending it specifically to multi-agent systems — tasks, actions, agents, teams, and artifacts as linked, traceable entities.

### 2.12 Subset selection doesn't need a combinatorial solver
**Decision:** a relevance-threshold score per agent — not a search over coalition structures — decides mini-dispute membership.
**Evidence:** full team-partitioning (coalition structure generation) is provably NP-hard, growing as a Bell number. But the actual per-dispute question — is this one agent in or out — is a much smaller 2ⁿ subset-selection problem that stays fully enumerable well past any realistic team size (32,768 possibilities at n = 15). This was a correction made to our own earlier reasoning mid-design, not a claim we started with — worth stating plainly rather than smoothing over.

## 3. Decisions backed by our own local computation

All of the following were run with no network access and no paid API calls — pure math, brute-force search, and synthetic-data simulation, at zero marginal cost, matching the project's budget constraint directly rather than as a workaround for it.

### 3.1 Self-report vs. peer review, quantified
20,000 simulated role-assignment trials across three regimes. Mild, non-adaptive self-report inflation still picked the genuinely best-fit agent 69.6% of the time — not catastrophic in isolation. But under the game-theoretically rational equilibrium — every agent reports the maximum of the declared scale, since self-report is free and monotonically improves selection odds — accuracy collapsed to 16.9%, statistically indistinguishable from pure chance (16.7% for a 6-agent pool). Independent peer review held steady at 64.7% regardless of what agents declared about themselves. The underlying game-theoretic principle was verified directly by brute force: at every tested opponent-bid level, truthful bidding was optimal under a second-price-style mechanism but not under a first-price one. This is the quantitative basis for routing role-fit exclusively through peer review rather than self-report — and it's a case where our own numbers refined an initial, softer hypothesis (see §5).

### 3.2 Groupthink detection, demonstrated in a toy model
A simulated team of 6 synthetic agents, whose opinion vectors drift toward the group centroid each round (modeling the conformity dynamic from §2.5), was monitored with a simple pairwise-distance diversity metric. The metric crossed an early-warning threshold (25% of initial diversity) by round 4 of 8 — well before the team fully converged by round 7 — confirming the metric class is sensitive enough, in principle, to serve as an early warning. This is explicitly a demonstration of the mechanism's shape, not evidence it will behave identically against real model behavior.

### 3.3 Cost and latency, with real numbers
A worst-case budget calculator, using illustrative but realistic per-token pricing, put a 6-agent, 3-round task at roughly $270, and a 10-agent, 5-round task at roughly $975. This is the concrete reason confidence-gated disputes (§2.3) are a budget necessity for this project, not a nice-to-have. Separately, modeling sequential vs. parallel round execution showed that parallelizing agent turns within a round — rather than serializing them — removes the multiplicative latency penalty entirely for rounds without a genuine dependency between agents.

### 3.4 Working infrastructure primitives
Several components were built and tested directly, at zero API cost: a deterministic hash-based tie-break (verified to produce identical output across repeated runs with the same session id); a circuit-breaker state machine (verified to open after repeated failures, serve degraded results while open, and recover once the underlying call succeeds again); an append-only event log (verified to fully reconstruct session state — messages, latest positions, round number — after a simulated process restart); a sandbox permission-intersection function (verified, on a concrete example, that a naive union of two plausible policies would have granted a combination — network access plus shell execution — that neither policy alone allowed); and an evidence-requirement filter for dispute arguments (verified to admit only arguments containing a checkable reference and reject unsupported ones in a test set).

## 4. What remains genuinely unvalidated

Several findings above are drawn from research on different systems, or demonstrated only in synthetic/toy simulations that model the shape of a risk rather than the real behavior of the specific models this system will eventually run. Still open: whether the diversity-collapse metric behaves the same way against real LLM debate dynamics as it does in the linear-conformity toy model; the real-world magnitude of self-report gaming by the specific models actually deployed; whether persuasive-but-wrong arguments actually move real agents disproportionately to their rhetorical strength rather than their content; and whether the Harness plugin UI extension mechanism works exactly as inferred from third-party plugin release notes rather than from official documentation we haven't seen directly. None of these can be closed by more reasoning or more simulation — closing them is the explicit job of the phased smoke tests in the Implementation Plan, not of this document.

## 5. A note on intellectual honesty in this process

Section 3.1 is included with its full history deliberately. The first version of the self-report simulation actually showed self-report modestly *outperforming* noisy peer review — the opposite of the intended conclusion. Rather than discard that run, the model was corrected to test the actual claim at stake (rational, cost-free exploitation, not mild idiosyncratic noise), which produced the sharper and more defensible finding above. A validation document that only reports the results that confirm the chosen design isn't validation — it's advocacy wearing validation's clothes. Where a finding was initially wrong or incomplete, that's recorded here rather than smoothed over, including the coalition-generation correction in §2.12.

## 6. Overall verdict

The architecture is not first-guess design: nearly every major decision traces to either a named, published finding or a computation we ran ourselves and can reproduce. The open items are honestly bounded and few, and each has a specific, cheap, phase-gated test designed to close it before more is spent building on top of it. On that basis, proceeding to implementation is a reasonable, evidence-weighed decision — not a leap of faith, and not a claim of certainty either.
