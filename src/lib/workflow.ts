import fs from 'node:fs/promises'
import { load } from 'js-yaml'

const mapping = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Validate the outer contract before the runner dereferences includes/$refs.
// Those references retain the runner's existing resolution behavior.
export async function inspectWorkflow(file: string): Promise<unknown> {
  const workflow: any = load(await fs.readFile(file, 'utf8'))
  const fail = (message: string): never => { throw new Error(`Invalid workflow: ${message}`) }
  if (!mapping(workflow)) fail('expected a YAML mapping')
  if (workflow.tests === undefined && Array.isArray(workflow.include) && workflow.include.length) return workflow
  if (!mapping(workflow.tests) || !Object.keys(workflow.tests).length) fail('tests must be a non-empty mapping')
  for (const [name, test] of Object.entries(workflow.tests) as [string, any][]) {
    if (!mapping(test)) fail(`test ${name} must be a mapping`)
    if (typeof test.$ref === 'string') continue
    if (!Array.isArray(test.steps) || !test.steps.length) fail(`test ${name} needs a non-empty steps array`)
    for (const step of test.steps) {
      if (!mapping(step)) fail(`test ${name} contains an invalid step`)
      if (step.http !== undefined && !mapping(step.http)) fail(`test ${name} has an invalid HTTP step`)
    }
  }
  return workflow
}
