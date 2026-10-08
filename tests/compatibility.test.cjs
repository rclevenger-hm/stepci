const assert = require('node:assert/strict')
const { test, before, after } = require('node:test')
const { createRequire } = require('node:module')
const path = require('node:path')
const { startFixture } = require('./helpers/fixture.cjs')
const { runCLI, workflowFor, expectCode } = require('./helpers/cli.cjs')
const requireCLI = createRequire(path.resolve(process.env.STEPCI_TEST_CLI || 'dist/index.js'))
let fixture
before(async () => { fixture = await startFixture() })
after(async () => { await fixture?.close() })

test('the packaged OpenAPI generator resolves local schemas and emits an executable workflow', async () => {
  const spec = { openapi: '3.0.0', info: { title: 'Local fixture', version: '1.0' },
    servers: [{ url: fixture.url }], components: { schemas: { Health: {
      type: 'object', properties: { status: { type: 'string', enum: ['healthy'] } }, required: ['status']
    } } }, paths: { '/health': { get: { responses: { 200: { description: 'healthy', content: {
      'application/json': { schema: { $ref: '#/components/schemas/Health' } }
    } } } } } } }
  const generated = await runCLI(JSON.stringify(spec), ['generated.yml'],
    { command: 'generate', mode: 'cli', readFile: 'generated.yml' })
  expectCode(generated, 0)
  const result = await runCLI(generated.file, [], { mode: 'cli' })
  expectCode(result, 0)
})

test('updated schema faker supports generation and asynchronous reference resolution', async () => {
  const faker = requireCLI('json-schema-faker')
  const schema = { type: 'object', properties: { answer: { type: 'integer', minimum: 42, maximum: 42 } }, required: ['answer'] }
  assert.equal(faker.generate(schema).answer, 42)
  assert.equal((await faker.resolve(schema)).answer, 42)
})

test('the maintained Faker API still works through workflow templates', async () => {
  const result = await runCLI(workflowFor(`${fixture.url}/health`, {
    extra: 'headers:\n  X-Fixture-Name: ${{ person.firstName | fake }}'
  }))
  expectCode(result, 0)
})

test('redaction produces safe JSON report values without mutating check inputs', () => {
  const { Redactor } = requireCLI(path.resolve(process.env.STEPCI_TEST_CLI || 'dist/index.js', '../lib/redact.js'))
  const redactor = new Redactor()
  const secret = 'report-fixture-secret'
  redactor.add(secret)
  const original = { given: secret, request: { headers: { Authorization: `Bearer ${secret}` } },
    response: Buffer.from(secret), error: new Error(`failed with ${secret}`) }
  const report = JSON.stringify(redactor.value(original))
  assert.ok(!report.includes(secret), report)
  assert.equal(original.given, secret)
  assert.equal(original.response.toString(), secret)
  assert.match(report, /REDACTED/)
})
