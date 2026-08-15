import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'
import { recordSuccessfulPayment } from '../services/orders.js'

const eventSchema = z.object({
  event: z.string(),
  data: z.object({
    id: z.union([z.number(), z.string()]),
    status: z.string(),
    reference: z.string(),
    amount: z.number(),
    currency: z.string(),
    paid_at: z.string().nullable().optional(),
  }).passthrough(),
}).passthrough()

export async function paystackWebhook(request: Request, response: Response, next: NextFunction) {
  try {
    if (!Buffer.isBuffer(request.body)) throw new ApiError(400, 'Webhook body must be raw')

    const suppliedSignature = request.get('x-paystack-signature') || ''
    const expectedSignature = createHmac('sha512', env.PAYSTACK_SECRET_KEY)
      .update(request.body)
      .digest('hex')
    const supplied = Buffer.from(suppliedSignature, 'utf8')
    const expected = Buffer.from(expectedSignature, 'utf8')

    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new ApiError(401, 'Invalid Paystack signature')
    }

    const parsed = eventSchema.safeParse(JSON.parse(request.body.toString('utf8')))
    if (!parsed.success) throw new ApiError(400, 'Invalid Paystack event')

    if (parsed.data.event === 'charge.success') {
      const order = await prisma.order.findUnique({ where: { reference: parsed.data.data.reference } })
      if (order) {
        await recordSuccessfulPayment(
          order,
          parsed.data.data,
          `webhook:${parsed.data.event}:${String(parsed.data.data.id)}`,
          parsed.data.event,
          parsed.data,
        )
      }
    }

    response.sendStatus(200)
  } catch (error) {
    next(error)
  }
}
