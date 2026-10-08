// Test guard, not a sandbox for untrusted workflows. Record attempts even when
// a dependency catches the error. Tests fail if any non-loopback TCP is tried.
const net = require('node:net')
const fs = require('node:fs')
const original = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const [options] = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args)
  if (options.host !== '127.0.0.1' || options.path) {
    fs.appendFileSync(process.env.STEPCI_TEST_NETWORK_LOG, 'Non-loopback connection attempted\n')
    throw new Error('Fixture suite only permits TCP to 127.0.0.1')
  }
  return original.apply(this, args)
}
