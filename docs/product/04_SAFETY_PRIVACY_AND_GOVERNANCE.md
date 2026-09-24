# Safety, privacy, and governance

## 1. Authority model

Models, reviewers, routers, and agents are advisory compute, not principals. They cannot create authority by emitting text.

Only the host policy layer and explicit user approvals may authorize:

- tool, filesystem, network, or credential access;
- external model/provider payloads;
- spending beyond an existing reservation;
- irreversible changes;
- publication, deployment, merge, messaging, or other external side effects;
- acceptance of unresolved critical risk.

A role name such as “security critic” grants no capability by itself.

## 2. Capability policy

Capabilities are deny-by-default, short-lived, operation-scoped, revocable, and logged. Effective access is the intersection of all applicable policies, never their union.

Separate capabilities include at least:

- read paths and write paths;
- shell execution and allowed commands;
- network destinations and methods;
- provider/model invocation;
- secret references without secret disclosure;
- Git mutation;
- UI publication or external communication;
- approval request creation.

A model never receives raw credentials. Tool brokers resolve secret references only at the final authorized boundary.

## 3. Prompt injection and untrusted data

Repository files, issue text, model messages, search results, web pages, generated patches, and tool output are untrusted content.

Required defenses include:

- explicit origin and content-type metadata;
- separation between instructions and quoted evidence;
- capability enforcement outside prompts;
- no tool authority inferred from retrieved content;
- bounded payloads and schema validation;
- public retrievers without shell, repository-write, or credential access;
- testing with indirect and cross-agent injection fixtures.

Origin tagging is useful defense-in-depth, not a sufficient defense on its own.

## 4. Data classification and routing

Before an external call, payload elements are classified:

- **Public:** intentionally public and safe to disclose.
- **Internal:** repository or workspace content not approved for public disclosure.
- **Confidential:** source code, unpublished plans, private communications, customer/business data.
- **Secret:** credentials, tokens, private keys, recovery codes, or equivalent authentication material.
- **Personal/sensitive:** personal data or regulated categories.

Default rules:

- Secret data MUST NOT enter model or web payloads.
- Confidential/internal data stays local unless a named provider, purpose, fields, retention assumption, and approval are present.
- Project factual claims use local project evidence.
- Public search receives the minimum public-safe atomic claim, not full task context.
- A boolean `publicSafe` flag is a human assertion, not sanitization.
- Logs store redacted references where raw content is unnecessary.

## 5. Provider governance

Each provider configuration records endpoint, data classes allowed, model/version, retention/training assumptions where known, region if relevant, rate/cost limits, and verification date. Unknown terms lead to conservative routing.

Local inference reduces external disclosure but does not remove model, package, supply-chain, resource-exhaustion, or local-server security risks.

Jev and Laya are research candidates only. Their typed outputs and probabilities do not prove correctness, calibration, privacy, or fitness for Roundtable.

## 6. Budget governance

Budgets are enforced at call, stage, task, day/workspace, and provider levels where practical. Estimates include prompt, output, retries, review, retrieval/search, and expected fallback costs.

The UI distinguishes:

- estimated cost;
- locally reserved allowance;
- observed token usage;
- provider-reported or billed cost when available;
- unpriced local compute;
- uncertainty/variance.

A local preflight reservation MUST NOT be called a hard billing cap unless the provider enforces the same cap.

## 7. Approval integrity

An approval binds to a content hash or immutable revision of the plan/artifact, requested capabilities, provider destinations, budget, and expiry. Material changes invalidate it. The system records who approved, when, and what exactly was approved.

Approval fatigue is treated as a safety failure. Low-risk reversible operations should be covered by narrow pre-authorization; high-impact checkpoints must remain specific and comprehensible.

## 8. Supply chain and installation

Plugin packages run with meaningful host access. Releases should eventually require pinned dependencies, lockfiles, secret scanning, license inventory, reproducible build evidence where feasible, signed artifacts/provenance, and rollback instructions.

DeepSeek Harness is a moving dependency. Roundtable support is stated for tested revisions, not inferred indefinitely from one inspected commit.

## 9. Failure policy

- Timeout or provider failure: retry only within policy, then fall back or mark degraded.
- Analyzer failure/partial coverage: gate remains unknown or failed, never clean.
- Budget exhaustion: pause or use a predeclared cheaper path; never exceed silently.
- Store corruption: stop mutations, preserve evidence, offer recovery; do not rebuild silently from partial data.
- Policy service failure: fail closed for side effects and protected data.
- UI disconnect: host-side operation follows the last valid policy and cancellation contract; approval-required transitions remain blocked.

## 10. Threat-model acceptance

Before beta, tests must cover credential leakage, path traversal and symlinks, malicious repository instructions, cross-agent prompt infection, duplicate side effects after retry, stale approvals, tampered event data, public-search privacy leakage, analyzer spoofing/malformed output, denial of service through files or model loops, and unsafe fallback after provider failure.