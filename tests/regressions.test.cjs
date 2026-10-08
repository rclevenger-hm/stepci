const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const { test, before, after } = require('node:test')
const { startFixture, TOKEN } = require('./helpers/fixture.cjs')
const { runCLI, workflowFor, expectCode } = require('./helpers/cli.cjs')
const requireCLI = createRequire(path.resolve(process.env.STEPCI_TEST_CLI || 'dist/index.js'))
const { checkResult } = requireCLI('@stepci/runner/dist/matcher')
let fixture
before(async () => { fixture = await startFixture() })
after(async () => { await fixture?.close() })

test('a missing JSONPath value fails independently and preserves both passing checks', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    check: 'status: 200\njsonpath:\n  $.name:\n    - eq: Widget\n  $.items[*].category:\n    - in: Electronics\n  $.status:\n    - eq: healthy'
  }), ['--verbose'])
  expectCode(result, 5)
  assert.match(result.output, /✔ JSONPath > \$\.name/)
  assert.match(result.output, /✕ JSONPath > \$\.items/)
  assert.match(result.output, /✔ JSONPath > \$\.status/)
  assert.match(result.output, /✔ Status/)
})

test('membership and negative matcher contracts handle missing, null, empty and wrong types', () => {
  for (const value of [undefined, null, [], {}, 42, false]) {
    assert.equal(checkResult(value, [{ in: 'x' }]).passed, false)
    assert.equal(checkResult(value, [{ nin: 'x' }]).passed, true)
  }
  assert.equal(checkResult(['x'], [{ in: 'x' }]).passed, true)
  assert.equal(checkResult(['x'], [{ nin: 'x' }]).passed, false)
  assert.equal(checkResult('text', [{ in: 'ex' }]).passed, true)
  assert.equal(checkResult(undefined, [{ ne: 'x' }]).passed, true)
  assert.equal(checkResult(undefined, [{ isDefined: true }, { nin: 'x' }]).passed, false)
  assert.equal(checkResult(null, [{ isNull: true }]).passed, true)
  assert.equal(checkResult(undefined, [{ isDefined: false }]).passed, true)
  assert.equal(checkResult(undefined, [{ match: '.*' }]).passed, false)
  assert.equal(checkResult(null, [{ match: '.*' }]).passed, false)
  // Preserve the existing non-null regular-expression coercion contract.
  assert.equal(checkResult(42, [{ match: '^42$' }]).passed, true)
})

test('null and wrong-type JSON fields fail only their own membership checks', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    check: 'jsonpath:\n  $.nullable:\n    - in: x\n  $.count:\n    - in: x\n  $.object:\n    - in: x\n  $.flag:\n    - eq: false\n  $.status:\n    - eq: healthy'
  }), ['--verbose'])
  expectCode(result, 5)
  for (const key of ['nullable', 'count', 'object']) assert.ok(result.output.includes(`✕ JSONPath > $.${key}`))
  for (const key of ['flag', 'status']) assert.ok(result.output.includes(`✔ JSONPath > $.${key}`))
})

test('invalid JSONPath and regex expressions preserve unrelated results', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    check: 'jsonpath:\n  "$.numbers[?(@. > 1)]":\n    - isDefined: true\n  $.name:\n    - match: "["\n  $.status:\n    - eq: healthy'
  }), ['--verbose'])
  expectCode(result, 5)
  assert.match(result.output, /✕ JSONPath > \$\.numbers/)
  assert.match(result.output, /✕ JSONPath > \$\.name/)
  assert.match(result.output, /✔ JSONPath > \$\.status/)
})

test('invalid response JSON fails JSONPath checks while preserving the status result', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/bad-json`, {
    check: 'status: 200\njsonpath:\n  $.name:\n    - isDefined: true'
  }), ['--verbose'])
  expectCode(result, 5)
  assert.match(result.output, /✕ JSONPath > \$\.name/)
  assert.match(result.output, /✔ Status/)
})

for (const verbose of [false, true]) {
  test(`authorization and response secrets are redacted with verbose=${verbose}`, async () => {
    const result = await runCLI(workflowFor(`${fixture.url}/echo-secret`, {
      extra: 'auth:\n  bearer:\n    token: ${{ secrets.token }}', check: 'status: 201'
    }), ['--secret', `token=${TOKEN}`, ...(verbose ? ['--verbose'] : [])])
    expectCode(result, 5)
    assert.ok(!result.output.includes(TOKEN), result.output)
    assert.match(result.output, /\[REDACTED\]/)
    assert.match(result.output, /Given\s+200/)
  })
}

test('literal authorization is redacted without a --secret argument', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/auth`, {
    extra: `headers:\n  Authorization: Bearer ${TOKEN}`
  }), ['--verbose'])
  expectCode(result, 0)
  assert.ok(!result.output.includes(TOKEN), result.output)
  assert.match(result.output, /\[REDACTED\]/)
})

test('workflow parsing errors cannot expose supplied secrets', async () => {
  const result = await runCLI(`version: "1.1"\nname: ${TOKEN}\ntests: [${TOKEN}\n`,
    ['--secret', `token=${TOKEN}`])
  expectCode(result, 1)
  assert.ok(!result.output.includes(TOKEN), result.output)
  assert.match(result.output, /YAMLException/)
  const inline = await runCLI(`version: "1.1"\npassword: ${TOKEN}\ntests: [${TOKEN}\n`)
  expectCode(inline, 1)
  assert.ok(!inline.output.includes(TOKEN), inline.output)
  assert.match(inline.output, /YAMLException: Invalid YAML at line/)
})

test('encoded secrets in failed request URLs are redacted', async () => {
  const secret = 'fixture secret "quoted" & private'
  const result = await runCLI(workflowFor(`${fixture.url}/${encodeURIComponent(secret)}`),
    ['--secret', `token=${secret}`, '--verbose'])
  expectCode(result, 5)
  assert.ok(!result.output.includes(secret), result.output)
  assert.ok(!result.output.includes(encodeURIComponent(secret)), result.output)
})

test('the default CLI creates no analytics identity and makes no external connection', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`))
  expectCode(result, 0)
  assert.doesNotMatch(result.output, /Anonymous usage|PostHog|analytics/i)
  assert.deepEqual(result.files, ['workflow with spaces.yml'])
})

test('environment secrets work and are redacted; malformed secret JSON fails safely', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/auth`, {
    extra: 'auth:\n  bearer:\n    token: ${{ secrets.token }}'
  }), ['--verbose'], { env: { STEPCI_SECRETS: JSON.stringify({ token: TOKEN }) } })
  expectCode(result, 0)
  assert.ok(!result.output.includes(TOKEN))
  const invalid = await runCLI(workflowFor(`${fixture.url}/health`), [],
    { env: { STEPCI_SECRETS: `{"token":"${TOKEN}` } })
  expectCode(invalid, 1)
  assert.ok(!invalid.output.includes(TOKEN))
})

test('empty and malformed workflow structures fail clearly', async () => {
  for (const workflow of ['null', '[]', 'version: "1.1"\ntests: {}', 'tests:\n  example:\n    steps: []']) {
    const result = await runCLI(workflow)
    expectCode(result, 1)
    assert.match(result.output, /Invalid workflow/)
    assert.doesNotMatch(result.output, /TypeError|Workflow passed/)
  }
})
