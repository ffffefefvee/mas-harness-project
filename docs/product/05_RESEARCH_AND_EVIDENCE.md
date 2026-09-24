# Research basis and corrected claims

## 1. Evidence policy

Roundtable separates four evidence levels:

1. **Primary external evidence:** papers, standards, or upstream documentation.
2. **Repository evidence:** executable tests, source inspection, or reproducible local experiments.
3. **Runtime evidence:** observations against pinned external runtimes/providers.
4. **Hypothesis:** plausible design awaiting a declared test.

A source supporting a mechanism in another setting does not prove that it improves Roundtable. Vendor benchmarks are leads, not acceptance evidence.

## 2. Findings that shape the architecture

### Multi-agent failures are often architectural

The MAST work reports a dataset of 1,600+ annotated traces across seven multi-agent frameworks and organizes failures around system design, inter-agent misalignment, and task verification. This supports prioritizing contracts, handoffs, and verification before elaborate agent debate. It does not prove any Roundtable architecture is correct.

Primary source: [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657)

### Debate should be conditional, if used

DOWN reports that confidence-gated debate can reduce computation on its evaluated reasoning benchmarks. Roundtable adopts only the research question: can a bounded escalation policy beat simpler baselines on our tasks? Model confidence is not trusted as a safety signal and cannot lower deterministic floors.

Primary source: [Debate Only When Necessary](https://arxiv.org/abs/2504.05047)

### Heterogeneous aggregation can help on some benchmarks

Mixture-of-Agents demonstrates gains from aggregating outputs of multiple models on evaluated language benchmarks. This motivates testing complementary reviewers. It does not show that vendor diversity guarantees independence, that role-playing improves software work, or that extra cost is justified.

Primary source: [Mixture-of-Agents Enhances Large Language Model Capabilities](https://arxiv.org/abs/2406.04692)

### Cross-agent prompt injection is a distinct risk

Prompt Infection demonstrates self-propagating LLM-to-LLM prompt injection and evaluates tagging among defenses. Roundtable therefore treats peer messages as untrusted data and enforces permissions outside prompts. Tagging alone is not considered sufficient.

Primary source: [Prompt Infection](https://arxiv.org/abs/2410.07283)

### Standardized telemetry is preferable to bespoke traces

OpenTelemetry maintains GenAI semantic conventions, including agent/framework spans. Roundtable should align with stable conventions while keeping sensitive content capture opt-in.

Primary source: [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

### Harness is architecturally suitable but compatibility must be measured

Upstream DeepSeek Harness describes an everything-is-a-plugin Cordis architecture with services, typed events, and reversible effects. Repository inspection supports an out-of-tree plugin approach. The local spike has not yet been executed against the pinned Harness runtime in this project.

Primary sources: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and its [architecture document](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)

## 3. Repository evidence available now

- Scanner unit tests exercise seed rules, redaction, stable fingerprints, finding lifecycle, and claim routing.
- The feasibility package matches inspected plugin and lifecycle shapes at the pinned upstream commit.
- The Jev/Laya harness validates request/response plumbing, fallback, loopback restriction, and deterministic safety floors with mocks/synthetic fixtures.
- Root Python prototypes demonstrate selected concepts such as circuit breaking, event replay, tie-breaking, and permission intersection.

These results do not establish production reliability, DSH runtime compatibility, model quality, real privacy, or the benefit of Team mode.

## 4. Corrected or withdrawn claims from historical material

### “Nothing leaves the machine”

Withdrawn. External model and search calls transfer selected payloads. The correct promise is local-first storage plus explicit provider/data policy.

### “No money is spent before approvals”

Withdrawn as a universal statement. Producing a model-generated route, team proposal, or plan can itself cost money. The correct requirement is cost visibility and authorization before material spend or execution, with free deterministic preflight where possible.

### Subset arithmetic

For 20 binary membership decisions, the space is `2^20 = 1,048,576`, not 32,768. Roundtable does not need exhaustive subset search for ordinary role relevance; it uses explicit role criteria and bounded team size.

### Parallel-round latency

Parallel calls within one round reduce that round's fan-out latency. Five causally dependent rounds still require approximately five sequential round latencies, not one.

### Independent review has no collapse mode

Withdrawn. Independent reviewers can share blind spots, be manipulated by common evidence, fail calibration, or agree incorrectly. Independence is a design goal measured by error detection and correlation, not a guarantee.

### Confidence is a safe debate trigger

Not accepted. Model confidence may be miscalibrated. Confidence can be evaluated as one advisory feature, but deterministic task risk and explicit uncertainty remain policy inputs.

### Team diversity proves quality

Not accepted. Different vendors or roles can still produce correlated errors. Diversity metrics are diagnostic experiments and cannot authorize or block work without evidence.

## 5. Jev and Laya

Jev exposes typed decisions through TypeSafe's System One API; Laya is published as a local model with related decision-oriented claims. They are attractive router candidates because the output space can be bounded. Current repository work made no live calls and contains only six synthetic cases deliberately aligned with rules.

Primary sources: [Jev API](https://docs.typesafe.ai/api), [Jev models](https://docs.typesafe.ai/models), and [Laya model card](https://huggingface.co/convaiinnovations/laya).

Required conclusion today: keep deterministic routing. Consider either model only after matched, held-out, privacy-reviewed evaluation.

## 6. Open research questions

- Does Reviewed reduce escaped defects enough to justify its latency and cost?
- Which task signals predict the value of review or Team mode?
- Are model probabilities calibrated on bilingual software tasks?
- Does a second model add information after deterministic checks?
- Which reviewer/worker pairings have complementary error patterns?
- Can claim checking reduce material factual errors without leaking project context?
- What dispute format, if any, beats a single structured review?
- Can reliable stopping be defined from artifact convergence rather than stated confidence?
- What local resource cost makes Laya preferable or inferior to rules/Jev?
- How much operational complexity does Harness integration add across releases?

Answers must come from predeclared evaluations, not from adding more persuasive prose.