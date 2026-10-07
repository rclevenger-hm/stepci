// Keep package-lock.json as the sole source lock. Only the disposable package
// staging directory gets npm-shrinkwrap.json, which npm includes and honors.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'stepci-pack-'))
const output = path.join(root, 'artifacts')
fs.mkdirSync(output, { recursive: true })
try {
  execFileSync(process.execPath, [path.join(__dirname, 'provenance.cjs'), 'verify'], { stdio: 'inherit' })
  for (const file of ['dist', 'schema.json', 'package.json', 'README.md', 'LICENSE',
    'scripts/provenance.cjs', 'docs/maintainers']) {
    fs.cpSync(path.join(root, file), path.join(stage, file), { recursive: true })
  }
  fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(stage, 'npm-shrinkwrap.json'))
  const packed = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath,
    'pack', '--ignore-scripts', '--json', '--pack-destination', output], {
    cwd: stage, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']
  }))[0]
  fs.writeFileSync(path.join(output, 'package-info.json'), JSON.stringify(packed, null, 2) + '\n')
  console.log(`Created artifacts/${packed.filename} (not published)`)
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
}
