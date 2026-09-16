# Continuous Code Intelligence

## Purpose

Roundtable maintains an agent-independent, continuously updated issue inventory. It catches cheap, local, deterministic problems before an agent spends tokens rediscovering them and gives every agent the same current evidence base.

This subsystem is not an LLM agent and does not require agents to be active.

## Operating modes

1. **Watch:** debounced scans of changed files while the repository is open.
2. **Diff:** scans only files and ranges changed from the approved base commit.
3. **Full:** scheduled or manually requested repository scan.
4. **Gate:** required checks before an agent declares a step or task complete.
5. **Targeted:** runs a selected detector against an artifact referenced in a claim.

Watch mode must sleep when no tracked repository is open. It uses filesystem events where available and a bounded polling fallback.

## Analyzer pipeline

The scanner normalizes outputs from independent adapters:

- compiler and parser diagnostics;
- language-server diagnostics;
- formatter, linter, and type-checker results;
- configured unit/build/test commands;
- dependency and lockfile checks;
- secret and security scanners;
- AI-slop heuristics;
- repository-specific architecture rules.

Deterministic tools run before heuristic detectors. A slop score never overrides a compiler, test, security, or type-check result.

## AI-slop integration

AI-SLOP Detector, Sloppylint, and Slopscore demonstrate useful patterns: local/offline checks, changed-code review, structured JSON/SARIF output, baselines, watch mode, history, confidence labels, and separation from ordinary linters. Roundtable should integrate such tools through adapters rather than copy their marketing scores or treat any one scanner as authoritative.

Before bundling third-party code:

- pin a version and verify its license;
- run it in a constrained subprocess;
- validate its output schema;
- record tool version and configuration with each finding;
- measure false positives on our target repositories;
- keep it optional and replaceable.

Beta may support an external command adapter first. Native rules are added only for high-value findings not covered by established tools.

## Finding record

Each finding includes stable fingerprint, analyzer/version, rule ID, severity, confidence, category, path and range, message, evidence, suggested action, first/last seen commit, status, baseline status, and scan ID.

Statuses are `open`, `acknowledged`, `suppressed`, `fixed`, `stale`, and `unknown`. Suppression requires a reason and optional expiry.

## Baselines and deltas

Existing findings are baselined so adoption does not flood the user. New or worsened findings are prominent. Fixed findings remain in history. Fingerprints use rule, normalized path, symbol, and content context rather than line number alone.

## Storage and independence

Findings and scans live in the transactional EventStore/IssueStore, not in agent memory. The scanner runs as a supervised local service with its own health state. Agent crashes do not stop it. Scanner failures create visible health events and never silently mark code clean.

## Agent interface

Agents receive compact queries rather than the full issue database:

- findings affecting a planned step;
- new findings introduced by the current patch;
- unresolved critical/high findings;
- a targeted finding by fingerprint;
- trend and scan freshness.

An agent cannot suppress, downgrade, or close a finding merely by asserting it is wrong. Deterministic rescans or an explicit user action change status.

## UI

A single Problems panel shows current findings, new-versus-baseline status, source analyzer, scan freshness, and affected task. It supports filters and jump-to-file. It does not show one opaque global score as the primary result.

## Cost controls

Local deterministic scans are preferred and cached by content hash, analyzer version, and configuration fingerprint. Expensive tests and full scans are scheduled separately. LLM analysis is not part of the continuous loop.

## Non-claims

Static analysis cannot prove runtime correctness or determine whether code is AI-generated. “AI-slop” rules are risk heuristics for recurring generated-code defects, not authorship detectors.
