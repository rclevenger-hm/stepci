#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import fs from 'fs'
import { runFromFile, TestResult, WorkflowResult } from '@stepci/runner'
import { loadTestFromFile }  from '@stepci/runner/dist/loadtesting'
import { generateWorkflowFile, GenerateWorkflowOptions } from '@stepci/plugin-openapi'
import exit from 'exit'
import chalk from 'chalk'
import { EventEmitter } from 'node:events'
import { defaultText } from './lib/constants'
import { checkOptionalEnvArrayFormat, parseEnvArray } from './lib/utils'
import { renderStep, renderSummary, renderStepSummary, renderFeedbackMessage, renderLoadTest } from './lib/render'
import { Redactor, redactConsole } from './lib/redact'
import { inspectWorkflow } from './lib/workflow'

let verbose: boolean | undefined = false

const redactor = new Redactor()
redactor.arguments(hideBin(process.argv))
redactConsole(redactor)

function reportError(error: unknown) {
  if (error instanceof Error && error.name === 'YAMLException') {
    const mark = (error as any).mark
    const location = Number.isInteger(mark?.line) && Number.isInteger(mark?.column)
      ? ` at line ${mark.line + 1}, column ${mark.column + 1}` : ''
    // Parser excerpts may contain inline credentials that could not be parsed.
    console.error(`YAMLException: Invalid YAML${location}`)
  } else console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  exit(1)
}

process.on('unhandledRejection', reportError)

let environmentSecrets: Record<string, string> = {}
if (process.env.STEPCI_SECRETS) {
  try {
    const value = JSON.parse(process.env.STEPCI_SECRETS)
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.values(value).some(secret => typeof secret !== 'string')) throw new Error()
    environmentSecrets = value
    Object.values(value).forEach(secret => redactor.add(secret))
  } catch { reportError(new Error('Invalid STEPCI_SECRETS: expected a JSON object with string values')) }
}

const ee = new EventEmitter()
ee.on('step:http_request', request => redactor.collect(request.getHeaders?.() || {}))
ee.on('test:result', (test: TestResult) => {
  test = redactor.value(test)
  console.log(`${(test.passed ? chalk.bgGreenBright(' PASS ') : chalk.bgRedBright(' FAIL '))} ${chalk.bold(test.name || test.id)} ⏲ ${test.duration / 1000 + 's'} ${chalk.magenta('⬆')} ${test.bytesSent} bytes ${chalk.cyan('⬇')} ${test.bytesReceived} bytes`)
  if (!test.passed || verbose) {
    renderStepSummary(test.steps)
    test.steps.forEach(step => renderStep(step, { verbose }))
  }
})

ee.on('workflow:result', ({ result }: WorkflowResult) => {
  renderSummary(redactor.value(result))
  renderFeedbackMessage()
  if (!result.passed) exit(5)
})

yargs(hideBin(process.argv))
  .exitProcess(false)
  .fail((message, error) => { throw error || new Error(message) })
  .command('run [workflow]', 'run workflow', (yargs) => {
    return yargs
      .positional('workflow', {
        describe: 'workflow file path',
        type: 'string',
        default: 'workflow.yml'
      })
      .option('e', {
        alias: 'env',
        array: true,
        demandOption: false,
        describe: 'env variables to use',
        type: 'string'
      })
      .option('s', {
        alias: 'secret',
        array: true,
        demandOption: false,
        describe: 'secret variables to use',
        type: 'string'
      })
      .option('verbose', {
        alias: 'v',
        boolean: true,
        demandOption: false,
        describe: 'verbose output',
        type: 'boolean'
      })
      .option('loadtest', {
        alias: 'load',
        boolean: true,
        demandOption: false,
        describe: 'run workflow in load-testing mode',
        type: 'boolean'
      })
      .option('concurrency', {
        number: true,
        demandOption: false,
        describe: 'number of concurrency executions',
        type: 'number'
      })
      .check(({ e: envs, s: secrets }) => {
        if (checkOptionalEnvArrayFormat(envs)) {
          throw new Error('env variables have wrong format, use `env=VARIABLE`.')
        }

        if (checkOptionalEnvArrayFormat(secrets)) {
          throw new Error('secret variables have wrong format, use `secret=VARIABLE`.')
        }

        return true
      })
  }, async (argv) => {
    verbose = argv.verbose
    const secrets = { ...environmentSecrets, ...parseEnvArray(argv.s) }
    Object.values(secrets).forEach(secret => redactor.add(secret))
    redactor.collect(await inspectWorkflow(argv.workflow))

    if (argv.loadtest) {
      console.log(chalk.yellowBright(`⚠︎ Running a load test. This may take a while`))
      const { result } = await loadTestFromFile(argv.workflow, {
        env: parseEnvArray(argv.e),
        secrets
      })

      renderLoadTest(redactor.value(result))
      renderFeedbackMessage()
      if (!result.passed) exit(5)
      return
    }

    await runFromFile(argv.workflow, {
      env: parseEnvArray(argv.e),
      secrets,
      ee,
      concurrency: argv.concurrency
    })
  })
  .command('generate [spec] [path]', 'generate workflow from OpenAPI spec', yargs => {
    return yargs
      .positional('spec', {
        describe: 'openapi file url',
        type: 'string',
        default: 'openapi.json'
      })
      .positional('path', {
        describe: 'output file path',
        type: 'string',
        default: './workflow.yml'
      })
      .positional('generatePathParams', { type: 'boolean', default: true })
      .positional('generateOptionalParams', { type: 'boolean', default: true })
      .positional('generateRequestBody', { type: 'boolean', default: true })
      .positional('useExampleValues', { type: 'boolean', default: true })
      .positional('useDefaultValues', { type: 'boolean', default: true })
      .positional('checkStatus', { type: 'boolean', default: true })
      .positional('checkExamples', { type: 'boolean', default: true })
      .positional('checkSchema', { type: 'boolean', default: true })
      .positional('contentType', { type: 'string', default: 'application/json' })
  }, async (argv) => {
    const generateWorkflowConfig: GenerateWorkflowOptions = {
      generator: {
        pathParams: argv.generatePathParams,
        optionalParams: argv.generateOptionalParams,
        requestBody: argv.generateRequestBody,
        useExampleValues: argv.useExampleValues,
        useDefaultValues: argv.useDefaultValues,
      },
      check: {
        status: argv.checkStatus,
        examples: argv.checkExamples,
        schema: argv.checkSchema
      },
      contentType: argv.contentType
    }

    await generateWorkflowFile(argv.spec, argv.path, generateWorkflowConfig)
    console.log(`${chalk.greenBright('Success!')} The workflow file can be found at ${argv.path}`)
    renderFeedbackMessage()
  })
  .command('init', 'Init a Step CI workflow', yargs => {
    return yargs
      .positional('path', {
        describe: 'workflow file path',
        type: 'string',
        default: 'workflow.yml'
      })
    },
  (argv) => {
    const defaultWorkflow = `version: "1.1"
name: Status Check
env:
  host: example.com
tests:
  example:
    steps:
      - name: GET request
        http:
          url: https://\${{env.host}}
          method: GET
          check:
            status: /^20/`

    fs.writeFileSync(argv.path, defaultWorkflow)
    console.log(`${chalk.greenBright('Success!')} The workflow file can be found at ${argv.path}\nEnter ${chalk.grey('npx stepci run ' + argv.path)} to run it`)
  })
  .command(['$0'], false, () => {}, () => console.log(defaultText))
  .parseAsync()
  .catch(reportError)
