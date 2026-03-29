import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage } from 'node:http'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const borderRegionsFile = path.resolve(
  __dirname,
  'public/map/thgl-data/border-regions.json'
)

function readReqBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'save-border-regions-dev',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url?.split('?')[0] ?? ''
          if (!url.endsWith('__save/border-regions') || req.method !== 'POST') {
            next()
            return
          }
          try {
            const raw = await readReqBody(req)
            const parsed = JSON.parse(raw) as unknown
            fs.writeFileSync(
              borderRegionsFile,
              JSON.stringify(parsed, null, 2),
              'utf8'
            )
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/plain')
            res.end('ok')
          } catch {
            res.statusCode = 500
            res.end('error')
          }
        })
      },
    },
  ],
})
