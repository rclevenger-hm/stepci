const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { sha256 } = require('./provenance.cjs')
const docker = args => execFileSync('docker', args, { encoding: 'utf8' }).trim()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stepci-images-'))
const containers = []
function snapshot(root, directory = '') {
  return Object.fromEntries(fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
      const name = directory ? `${directory}/${entry.name}` : entry.name
      const file = path.join(root, name)
      const stat = fs.lstatSync(file)
      const record = [name, { type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'link' : 'file',
        content: entry.isDirectory() ? null : entry.isSymbolicLink() ? fs.readlinkSync(file) : sha256(file),
        mode: stat.mode, mtime: stat.mtimeMs }]
      return entry.isDirectory() ? [record, ...Object.entries(snapshot(root, name))] : [record]
    }))
}
try {
  const snapshots = [], images = []
  for (const [index, name] of ['stepci:dev-test', 'stepci:dev-repeat'].entries()) {
    images.push(JSON.parse(docker(['image', 'inspect', name]))[0])
    const id = docker(['create', name]); containers.push(id)
    const destination = path.join(temp, String(index)); fs.mkdirSync(destination)
    docker(['cp', `${id}:/app/.`, destination])
    snapshots.push(snapshot(destination))
  }
  const content = records => Object.fromEntries(Object.entries(records).map(([name, record]) =>
    [name, { type: record.type, content: record.content, mode: record.mode }]))
  const contentEqual = JSON.stringify(content(snapshots[0])) === JSON.stringify(content(snapshots[1]))
  const mtimeChanges = Object.keys(snapshots[0]).filter(name => snapshots[0][name].mtime !== snapshots[1][name]?.mtime)
  const identicalImage = images[0].Id === images[1].Id
  const report = { images: images.map(image => ({ id: image.Id, created: image.Created, layers: image.RootFS.Layers })),
    applicationContentEqual: contentEqual, identicalImage, mtimeDifferenceCount: mtimeChanges.length,
    mtimeExamples: mtimeChanges.slice(0, 20),
    conclusion: identicalImage ? 'Identical image IDs for these two builds.'
      : 'Image IDs differ. Application content and file timestamp differences are recorded separately; bit-for-bit image reproducibility is not claimed.' }
  fs.mkdirSync('artifacts', { recursive: true })
  fs.writeFileSync('artifacts/image-comparison.json', JSON.stringify(report, null, 2) + '\n')
  assert.ok(contentEqual, 'Application bytes or modes differ between clean image builds')
  console.log(JSON.stringify(report, null, 2))
} finally {
  for (const id of containers) docker(['rm', id])
  fs.rmSync(temp, { recursive: true, force: true })
}
