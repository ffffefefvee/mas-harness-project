# Code-health ground-truth corpus

Labelled snippets for measuring the deterministic analyzer (`lib/analyzers.js`) rule by rule.

## Labelling rule

Labels encode the **intent** stated by each rule's message and name, not the analyzer's current
output. The labeller did not run the analyzer while writing labels; disagreements between label and
analyzer are the measurement.

| Rule | Intent used for labelling |
|---|---|
| `merge-conflict-marker` | An unresolved Git conflict marker line (`<<<<<<<`, `=======`, `>>>>>>>` at line start, optionally followed by text) in a source file. Markers inside string literals, template literals, comments or Markdown code blocks that *document* conflicts are not findings. A `=======` line that is a Markdown/reStructuredText heading underline is not a finding. |
| `empty-catch` | A `catch` clause whose block contains no statements **and no explanatory comment**, i.e. the error is discarded silently. `catch {}` (optional binding) counts. A block with a comment, a log call, a rethrow, or a return is not a finding. Promise `.catch(() => {})` discards errors too and is labelled a finding (the rule message says "catch block"; this is recorded as a deliberate reading, see `labelNote`). Text inside strings or comments is not a finding. |
| `not-implemented-stub` | Executable code that throws an explicit not-implemented/TODO/stub error. Such text in documentation strings, comments, test assertions (`assert.throws(..., /not implemented/)`) or error messages that are not thrown is not a finding. Custom error classes (`new NotImplementedError()`) and `throw Error('TODO')` without `new` count. |
| `unexplained-ts-ignore` | A `// @ts-ignore` or `/* @ts-ignore */` directive without an inline justification. `@ts-ignore -- reason` and `@ts-expect-error` (a different directive) are not findings. Mentions inside strings or prose are not findings. |
| `probable-hardcoded-secret` | A string literal that looks like a real credential assigned to a credential-named field/variable. Obvious placeholders (`xxxx…`, `changeme`, `<your-key>`, `${ENV}`), values read from the environment, and identifiers that merely contain the word (`tokenizer`, `secretaryName`) are not findings. Real-looking values in test files are still findings (they leak the same way). |

## File format

Each `cases/*.json` file is an array of cases:

```json
{ "id": "ec-001", "rule": "empty-catch", "path": "src/a.js", "source": "...", "expected": 1, "kind": "positive|negative-twin", "note": "why" }
```

- `expected` is the number of findings of `rule` a correct analyzer reports in `source`.
- A case contributes to exactly one rule; findings of other rules in the same snippet are ignored.
- `eol: "crlf"` converts `\n` to `\r\n` before scanning.
- Negative twins mirror a positive case with the property that should suppress the finding.

Counting: per case, TP = min(expected, found), FP = max(0, found - expected),
FN = max(0, expected - found). Precision = TP/(TP+FP), recall = TP/(TP+FN), each with a Wilson 95%
interval. Snippets are synthetic, written by one author (`labeler: single-author-unadjudicated`).
