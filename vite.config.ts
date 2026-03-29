import type { IncomingMessage } from 'node:http'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { saveBorderRegionsDocument } from './server/borderRegionsDb'

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
            await saveBorderRegionsDocument(parsed)
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
