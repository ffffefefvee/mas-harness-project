# Roundtable — How This Concept Was Developed
### A narrative record of the design process

The other five documents are the spec. This one is the record of how the idea actually moved — including the points where an early instinct turned out to be wrong before it turned out to be right, because that history is part of why the current design can be trusted, not a detour from it.

---

## 1. Where it started

The starting point was DeepSeek Harness itself — released in August 2026 as an open-source agent runtime built on the Cordis plugin framework, with the defining property that models, tools, sessions, and even the agent loop are all plugins mounted through the same mechanism, with no privileged core to patch. Combined with native support for mounting cross-vendor subagents (Claude Code, Codex) inside a Harness-orchestrated tree, this made one specific idea worth pursuing seriously: a team of AI agents working the way a small development team does, instead of one model handling a task alone.

## 2. The first sketch

The initial idea, as first described, was already fairly specific: an orchestrator that assigns roles by combining known model benchmarks with how a model proposes to approach the specific task at hand, a separate planner producing a plan that could be reviewed before execution, a general team chat alongside small targeted disputes rather than one at a time, and a critic empowered to raise security and verification concerns. It came with an honest caveat attached from the start — that models weren't built for this kind of collaborative work, and that making it function well would take real design effort rather than assuming it would just work because the pieces sounded reasonable individually.

## 3. Discovering the sketch already had a name

Checking that sketch against the literature turned up something worth noting: it was close to an actual published mechanism. A paper on dynamic role assignment for multi-agent debate used almost the same two-stage shape — a proposal round, then peer review of those proposals — that the original sketch had arrived at independently. Existing frameworks (AutoGen, MetaGPT, CAMEL) already did role-based multi-agent teams, but none of them did capability-aware *dynamic* assignment, which meant that part of the sketch wasn't already solved elsewhere. Alongside that validation came the first real warnings: published research on self-preference bias in LLM judges, and — more sobering — published skepticism about whether multi-agent debate reliably beats much cheaper baselines like simple majority voting once the extra computation is accounted for.

## 4. Naming the actual risk

The next question was blunt: given all these known risks, how do we actually solve them? The most consequential finding at this stage was a failure taxonomy built from over 1,600 real execution traces across seven different multi-agent frameworks, which found that roughly 79% of multi-agent system failures trace to specification and coordination problems — not model capability — and that a single-agent version of the same model sometimes outperforms the multi-agent version when those problems are present. This reordered the whole project's priorities: the biggest risk to the design wasn't "are the models smart enough," it was "does the team's plumbing actually work," which meant fixing message schemas, handoffs, and verification had to come before worrying about how sophisticated the debates were.

## 5. The budget constraint changes the method

At this point the practical constraint became explicit: no large-scale testing or benchmarking was affordable. Rather than treat that as a blocker, it became the method — design everything on paper first, and specifically start not by designing an architecture, but by inventorying every systemic gap and vulnerability as an explicit list of questions, before writing a line of code.

## 6. Fifty-five questions

That inventory became a 55-question audit across 13 categories, each explicitly grounded in named research or established practice rather than invented from scratch. The instruction going in was strict about not gaming the number: pad to exactly 50, or fall short of it, would both have been dishonest relative to what the analysis actually surfaced — the count landed at 55 because that's how many genuinely distinct, non-overlapping risk areas the analysis found, not because of a target.

## 7. Answering with a paper trail

Every one of the 55 questions got an answer, but with an explicit, visible distinction maintained throughout: answers backed by a named published source were marked as such, and answers that had no external research to lean on — mostly because DeepSeek Harness itself was too new to have been studied, or because the question was specific to this project's own implementation choices — were marked as logical arguments instead, never dressed up to look like evidence they weren't.

## 8. When the numbers talked back

The next step pushed further: wherever actual computation could settle something more rigorously than prose, it should. Since the working environment has no network access, this meant zero-cost local simulation and brute-force computation rather than live API calls — a constraint that happened to match the budget limitation exactly rather than working around it. Two moments from this phase are worth recording honestly rather than smoothing over. First, an earlier claim that choosing which agents join a small dispute was an NP-hard problem turned out to be an overstatement once actually computed: NP-hardness applies to partitioning an entire team into multiple simultaneous coalitions, but choosing membership in one dispute is a much smaller, fully tractable problem even at realistic team sizes — the claim was corrected on the spot rather than left standing. Second, and more significantly, the first version of a simulation meant to demonstrate that self-reported confidence is risky actually showed the opposite — mild self-report inflation slightly *outperformed* a noisy independent peer review in that first run. Rather than discard the inconvenient result, the simulation was corrected to test the claim that actually mattered — what happens under rational, cost-free strategic inflation rather than mild idiosyncratic noise — which produced the sharp, defensible finding that now anchors the design: peer review has no catastrophic failure mode, while naive self-report collapses to pure chance once agents have any incentive to exploit it.

## 9. Realizing something was missing

Up to this point, every design decision had been about the backend — how agents coordinate, argue, and verify each other's work. It took a direct observation to notice that the entire human side of the product had gone unaddressed: how does an actual person add API keys, choose or approve a team, or watch the work happen at all? Following that observation, checking what "a GUI in the style of Harness" could even concretely mean turned up something that changed the plan materially: Harness ships a real native Web UI, and third-party plugins already extend it with entirely custom dashboards and live cost visualizations. What had started as a vague aesthetic goal — "make it feel like Harness" — became a literal, much cheaper integration strategy: extend the existing UI as a plugin, rather than design and build a separate application from nothing.

## 10. Locking in the product

That discovery led to six concrete decisions made in the same pass, rather than left open for later debate: build as Harness plugins extending its native UI, not a separate app; reuse Harness's existing credential storage rather than build a new vault; implement the role workflow exactly as proposed — manual locks plus an auction plus a mandatory approval table; add a second, equally mandatory approval step for the plan itself; keep the display of team activity collapsed by default with expansion on demand, following a pattern the Harness plugin ecosystem had already established; and fold the budget dashboard into an existing cost-visualization pattern rather than invent a new screen for it.

## 11. From plan to a full documentation set

With the product decisions settled, the work consolidated into a formal set of documents: a vision and scope document describing the product in its own terms, a validation document tracing every major decision back to either external research or a computation that could be reproduced, and a master implementation plan turning all of it into a phased, smoke-test-gated build order. The validation document deliberately kept its own history of being wrong before being right — the self-report simulation's initial, contrary result — rather than presenting only the results that confirmed the design, on the reasoning that a validation document which only shows agreeable results isn't validation at all.

## 12. This document, and the one next to it

The most recent step was recognizing that the concept itself was still split across documents — vision explaining what and why, implementation explaining how, with no single place holding both together per feature. That gap produced the companion document, `04_complete_concept_and_mechanics.md`, which walks through every part of the system twice: once as an idea, once as the exact mechanism behind it. This document exists next to it for a specific reason: the sequence of how the design was arrived at — including the parts that were initially wrong — is itself part of the case for trusting where it ended up, not a separate story from it.
