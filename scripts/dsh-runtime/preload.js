// Loaded through NODE_OPTIONS=--import by scripts/dsh-runtime/check.js.
// `beforeExit` fires only when the event loop drains naturally, so its
// presence proves that no handle kept the process alive after disposal.
import { appendFileSync } from 'node:fs'

const logPath = process.env.RT_PROBE_LOG
const log = (event, extra = {}) => {
  if (!logPath) return
  appendFileSync(logPath, `${JSON.stringify({ t: Date.now(), event, ...extra })}\n`)
}

log('preload', { pid: process.pid })

// Record who terminates the process explicitly (vs. a natural event-loop drain).
const originalExit = process.exit.bind(process)
process.exit = code => {
  log('process.exit', {
    code,
    resources: process.getActiveResourcesInfo(),
    stack: new Error('process.exit').stack.split('\n').slice(2, 8).map(line => line.trim()),
  })
  return originalExit(code)
}
process.on('beforeExit', code => log('beforeExit', { code, resources: process.getActiveResourcesInfo() }))
process.on('exit', code => log('exit', { code, resources: process.getActiveResourcesInfo() }))
