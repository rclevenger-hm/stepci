const assert = require('node:assert/strict')
const { test, before, after } = require('node:test')
const net = require('node:net')
const { once } = require('node:events')
const { startFixture, TOKEN } = require('./helpers/fixture.cjs')
const { runCLI, workflowFor, expectCode } = require('./helpers/cli.cjs')
let fixture
before(async () => { fixture = await startFixture() })
after(async () => { await fixture?.close() })

test('built CLI passes HTTP and JSONPath checks from a path containing spaces', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    check: 'status: 200\njsonpath:\n  $.status:\n    - eq: healthy'
  }))
  expectCode(result, 0)
  assert.match(result.output, /1 passed, 1 total/)
  assert.match(result.output, /Workflow passed/)
  assert.doesNotMatch(result.output, /Anonymous usage data collected/)
  assert.ok(fixture.requests.some(request => request.url === '/health'))
})

test('deliberately broken deployment exits 5 with expected and actual status', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/broken`))
  expectCode(result, 5)
  assert.match(result.output, /Workflow failed/)
  assert.match(result.output, /Expected\s+200/)
  assert.match(result.output, /Given\s+503/)
})

test('incorrect JSON value exits 5 and identifies the expression', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    check: 'jsonpath:\n  $.status:\n    - eq: broken'
  }))
  expectCode(result, 5)
  assert.match(result.output, /✕ JSONPath > \$\.status/)
  assert.match(result.output, /healthy/)
})

test('bearer authentication works with an explicitly fake secret', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/auth`, {
    extra: 'auth:\n  bearer:\n    token: ${{ secrets.token }}'
  }), ['--secret', `token=${TOKEN}`])
  expectCode(result, 0)
  assert.equal(fixture.requests.at(-1).authorization, `Bearer ${TOKEN}`)
  assert.doesNotMatch(result.output, new RegExp(TOKEN))
})

test('missing authentication fails the deployment gate', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/auth`))
  expectCode(result, 5)
  assert.match(result.output, /Given\s+401/)
})

test('malformed YAML exits 1', async () => {
  const result = await runCLI('version: "1.1"\ntests: [\n')
  expectCode(result, 1)
  assert.match(result.output, /YAMLException/)
  assert.doesNotMatch(result.output, /Workflow passed/)
})

test('workflow missing tests exits 1 with a useful validation error', async () => {
  const result = await runCLI('version: "1.1"\nname: Invalid\n')
  expectCode(result, 1)
  assert.match(result.output, /Invalid workflow: tests must be a non-empty mapping/)
  assert.doesNotMatch(result.output, /TypeError|node_modules/)
})

test('missing workflow file exits 1', async () => {
  const result = await runCLI(null)
  expectCode(result, 1)
  assert.match(result.output, /ENOENT/)
})

test('malformed CLI environment option exits 1', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`), ['--env', 'invalid'])
  expectCode(result, 1)
  assert.match(result.output, /env variables have wrong format/)
})

test('connection refusal exits 5 and reports ECONNREFUSED', async () => {
  const reservation = net.createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const result = await runCLI(workflowFor(`http://127.0.0.1:${port}/health`))
  expectCode(result, 5)
  assert.match(result.output, /ECONNREFUSED/)
})

test('peer disconnect exits 5', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/disconnect`))
  expectCode(result, 5)
  assert.match(result.output, /socket hang up|ECONNRESET/)
})

test('a server that never responds is bounded by the workflow timeout', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/slow`, { timeout: '300ms' }))
  expectCode(result, 5)
  assert.match(result.output, /Timeout|timed out/i)
})
