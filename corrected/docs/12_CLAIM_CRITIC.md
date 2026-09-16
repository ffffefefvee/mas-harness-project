# Claim Critic

## Purpose

The Claim Critic performs narrow, low-cost checks of externally verifiable factual claims made by agents before those claims enter a debate transcript or final answer. It is an evidence assistant, not a truth oracle and not a voting agent.

## Pipeline

1. **Extract:** split a candidate message into atomic claims.
2. **Classify:** mark each claim as project-internal, web-verifiable, deterministic, opinion, prediction, instruction, or unverifiable.
3. **Risk score:** consider downstream impact, novelty, specificity, temporal sensitivity, and whether the claim controls a decision.
4. **Route:** use local tools for deterministic/project claims; use web search only for eligible public claims.
5. **Retrieve:** generate one or more bounded search queries and collect source metadata and relevant excerpts.
6. **Assess:** compare the exact claim with evidence.
7. **Return:** attach a compact verification note or request correction.

## Verdicts

The result is never forced into yes/no. Allowed verdicts are:

- `supported`;
- `contradicted`;
- `mixed`;
- `insufficient_evidence`;
- `not_verifiable`;
- `stale_or_time_sensitive`.

Each result records the checked claim, scope, sources, publication/access dates, concise evidence, limitations, and confidence. Confidence measures evidence adequacy, not truth probability.

## Cheap flash model

A low-cost model may be used only for atomic-claim extraction, query planning when templates are insufficient, evidence compression, and entailment classification. Search and source retrieval are tools; the model must not answer from memory.

The model receives only the claim, source excerpts, and output schema—not the full repository or debate. Temperature is low, output is capped, and there is at most one repair attempt.

The target budget is configurable per check. A nominal goal of $0.001–$0.005 cannot be guaranteed independently of provider prices, minimum billing units, query costs, and claim length. Runtime enforcement uses a hard per-claim ceiling and a per-message ceiling.

## Selection policy

Do not verify every sentence. Prefer claims that are:

- externally factual and material to the decision;
- numerically precise;
- about versions, prices, compatibility, security guidance, laws, standards, research, or recent events;
- disputed by another agent;
- unsupported by an existing fresh cache entry.

Skip opinions, recommendations presented as recommendations, trivial conversational statements, private project facts unavailable to the verifier, and claims whose verification would expose protected information.

## Publication behavior

- High-impact contradicted claims are held for correction before publication.
- Low-impact mixed or uncertain claims are annotated but do not block.
- Insufficient evidence is never rewritten as false.
- The original claim, correction, and evidence remain in the decision log.
- The producing agent gets one compact correction opportunity; no recursive fact-check debate is opened.

## Source policy

Prefer primary and authoritative sources. Require source diversity when a claim is contested or high impact. Search snippets alone are insufficient for high-impact verdicts; the relevant page must be retrieved. Freshness requirements depend on the claim.

Search results and pages are untrusted content. The retriever strips active instructions and the Claim Critic has no filesystem, shell, credential, or write capabilities.

## Caching and deduplication

Cache by normalized atomic claim, temporal scope, search-policy version, and source freshness window. Similar claims in one message share retrieval. Cache entries retain citations and expiry. Time-sensitive claims expire quickly.

## Relationship to project evidence

Internal claims are routed to the continuous code intelligence system, repository search, tests, event history, or configuration inspection. They are not sent to a public search engine. A claim about both public and private facts is split before routing.

## MAD integration

The critic runs at the message boundary, not as a debate participant. Its output is structured evidence available to all participants. It can reduce cheap factual disagreement, but it cannot resolve value judgments, architectural tradeoffs, or claims requiring experiments.

## Failure behavior

Timeout, provider failure, search failure, source conflict, or budget exhaustion returns `insufficient_evidence` with diagnostics. The system never silently treats a skipped check as successful verification.
