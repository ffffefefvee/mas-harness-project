# Roundtable canonical product specification

**Status:** authoritative design baseline  
**Baseline date:** 2026-09-24  
**Implementation maturity:** research / feasibility  
**Host target:** DeepSeek Harness, subject to pinned-runtime validation

## How to read this set

- `MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative.
- **Planned** describes intended product behavior not yet implemented.
- **Implemented** means code exists in this repository; it does not imply production readiness.
- **Runtime-verified** requires execution against the named external runtime, not source inspection alone.
- **Experimental** means disabled by default and without product authority until its evaluation gate passes.
- **Historical** means retained for provenance but not authoritative.

## Documents

| File | Question answered |
|---|---|
| `01_VISION_AND_SCOPE.md` | What product are we building and why? |
| `02_REQUIREMENTS_AND_MODES.md` | What must the product do, and how do Direct/Reviewed/Team differ? |
| `03_ARCHITECTURE_AND_CONTRACTS.md` | What components, boundaries, events, and data contracts implement it? |
| `04_SAFETY_PRIVACY_AND_GOVERNANCE.md` | What can models never authorize, and how are data and cost controlled? |
| `05_RESEARCH_AND_EVIDENCE.md` | Which claims have external evidence, local evidence, or remain hypotheses? |
| `06_EVALUATION_AND_ACCEPTANCE.md` | How do mechanisms graduate from experiment to product? |
| `07_DELIVERY_ROADMAP.md` | What exists, what comes next, and what closes each stage? |
| `08_DECISION_REGISTER.md` | Which decisions are accepted, provisional, superseded, or rejected? |

## Authority order

1. This directory.
2. Machine-readable schemas and accepted architecture decision records that explicitly reference this baseline.
3. Current implementation and tests, for statements about what code actually does.
4. Feasibility and experiment reports.
5. Historical design documents.

A specification never overrides observed implementation behavior. If code and specification differ, record the discrepancy as a defect or an unimplemented requirement; do not silently describe one as the other.

## Completeness rule

A future feature is not considered described merely because it appears in prose. Its canonical description should include:

- user value and non-goals;
- inputs, outputs, and state transitions;
- authority and permission boundary;
- failure and degradation behavior;
- privacy and cost behavior;
- observability requirements;
- acceptance evidence;
- current implementation status.

## Change process

A normative change should update every affected requirement, contract, evaluation gate, roadmap item, and decision record in the same pull request. Claims based on external research should link a primary source and state what the source does **not** prove about Roundtable.