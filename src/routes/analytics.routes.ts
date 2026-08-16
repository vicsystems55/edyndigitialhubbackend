import { createHmac } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'

export const analyticsRouter = Router()

const viewLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false })
const viewSchema = z.object({
  path: z.string().trim().startsWith('/').max(300),
  sessionId: z.string().trim().min(8).max(100).optional(),
  referrer: z.string().trim().max(500).optional(),
})

analyticsRouter.post('/view', viewLimiter, async (request, response, next) => {
  try {
    const parsed = viewSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Invalid page-view data')
    if (parsed.data.path.startsWith('/admin')) return response.status(204).send()

    const fingerprint = `${parsed.data.sessionId || ''}:${request.ip || ''}`
    const sessionHash = createHmac('sha256', env.DOWNLOAD_TOKEN_SECRET).update(fingerprint).digest('hex')
    await prisma.pageView.create({
      data: {
        path: parsed.data.path,
        sessionHash,
        referrer: parsed.data.referrer || null,
        userAgent: request.get('user-agent')?.slice(0, 500) || null,
      },
    })
    response.status(201).json({ success: true })
  } catch (error) { next(error) }
})
