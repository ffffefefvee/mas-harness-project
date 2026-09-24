# Decision register

Status values: **Accepted**, **Provisional**, **Experimental**, **Superseded**, **Rejected**.

| ID | Status | Decision | Reason / consequence |
|---|---|---|---|
| D-001 | Accepted | Build as extensions to DeepSeek Harness rather than a separate cloud application. | Reuses host services; compatibility is supported only for runtime-tested revisions. |
| D-002 | Accepted | Local-first storage and control, not a claim of local-only execution. | External providers are explicit data-transfer boundaries. |
| D-003 | Accepted | Use Direct, Reviewed, and Team modes with deterministic minimum-mode floors. | Avoids paying multi-agent overhead for every task. |
| D-004 | Accepted | Models are advisory and never grant capabilities, spending, approval, or publication authority. | Probabilistic text is not an authorization mechanism. |
| D-005 | Accepted | Run continuous code diagnostics independently of agents. | Cheap deterministic evidence should not depend on model activity. |
| D-006 | Accepted | Treat AI-slop detectors as optional risk heuristics, not correctness or authorship proof. | Avoids replacing established analyzers with opaque scores. |
| D-007 | Accepted | Route internal claims to project evidence and eligible public claims to bounded retrieval. | Reduces privacy leakage and evidence-category errors. |
| D-008 | Accepted | Claim Critic is evidence middleware, not a truth oracle or debate voter. | Preserves mixed/unknown outcomes and limits authority. |
| D-009 | Accepted | Use durable versioned events for state-changing facts. | Supports recovery and audit; sensitive content is referenced rather than copied by default. |
| D-010 | Accepted | Use least-privilege, intersection-based capability resolution. | Prevents privilege composition and confused-deputy behavior. |
| D-011 | Accepted | Record cost estimates, reservations, observed usage, and provider charges separately. | Client estimates are not provider-enforced caps. |
| D-012 | Accepted | Require isolated execution and deterministic post-change checks in Direct mode. | Direct means no independent model review, not no verification. |
| D-013 | Accepted | Preserve historical documents but make `docs/product/` authoritative. | Retains provenance without allowing obsolete plans to compete with the current spec. |
| D-014 | Provisional | DeepSeek Harness is the production host. | Source inspection and a plugin spike are positive; runtime feasibility is still a gate. |
| D-015 | Provisional | Production persistence will use a transactional local store. | JSON is adequate for the spike, not yet chosen as the production durability format. |
| D-016 | Experimental | Laya, Jev, or their cascade may advise task routing. | No live comparative evidence exists; rules remain default. |
| D-017 | Experimental | Team mode can improve selected high-impact tasks. | Must beat Reviewed on held-out tasks after cost, latency, and safety. |
| D-018 | Experimental | Worker/reviewer diversity may produce complementary errors. | Different vendors do not guarantee independence; measure error correlation. |
| D-019 | Experimental | Structured challenge/response may outperform one independent review. | Open-ended debate is not accepted; test the smallest bounded mechanism first. |
| D-020 | Experimental | Confidence may help prioritize escalation. | It cannot lower risk floors and must be calibrated on the target workload. |
| D-021 | Experimental | Diversity metrics may be useful diagnostics. | Toy simulations do not establish intervention value. |
| D-022 | Superseded | Mandatory role auction and plan approval for every substantial task. | Replaced by mode-specific workflow; Team alone requires this by default. |
| D-023 | Superseded | Build multi-agent coordination before deterministic diagnostics. | Reversed: deterministic kernel, Direct, and Reviewed come first. |
| D-024 | Superseded | Append-only flat files are the settled production state store. | Storage remains local and event-oriented, but production durability requires a transactional design decision. |
| D-025 | Rejected | Nothing is sent to third parties. | False when external models/search are used; data transfer must be explicit instead. |
| D-026 | Rejected | No cost occurs before user approval. | Routing/planning can cost money; require preflight authorization and visibility instead. |
| D-027 | Rejected | Model self-confidence or self-reported fit directly decides routing/staffing. | Untrusted and potentially miscalibrated/gamed. |
| D-028 | Rejected | More agents or more rounds imply higher quality. | Complexity must prove incremental value over simpler baselines. |
| D-029 | Rejected | A fact-checking model can verify from memory. | Evidence must come from project tools or retrieved sources. |
| D-030 | Rejected | Agent messages can be trusted because they come from peers. | Cross-agent prompt injection makes all peer content untrusted. |

## Updating decisions

Changing an Accepted decision requires a PR that identifies affected requirements, migration/compatibility consequences, evaluation evidence, and superseded text. Experimental decisions become Accepted only by passing the relevant gate in `06_EVALUATION_AND_ACCEPTANCE.md`.