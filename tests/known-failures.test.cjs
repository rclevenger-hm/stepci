// Characterization tests intentionally assert existing defects. These are NOT
// passing acceptance tests for phase two. Replace each with the desired contract
// when fixing it; a behavior change must make this suite fail until reviewed.
const assert = require('node:assert/strict')
const { test, before, after } = require('node:test')
const { startFixture, TOKEN } = require('./helpers/fixture.cjs')
const { runCLI, workflowFor, expectCode } = require('./helpers/cli.cjs')
let fixture
before(async () => { fixture = await startFixture() })
after(async () => { await fixture?.close() })

test('KNOWN BUG #259: a missing JSONPath value poisons two valid checks', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    check: 'status: 200\njsonpath:\n  $.name:\n    - eq: Widget\n  $.status:\n    - eq: healthy\n  $.items[*].category:\n    - in: Electronics'
  }))
  expectCode(result, 5)
  assert.match(result.output, /✕ JSONPath > \$\.name/)
  assert.match(result.output, /✕ JSONPath > \$\.status/)
  assert.match(result.output, /✕ JSONPath > \$\.items/)
})

test('KNOWN LEAK: verbose output prints a fake authorization secret', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/auth`, {
    extra: 'auth:\n  bearer:\n    token: ${{ secrets.token }}'
  }), ['--secret', `token=${TOKEN}`, '--verbose'])
  expectCode(result, 0)
  assert.ok(result.output.includes(TOKEN), 'Leak changed: replace this characterization with a redaction contract')
})

test('KNOWN LEAK: failure output prints a fake secret from the response', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/echo-secret`, { check: 'status: 201' }),
    ['--secret', `token=${TOKEN}`])
  expectCode(result, 5)
  assert.ok(result.output.includes(TOKEN), 'Leak changed: replace this characterization with a redaction contract')
})
