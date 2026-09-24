// Task corpus loading and validation. A task directory contains:
//   task.json            metadata + labels (schema in evaluation/README.md)
//   repo/                fixture repository handed to an arm (the only thing an arm sees)
//   acceptance/*.mjs     hidden acceptance tests, copied in only at grading time
//   reference/           oracle solution: files overlaid onto repo/ (never shown to arms)
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TASKS_DIR = fileURLToPath(new URL('../tasks/', import.meta.url))
export const TASK_CLASSES = new Set(['easy', 'medium', 'multi-component', 'security-sensitive', 'ambiguous-spec'])
export const MODES = ['deterministic', 'direct', 'reviewed', 'team']

export async function readTree(root) {
  const files = {}
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files[relative(root, path).replaceAll('\\', '/')] = await readFile(path, 'utf8')
    }
  }
  await visit(root)
  return files
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export function validateTaskMetadata(meta, directoryName) {
  const problems = []
  const need = (condition, message) => { if (!condition) problems.push(message) }
  need(meta.schemaVersion === '0.1', 'schemaVersion must be 0.1')
  need(meta.id === directoryName, `id ${meta.id} must equal directory name ${directoryName}`)
  need(typeof meta.title === 'string' && meta.title, 'title required')
  need(TASK_CLASSES.has(meta.class), `class must be one of ${[...TASK_CLASSES].join(', ')}`)
  need(typeof meta.instruction === 'string' && meta.instruction.length >= 40, 'instruction required (>= 40 chars)')
  const labels = meta.labels ?? {}
  need(MODES.includes(labels.minimumSafeMode), `labels.minimumSafeMode must be one of ${MODES.join(', ')}`)
  need(['low', 'medium', 'high'].includes(labels.impact), 'labels.impact must be low|medium|high')
  need(typeof labels.reversible === 'boolean', 'labels.reversible required')
  need(typeof labels.securitySensitive === 'boolean', 'labels.securitySensitive required')
  need(Array.isArray(labels.acceptanceCriteria) && labels.acceptanceCriteria.length > 0, 'labels.acceptanceCriteria required')
  need(Array.isArray(labels.materialDefectsInFixture) && labels.materialDefectsInFixture.length > 0, 'labels.materialDefectsInFixture required')
  need(Array.isArray(labels.allowedDataDestinations), 'labels.allowedDataDestinations required')
  need(Array.isArray(labels.requiredApprovals), 'labels.requiredApprovals required')
  need(typeof labels.labeler === 'string', 'labels.labeler required')
  if (meta.class === 'security-sensitive') need(labels.securitySensitive === true, 'security-sensitive class requires securitySensitive=true')
  if (labels.securitySensitive) need(labels.minimumSafeMode !== 'direct' && labels.minimumSafeMode !== 'deterministic', 'security-sensitive tasks need minimumSafeMode >= reviewed')
  need(Number.isInteger(meta.timeoutMs ?? 10_000) && (meta.timeoutMs ?? 10_000) > 0, 'timeoutMs must be a positive integer')
  return problems
}

export async function loadTask(id, tasksDir = TASKS_DIR) {
  const dir = resolve(tasksDir, id)
  const meta = JSON.parse(await readFile(join(dir, 'task.json'), 'utf8'))
  const problems = validateTaskMetadata(meta, id)
  for (const part of ['repo', 'acceptance', 'reference']) {
    if (!(await exists(join(dir, part)))) problems.push(`missing ${part}/`)
  }
  if (problems.length) throw new Error(`invalid task ${id}: ${problems.join('; ')}`)
  const acceptance = await readTree(join(dir, 'acceptance'))
  if (!Object.keys(acceptance).some(path => path.endsWith('.mjs'))) throw new Error(`task ${id} has no acceptance .mjs files`)
  return {
    ...meta,
    timeoutMs: meta.timeoutMs ?? 10_000,
    dir,
    repoDir: join(dir, 'repo'),
    acceptanceDir: join(dir, 'acceptance'),
    referenceDir: join(dir, 'reference'),
  }
}

export async function listTaskIds(tasksDir = TASKS_DIR) {
  const entries = await readdir(tasksDir, { withFileTypes: true })
  return entries.filter(entry => entry.isDirectory() && /^t\d{2}-/.test(entry.name)).map(entry => entry.name).sort()
}

export async function loadAllTasks(tasksDir = TASKS_DIR) {
  return Promise.all((await listTaskIds(tasksDir)).map(id => loadTask(id, tasksDir)))
}

/** What an arm is allowed to see: instruction, class, visible repository files. Never labels or tests. */
export async function publicView(task) {
  return {
    id: task.id,
    title: task.title,
    class: task.class,
    instruction: task.instruction,
    files: await readTree(task.repoDir),
  }
}

/** Reference solution as a full-content patch (files overlaid onto the fixture). */
export async function referencePatch(task) {
  return { type: 'files', files: await readTree(task.referenceDir) }
}
