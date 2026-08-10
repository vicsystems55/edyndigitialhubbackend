import { app } from './app.js'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`${env.APP_NAME} listening on http://0.0.0.0:${env.PORT}`)
})

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down gracefully.`)

  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })

  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
