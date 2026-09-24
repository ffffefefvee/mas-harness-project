// Corpus validation: every task's reference solution passes its hidden acceptance tests, and
// the untouched fixture (empty patch) fails them. A task that fails either check cannot
// discriminate between arms and must not be used.
import assert from 'node:assert/strict'
import test from 'node:test'
import { gradePatch } from '../src/grader.mjs'
import { MODES, TASK_CLASSES, loadAllTasks, publicView, referencePatch } from '../src/tasks.mjs'

const tasks = await loadAllTasks()

test('corpus has 12-20 tasks covering every declared class', () => {
  assert.ok(tasks.length >= 12 && tasks.length <= 20, `${tasks.length} tasks`)
  const classes = new Set(tasks.map(task => task.class))
  for (const taskClass of TASK_CLASSES) assert.ok(classes.has(taskClass), `no task of class ${taskClass}`)
  for (const task of tasks) assert.ok(MODES.includes(task.labels.minimumSafeMode))
})

test('public view never exposes labels, acceptance tests or the reference', async () => {
  for (const task of tasks) {
    const view = await publicView(task)
    assert.deepEqual(Object.keys(view).sort(), ['class', 'files', 'id', 'instruction', 'title'])
    assert.ok(Object.keys(view.files).every(path => !path.startsWith('acceptance') && !path.startsWith('reference')))
  }
})

for (const task of tasks) {
  test(`${task.id}: reference passes and the empty patch fails`, async () => {
    const [reference, empty] = await Promise.all([gradePatch(task, await referencePatch(task)), gradePatch(task, null)])
    assert.equal(reference.pass, true, `reference failed:\n${reference.output}`)
    assert.equal(reference.outcome, 'pass')
    assert.ok(reference.changedLines > 0)
    assert.equal(empty.pass, false)
    assert.equal(empty.outcome, 'tests-failed')
    assert.equal(empty.changedLines, 0)
  })
}
