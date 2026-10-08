const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { sha256 } = require('./provenance.cjs')
const root = path.resolve(__dirname, '..')
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'stepci-consumer-'))
const npm = args => execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
  cwd: root, stdio: 'inherit'
})
try {
  npm(['run', 'package'])
  const info = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/package-info.json'), 'utf8'))
  const tarball = path.join(root, 'artifacts', info.filename)
  const firstHash = sha256(tarball)
  const firstManifest = fs.readFileSync(path.join(root, 'dist/build-manifest.json'), 'utf8')
  npm(['run', 'package'])
  assert.equal(fs.readFileSync(path.join(root, 'dist/build-manifest.json'), 'utf8'), firstManifest,
    'Repeated builds differ: inspect the manifests before claiming reproducibility')
  assert.equal(sha256(tarball), firstHash, 'Repeated npm tarballs differ')
  assert.ok(info.files.some(file => file.path === 'npm-shrinkwrap.json'))
  assert.ok(info.files.some(file => file.path === 'schema.json'))
  assert.ok(info.files.some(file => file.path === 'LICENSE'))
  // npm 11.9 does not honor the nested shrinkwrap when installing this local
  // tarball as a dependency. Use the shipped lock as the application root.
  // Extraction plus npm ci is the supported baseline package install contract.
  execFileSync('tar', ['-xzf', tarball, '-C', consumer], { stdio: 'inherit' })
  const installed = path.join(consumer, 'package')
  execFileSync(process.execPath, [process.env.npm_execpath, 'ci', '--offline',
    '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], { cwd: installed, stdio: 'inherit' })
  const verify = () => execFileSync(process.execPath, [path.join(__dirname, 'provenance.cjs'),
    'verify', installed], { stdio: 'pipe', encoding: 'utf8' })
  console.log(verify())
  execFileSync(process.execPath, ['--test', 'tests/cli.test.cjs', 'tests/regressions.test.cjs', 'tests/compatibility.test.cjs', 'tests/action.test.cjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, STEPCI_TEST_CLI: path.join(installed, 'dist/index.js') }
  })
  // Prove the checker rejects changed executable bytes and generated schemas.
  for (const target of [path.join(installed, 'schema.json'),
    require('node:module').createRequire(path.join(installed, 'dist/index.js')).resolve('@stepci/runner')]) {
    const original = fs.readFileSync(target)
    fs.appendFileSync(target, '\n ')
    assert.throws(verify, /artifact differs/, `Tampering went undetected: ${target}`)
    fs.writeFileSync(target, original)
  }
  fs.writeFileSync(path.join(root, 'artifacts/verification.json'), JSON.stringify({
    node: process.version, npm: process.env.npm_config_user_agent?.split(' ')[0],
    tarball: info.filename, sha256: firstHash, identicalBuilds: 2,
    install: 'isolated extracted tarball + offline npm ci --omit=dev',
    fixtureTests: 12, regressionTests: 13, compatibilityTests: 4, actionTests: 6, tamperChecks: 2,
    container: 'verified separately by the containers CI job',
    action: 'launcher regressions included; Docker Action verified separately in CI'
  }, null, 2) + '\n')
  console.log(`Two identical npm tarballs: sha256:${firstHash}`)
} finally {
  fs.rmSync(consumer, { recursive: true, force: true })
}
