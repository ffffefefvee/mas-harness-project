import { watch } from 'node:fs'
import { resolve } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { scanWorkspace } from './lib/scanner.js'

export const name = 'roundtable-code-health'

export const Config = Schema.object({
  root: Schema.string().default(process.cwd()),
  ledgerPath: Schema.string().default('.roundtable/findings.json'),
  debounceMs: Schema.number().min(50).max(5000).step(1).default(250),
  maxFileBytes: Schema.number().min(1024).max(10_000_000).step(1).default(1_000_000),
  watch: Schema.boolean().default(true),
})

function report(result) {
  const open = result.findings.filter(finding => finding.status !== 'fixed')
  const newCount = open.filter(finding => finding.baselineStatus === 'new' || finding.baselineStatus === 'worsened').length
  console.log(`[roundtable-code-health] ${open.length} open findings (${newCount} new/regressed); ${result.coverage.scannedFiles} files scanned`)
}

export function apply(ctx, config) {
  ctx.effect(() => {
    const root = resolve(config.root)
    let timer
    let closed = false
    let active = Promise.resolve()

    const requestScan = () => {
      if (closed) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        active = active
          .then(() => scanWorkspace(config))
          .then(report)
          .catch(error => console.error('[roundtable-code-health] scan failed', error))
      }, config.debounceMs)
    }

    requestScan()
    const watcher = config.watch
      ? watch(root, { recursive: true }, (_event, filename) => {
          if (!filename || String(filename).includes('.roundtable')) return
          requestScan()
        })
      : undefined

    return async () => {
      closed = true
      clearTimeout(timer)
      watcher?.close()
      await active
    }
  }, 'roundtable code-health lifecycle')
}

export { scanWorkspace } from './lib/scanner.js'
export { classifyClaim, claimCheckDecision } from './lib/claim-critic.js'
