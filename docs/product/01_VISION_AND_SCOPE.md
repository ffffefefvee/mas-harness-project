# Vision, scope, and product principles

## 1. Vision

Roundtable should let a developer hand an engineering task to a controlled AI workflow that can plan, implement, inspect, and explain its work without turning models into security principals or pretending that more agents automatically produce better results.

The product is a local-first extension of DeepSeek Harness. It uses Harness for plugin lifecycle, model and tool integration, sessions, and the Web UI where those contracts are verified. Roundtable adds policy-driven task routing, continuous code intelligence, independent review, selective claim verification, durable evidence, and optional bounded team execution.

## 2. Problem

Single-agent workflows are inexpensive and understandable but can miss errors and unsupported claims. Multi-agent workflows can add independent perspectives, but they also multiply cost, latency, coordination failures, prompt-injection paths, and false confidence. Static analysis and tests catch many defects more reliably than another model, but they do not plan or implement changes.

Roundtable combines these approaches rather than selecting one universally:

1. deterministic tools establish cheap evidence;
2. one model performs ordinary work;
3. independent review is added when risk or uncertainty warrants it;
4. a team is used only for high-impact tasks or experiments that have earned the cost;
5. the human controls consequential transitions.

## 3. Target users

Primary users are solo developers and small engineering teams working in a local repository who want stronger review and traceability than a single chat provides without operating a separate orchestration service.

The first release is not designed for unattended production operations, regulated approval workflows, public model benchmarking, or arbitrary non-software business automation.

## 4. Product outcomes

Roundtable succeeds when it:

- catches relevant defects earlier than the user's existing workflow;
- reduces unsupported factual claims in plans and final output;
- chooses the cheapest adequate execution mode;
- never silently lowers safety because a provider or model failed;
- makes cost, data movement, authority, and degradation understandable before commitment;
- preserves enough evidence to reconstruct what happened;
- allows the user to stop, override, or resume work without losing state;
- demonstrates measurable value over simpler baselines before enabling complex coordination by default.

## 5. Non-goals

Roundtable is not:

- a general-purpose autonomous employee;
- a guarantee of correct code or factual truth;
- an AI-authorship detector;
- a leaderboard declaring one model universally best;
- a system in which model confidence grants authority;
- a reason to send private source code to a public API;
- a replacement for compilers, tests, security tools, Git review, or human ownership;
- a separate cloud backend required to use the local product;
- a commitment to preserve every experimental mechanism from the original concept.

## 6. Product principles

### 6.1 Least capable sufficient workflow

Use Direct unless independent review is justified. Use Reviewed unless Team is justified. Escalation should be based on risk and evidence, not spectacle.

### 6.2 Deterministic policy, probabilistic advice

Models may propose. Deterministic policy decides whether an action is permitted. Humans approve irreversible or externally consequential operations.

### 6.3 Evidence before rhetoric

Tests, diagnostics, source references, diffs, and reproducible commands outrank confident prose. A persuasive model statement is not evidence by itself.

### 6.4 Local-first, not local-only

Keys, configuration, durable state, and private evidence remain local by default. External model calls are explicit data transfers to named providers and must follow a payload policy. “Local-first” MUST NOT be described as “nothing leaves the machine.”

### 6.5 Nothing silently clean

A failed, timed-out, partial, stale, skipped, or budget-blocked check cannot be rendered as passed. Unknown is a first-class outcome.

### 6.6 Reversible before expensive or irreversible

Plans, team composition, provider payloads, budgets, and requested capabilities should be inspectable before the step that commits money, data, or irreversible change.

### 6.7 Experiments do not inherit authority

A promising paper, synthetic result, or offline harness may justify a trial. It does not justify production authority.

## 7. User experience

The intended interface is integrated into the Harness Web UI once its extension contract is runtime-verified. The experience should contain:

- task mode and rationale;
- data-destination and budget preview;
- current plan and acceptance criteria;
- active worker/reviewer roles without anthropomorphic status claims;
- live diagnostics and verification state;
- approvals only where consequential;
- collapsed technical traces with expandable evidence;
- final patch/output, unresolved risks, checks performed, cost, and provenance.

The UI should optimize for understanding and intervention, not for simulating a busy team chat.

## 8. Definition of the future product

A production-capable Roundtable is reached only when the Harness lifecycle is verified, the deterministic kernel is durable, Direct and Reviewed modes pass their acceptance gates, data and capability policies are enforced, and observed traces justify any Team mechanism enabled by default. A repository full of plans or a runnable spike is not the product.