import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { createServer } from 'https'
import { dirname, join } from 'path'
import { parse } from 'url'
import { fileURLToPath } from 'url'
import next from 'next'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const certDir = join(root, 'certs')
const keyPath = join(certDir, 'dev-key.pem')
const certPath = join(certDir, 'dev-cert.pem')

if (!existsSync(certPath) || !existsSync(keyPath)) {
  mkdirSync(certDir, { recursive: true })
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 365 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
    { stdio: 'inherit' },
  )
}

const app = next({ dev: true, dir: root })
const handle = app.getRequestHandler()
await app.prepare()

createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (request, response) => {
    const parsed = parse(request.url ?? '/', true)
    handle(request, response, parsed)
  },
).listen(3443, '0.0.0.0', () => {
  console.log('Chess Hall HTTPS dev server at https://localhost:3443')
  console.log('Quest Browser needs a trusted certificate. Tunnel this port, for example:')
  console.log('  npx localtunnel --port 3000   (if you use yarn dev)')
  console.log('  or a cloudflared tunnel pointed at https://localhost:3443')
})
