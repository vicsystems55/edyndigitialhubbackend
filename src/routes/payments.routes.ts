import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { ApiError } from '../middleware/error-handler.js'
import { initializePaystackTransaction, verifyPaystackTransaction } from '../services/paystack.js'
import { recordSuccessfulPayment } from '../services/orders.js'
import { ensureDownloadGrantForOrder } from '../services/download-grants.js'

export const paymentsRouter = Router()

const initializeSchema = z.object({
  bookSlug: z.string().min(1).max(100),
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.email().transform((value) => value.trim().toLowerCase()),
})

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

paymentsRouter.post('/initialize', paymentLimiter, async (request, response, next) => {
  let orderId: string | undefined

  try {
    const parsed = initializeSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'Enter a valid name and email address')

    const book = await prisma.book.findUnique({ where: { slug: parsed.data.bookSlug } })
    if (!book || book.status !== 'PUBLISHED') throw new ApiError(404, 'Publication was not found')
    if (!book.purchasesEnabled || !book.priceMinor || book.priceMinor < 1) {
      throw new ApiError(409, 'This publication is not currently available for online purchase')
    }

    const reference = `EDYN-${Date.now()}-${randomBytes(6).toString('hex')}`
    const order = await prisma.order.create({
      data: {
        reference,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        bookId: book.id,
        amountMinor: book.priceMinor,
        currency: book.currency,
      },
    })
    orderId = order.id

    const transaction = await initializePaystackTransaction({
      email: order.customerEmail,
      amount: order.amountMinor,
      currency: order.currency,
      reference: order.reference,
      customerName: order.customerName || parsed.data.customerName,
      orderId: order.id,
      bookSlug: book.slug,
    })

    response.status(201).json({
      success: true,
      data: {
        authorizationUrl: transaction.authorization_url,
        accessCode: transaction.access_code,
        reference: order.reference,
      },
    })
  } catch (error) {
    if (orderId) {
      await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } }).catch(() => undefined)
    }
    next(error)
  }
})

paymentsRouter.get('/verify/:reference', async (request, response, next) => {
  try {
    const reference = request.params.reference
    const order = await prisma.order.findUnique({
      where: { reference },
      include: { book: { select: { slug: true, title: true, downloadsEnabled: true } } },
    })
    if (!order) throw new ApiError(404, 'Order was not found')

    if (order.status !== 'PAID') {
      const transaction = await verifyPaystackTransaction(reference)
      await recordSuccessfulPayment(
        order,
        transaction,
        `verify:${reference}:${String(transaction.id)}`,
        'transaction.verify',
        transaction,
      )
    }

    const currentOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    const downloadAccess = currentOrder.status === 'PAID'
      ? await ensureDownloadGrantForOrder(currentOrder.id)
      : null
    response.json({
      success: true,
      data: {
        reference: currentOrder.reference,
        status: currentOrder.status,
        amountMinor: currentOrder.amountMinor,
        currency: currentOrder.currency,
        customerEmail: currentOrder.customerEmail,
        book: order.book,
        downloadPath: downloadAccess ? `${env.API_PREFIX}/downloads/${downloadAccess.token}` : null,
      },
    })
  } catch (error) {
    next(error)
  }
})
