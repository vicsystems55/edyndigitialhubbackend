import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFound } from './middleware/error-handler.js'
import { requestId } from './middleware/request-id.js'
import { apiRouter } from './routes/index.js'

export const app = express()

function isAllowedOrigin(origin: string | undefined) {
  if (!origin || env.CORS_ORIGINS.includes(origin)) return true

  if (env.NODE_ENV !== 'production') {
    try {
      const url = new URL(origin)
      return ['localhost', '127.0.0.1'].includes(url.hostname)
        && ['http:', 'https:'].includes(url.protocol)
    } catch {
      return false
    }
  }

  return false
}

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(requestId)
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true)
    callback(new Error('Origin is not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
}))

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}))

// The Paystack webhook will be mounted before express.json() so its raw body
// remains available for HMAC SHA-512 signature verification.
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '100kb' }))

app.get('/', (_request, response) => {
  response.json({
    success: true,
    data: {
      name: env.APP_NAME,
      documentation: `${env.API_PREFIX}/health`,
    },
  })
})

app.use(env.API_PREFIX, apiRouter)
app.use(notFound)
app.use(errorHandler)
