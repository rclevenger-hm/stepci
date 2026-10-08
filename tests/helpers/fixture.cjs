const http = require('node:http')
const { once } = require('node:events')
const TOKEN = 'stepci-fixture-token-not-a-real-credential'

async function startFixture() {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization })
    if (request.url === '/slow') return // The CLI's request timeout must end this.
    if (request.url === '/disconnect') return request.socket.destroy()
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/auth') {
      response.statusCode = request.headers.authorization === `Bearer ${TOKEN}` ? 200 : 401
      return response.end(JSON.stringify({ authenticated: response.statusCode === 200 }))
    }
    if (request.url === '/broken') {
      response.statusCode = 503
      return response.end(JSON.stringify({ status: 'broken' }))
    }
    if (request.url === '/echo-secret') return response.end(JSON.stringify({ token: TOKEN }))
    if (request.url !== '/health') {
      response.statusCode = 404
      return response.end(JSON.stringify({ error: 'not found' }))
    }
    response.end(JSON.stringify({ name: 'Widget', status: 'healthy', items: [] }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    url: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise(resolve => {
      server.close(resolve)
      server.closeAllConnections()
    })
  }
}
module.exports = { startFixture, TOKEN }
